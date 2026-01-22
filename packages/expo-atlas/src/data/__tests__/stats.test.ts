import { describe, expect, it } from 'bun:test';
import fs from 'fs';
import path from 'path';

import {
  getAtlasPath,
  getAtlasStatsPath,
  writeAtlasStatsEntry,
  finalizeAtlasStats,
} from '../AtlasFileSource';
import type { AtlasStatsFile } from '../stats-types';
import type { AtlasBundle, AtlasModule } from '../types';

describe('getAtlasStatsPath', () => {
  it('returns default path `<project>/.expo/atlas-stats.json`', () => {
    expect(getAtlasStatsPath('<project>')).toBe('<project>/.expo/atlas-stats.json');
  });
});

describe('writeAtlasStatsEntry', () => {
  it('accumulates stats for a single bundle', async () => {
    const projectRoot = createTestProject('stats-single');
    const file = getAtlasPath(projectRoot);
    const bundle = createMockBundle({
      id: '1',
      platform: 'ios',
      environment: 'client',
      entryPoint: '/path/to/app/index.js',
      modules: new Map([
        [
          '/path/to/app/App.tsx',
          createMockModule({ package: undefined, relativePath: 'App.tsx', size: 1000 }),
        ],
        [
          '/path/to/node_modules/react/index.js',
          createMockModule({ package: 'react', size: 2000 }),
        ],
      ]),
      runtimeModules: [createMockModule({ package: 'metro-runtime', size: 500 })],
    });

    writeAtlasStatsEntry(file, bundle);
    await finalizeAtlasStats(file);

    const stats = await readStatsFile(projectRoot);
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({
      platform: 'ios',
      environment: 'client',
      entryPoint: '/path/to/app/index.js',
      bundleSize: 3500,
      packages: {
        'metro-runtime': 500,
        react: 2000,
      },
      files: {
        'App.tsx': 1000,
      },
    });
  });

  it('aggregates multiple modules from same package', async () => {
    const projectRoot = createTestProject('stats-aggregated');
    const file = getAtlasPath(projectRoot);
    const bundle = createMockBundle({
      modules: new Map([
        ['/node_modules/react/index.js', createMockModule({ package: 'react', size: 1000 })],
        ['/node_modules/react/jsx-runtime.js', createMockModule({ package: 'react', size: 500 })],
        [
          '/node_modules/react/jsx-dev-runtime.js',
          createMockModule({ package: 'react', size: 300 }),
        ],
      ]),
    });

    writeAtlasStatsEntry(file, bundle);
    await finalizeAtlasStats(file);

    const stats = await readStatsFile(projectRoot);
    expect(stats[0].packages.react).toBe(1800);
  });

  it('includes runtime modules in aggregation', async () => {
    const projectRoot = createTestProject('stats-runtime');
    const file = getAtlasPath(projectRoot);
    const bundle = createMockBundle({
      modules: new Map([['/app/index.js', createMockModule({ package: undefined, size: 1000 })]]),
      runtimeModules: [
        createMockModule({ package: 'metro-runtime', size: 500 }),
        createMockModule({ package: 'metro-runtime', size: 300 }),
      ],
    });

    writeAtlasStatsEntry(file, bundle);
    await finalizeAtlasStats(file);

    const stats = await readStatsFile(projectRoot);
    expect(stats[0].packages['metro-runtime']).toBe(800);
  });

  it('sorts package names alphabetically', async () => {
    const projectRoot = createTestProject('stats-sorted');
    const file = getAtlasPath(projectRoot);
    const bundle = createMockBundle({
      modules: new Map([
        ['/node_modules/zebra/index.js', createMockModule({ package: 'zebra', size: 100 })],
        ['/node_modules/apple/index.js', createMockModule({ package: 'apple', size: 200 })],
        ['/node_modules/metro/index.js', createMockModule({ package: 'metro', size: 300 })],
        ['/app/index.js', createMockModule({ package: undefined, size: 400 })],
      ]),
    });

    writeAtlasStatsEntry(file, bundle);
    await finalizeAtlasStats(file);

    const stats = await readStatsFile(projectRoot);
    const packageNames = Object.keys(stats[0].packages);
    expect(packageNames).toEqual(['apple', 'metro', 'zebra']);
  });

  it('handles duplicate bundle IDs (last write wins)', async () => {
    const projectRoot = createTestProject('stats-duplicate');
    const file = getAtlasPath(projectRoot);
    const bundle1 = createMockBundle({
      id: '1',
      modules: new Map([['/app/v1.js', createMockModule({ package: undefined, size: 1000 })]]),
    });
    const bundle2 = createMockBundle({
      id: '1',
      modules: new Map([['/app/v2.js', createMockModule({ package: undefined, size: 2000 })]]),
    });

    writeAtlasStatsEntry(file, bundle1);
    writeAtlasStatsEntry(file, bundle2);
    await finalizeAtlasStats(file);

    const stats = await readStatsFile(projectRoot);
    expect(stats).toHaveLength(1);
    expect(stats[0].bundleSize).toBe(2000);
  });
});

describe('finalizeAtlasStats', () => {
  it('writes pretty-printed JSON to .expo/atlas-stats.json', async () => {
    const projectRoot = createTestProject('stats-pretty');
    const file = getAtlasPath(projectRoot);
    const bundle = createMockBundle({
      modules: new Map([['/app/index.js', createMockModule({ package: undefined, size: 1000 })]]),
    });

    writeAtlasStatsEntry(file, bundle);
    await finalizeAtlasStats(file);

    const statsPath = getAtlasStatsPath(projectRoot);
    const content = await fs.promises.readFile(statsPath, 'utf-8');

    // Check for pretty-printing (should have indentation)
    expect(content).toContain('\n  ');
    expect(content).toEndWith('\n');

    // Verify it's valid JSON
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it('sorts bundles by platform, environment, entryPoint', async () => {
    const projectRoot = createTestProject('stats-sorted-bundles');
    const file = getAtlasPath(projectRoot);

    // Add bundles in random order
    writeAtlasStatsEntry(
      file,
      createMockBundle({
        id: '1',
        platform: 'web',
        environment: 'client',
        entryPoint: '/app/web.js',
      })
    );
    writeAtlasStatsEntry(
      file,
      createMockBundle({
        id: '2',
        platform: 'ios',
        environment: 'node',
        entryPoint: '/app/server.js',
      })
    );
    writeAtlasStatsEntry(
      file,
      createMockBundle({
        id: '3',
        platform: 'ios',
        environment: 'client',
        entryPoint: '/app/main.js',
      })
    );
    writeAtlasStatsEntry(
      file,
      createMockBundle({
        id: '4',
        platform: 'android',
        environment: 'client',
        entryPoint: '/app/android.js',
      })
    );

    await finalizeAtlasStats(file);
    const stats = await readStatsFile(projectRoot);

    // Should be sorted by platform first
    expect(stats[0].platform).toBe('android');
    expect(stats[1].platform).toBe('ios');
    expect(stats[2].platform).toBe('ios');
    expect(stats[3].platform).toBe('web');

    // Within same platform, sorted by environment
    expect(stats[1].environment).toBe('client');
    expect(stats[2].environment).toBe('node');
  });

  it('handles empty accumulator gracefully (writes [])', async () => {
    const projectRoot = createTestProject('stats-empty');
    const file = getAtlasPath(projectRoot);

    await finalizeAtlasStats(file);

    const stats = await readStatsFile(projectRoot);
    expect(stats).toEqual([]);
  });

  it('handles empty bundle (no modules)', async () => {
    const projectRoot = createTestProject('stats-no-modules');
    const file = getAtlasPath(projectRoot);
    const bundle = createMockBundle({
      modules: new Map(),
      runtimeModules: [],
    });

    writeAtlasStatsEntry(file, bundle);
    await finalizeAtlasStats(file);

    const stats = await readStatsFile(projectRoot);
    expect(stats[0]).toMatchObject({
      bundleSize: 0,
      packages: {},
    });
  });

});

describe('integration', () => {
  it('writes multiple bundles and produces correct stats file', async () => {
    const projectRoot = createTestProject('stats-integration');
    const file = getAtlasPath(projectRoot);

    // Create iOS client bundle
    writeAtlasStatsEntry(
      file,
      createMockBundle({
        id: '1',
        platform: 'ios',
        environment: 'client',
        entryPoint: '/app/ios/index.js',
        modules: new Map([
          [
            '/app/App.tsx',
            createMockModule({ package: undefined, relativePath: 'App.tsx', size: 5000 }),
          ],
          ['/node_modules/react/index.js', createMockModule({ package: 'react', size: 85000 })],
          [
            '/node_modules/react-native/index.js',
            createMockModule({ package: 'react-native', size: 450000 }),
          ],
        ]),
      })
    );

    // Create Android client bundle
    writeAtlasStatsEntry(
      file,
      createMockBundle({
        id: '2',
        platform: 'android',
        environment: 'client',
        entryPoint: '/app/android/index.js',
        modules: new Map([
          [
            '/app/App.tsx',
            createMockModule({ package: undefined, relativePath: 'App.tsx', size: 5000 }),
          ],
          ['/node_modules/react/index.js', createMockModule({ package: 'react', size: 85000 })],
          [
            '/node_modules/react-native/index.js',
            createMockModule({ package: 'react-native', size: 460000 }),
          ],
        ]),
      })
    );

    await finalizeAtlasStats(file);

    const stats = await readStatsFile(projectRoot);
    expect(stats).toHaveLength(2);

    // Android should come first (alphabetical)
    expect(stats[0].platform).toBe('android');
    expect(stats[0].bundleSize).toBe(550000);
    expect(stats[0].packages).toMatchObject({
      react: 85000,
      'react-native': 460000,
    });
    expect(stats[0].files).toMatchObject({
      'App.tsx': 5000,
    });

    // iOS should come second
    expect(stats[1].platform).toBe('ios');
    expect(stats[1].bundleSize).toBe(540000);
    expect(stats[1].packages).toMatchObject({
      react: 85000,
      'react-native': 450000,
    });
    expect(stats[1].files).toMatchObject({
      'App.tsx': 5000,
    });
  });

  it('file size stays reasonable for realistic bundle', async () => {
    const projectRoot = createTestProject('stats-size-check');
    const file = getAtlasPath(projectRoot);
    const modules = new Map();

    // Create ~500 packages (realistic max)
    for (let i = 0; i < 500; i++) {
      modules.set(
        `/node_modules/package-${i}/index.js`,
        createMockModule({ package: `package-${i}`, size: 10000 })
      );
    }

    const bundle = createMockBundle({ modules });
    writeAtlasStatsEntry(file, bundle);
    await finalizeAtlasStats(file);

    const statsPath = getAtlasStatsPath(projectRoot);
    const stats = await fs.promises.stat(statsPath);

    // Should be under 100KB for 500 packages
    expect(stats.size).toBeLessThan(100 * 1024);
  });
});

// Helper functions

function createMockBundle(overrides: Partial<AtlasBundle> = {}): AtlasBundle {
  return {
    id: '1',
    platform: 'ios',
    environment: 'client',
    projectRoot: '/path/to/project',
    sharedRoot: '/path/to/project',
    entryPoint: '/path/to/project/index.js',
    runtimeModules: [],
    modules: new Map(),
    transformOptions: {},
    serializeOptions: {},
    ...overrides,
  };
}

function createMockModule(overrides: Partial<AtlasModule> = {}): AtlasModule {
  return {
    id: Math.random(),
    absolutePath: '/path/to/module.js',
    relativePath: 'module.js',
    size: 1000,
    imports: [],
    importedBy: [],
    ...overrides,
  };
}

async function readStatsFile(projectRoot: string): Promise<AtlasStatsFile> {
  const statsPath = getAtlasStatsPath(projectRoot);
  const content = await fs.promises.readFile(statsPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Create a temporary project root for testing
 */
function createTestProject(name: string): string {
  const projectRoot = path.join(__dirname, '__temp__', name);
  fs.mkdirSync(path.join(projectRoot, '.expo'), { recursive: true });
  return projectRoot;
}
