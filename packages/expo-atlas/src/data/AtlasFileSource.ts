import assert from 'assert';
import fs from 'fs';
import path from 'path';

import type { AtlasStatsBundle } from './stats-types';
import type { PartialAtlasBundle, AtlasBundle, AtlasSource, AtlasModule } from './types';
import { name, version } from '../../package.json';
import { env } from '../utils/env';
import { AtlasValidationError } from '../utils/errors';
import { appendJsonLine, forEachJsonLines, parseJsonLine } from '../utils/jsonl';

export type AtlasMetadata = { name: string; version: string };

export class AtlasFileSource implements AtlasSource {
  constructor(public readonly filePath: string) {
    //
  }

  listBundles() {
    return listAtlasEntries(this.filePath);
  }

  getBundle(id: string) {
    const numeric = parseInt(id, 10);
    assert(!Number.isNaN(numeric) && numeric > 1, `Invalid entry ID: ${id}`);
    return readAtlasEntry(this.filePath, Number(id));
  }

  hasHmrSupport() {
    return false;
  }

  getBundleHmr() {
    return null;
  }
}

/**
 * List all entries without parsing the data.
 * This only reads the bundle name, and adds a line number as ID.
 *
 * @note Ensure the (de)serialization is in sync with both {@link readAtlasEntry} and {@link writeAtlasEntry}.
 */
export async function listAtlasEntries(filePath: string) {
  const bundlePattern = /^\["([^"]+)","([^"]+)","([^"]+)","([^"]+)","([^"]+)"/;
  const entries: PartialAtlasBundle[] = [];

  await forEachJsonLines(filePath, (contents, line) => {
    // Skip the metadata line
    if (line === 1) return;

    const [_, platform, projectRoot, sharedRoot, entryPoint, environment] =
      contents.match(bundlePattern) ?? [];
    if (platform && projectRoot && sharedRoot && entryPoint && environment) {
      entries.push({
        id: String(line),
        platform: platform as any,
        environment: environment as any,
        projectRoot,
        sharedRoot,
        entryPoint,
      });
    }
  });

  return entries;
}

/**
 * Get the entry by id or line number, and parse the data.
 *
 * @note Ensure the (de)serialization is in sync with both {@link listAtlasEntries} and {@link writeAtlasEntry}.
 */
export async function readAtlasEntry(filePath: string, id: number): Promise<AtlasBundle> {
  const atlasEntry = await parseJsonLine<any[]>(filePath, id);
  return {
    id: String(id),
    // These values are all strings
    platform: atlasEntry[0],
    projectRoot: atlasEntry[1],
    sharedRoot: atlasEntry[2],
    entryPoint: atlasEntry[3],
    environment: atlasEntry[4],
    // These values are more complex
    runtimeModules: atlasEntry[5],
    modules: new Map(atlasEntry[6].map((module: AtlasModule) => [module.absolutePath, module])),
    transformOptions: atlasEntry[7],
    serializeOptions: atlasEntry[8],
  };
}

/** Simple promise to avoid mixing appended data */
let writeQueue: Promise<any> = Promise.resolve();

/** In-memory accumulator for bundle stats, keyed by bundle ID for deduplication */
const statsAccumulator: Map<string, AtlasStatsBundle> = new Map();
let statsFilePath: string | null = null;
let finalizationScheduled = false;

/**
 * Wait until the Atlas file has all data written.
 * Note, this is a workaround whenever `process.exit` is required, avoid if possible.
 * @internal
 */
export function waitUntilAtlasFileReady() {
  return writeQueue;
}

/**
 * Add a new entry to the Atlas file.
 * This function also ensures the Atlas file is ready to be written to, due to complications with Expo CLI.
 * Eventually, the entry is appended on a new line, so we can load them selectively.
 *
 * @note Ensure the (de)serialization is in sync with both {@link listAtlasEntries} and {@link readAtlasEntry}.
 */
export function writeAtlasEntry(filePath: string, entry: AtlasBundle) {
  const line = [
    // These values must all be strings, and are available in PartialAtlasBundle type when listing bundles
    entry.platform,
    entry.projectRoot,
    entry.sharedRoot,
    entry.entryPoint,
    entry.environment,
    // These values can be more complex, but are not available in PartialAtlasBundle type when listing bundles
    entry.runtimeModules,
    Array.from(entry.modules.values()),
    entry.transformOptions,
    entry.serializeOptions,
  ];

  writeQueue = writeQueue.then(() => appendJsonLine(filePath, line));

  return writeQueue;
}

/** The default location of the metro file */
export function getAtlasPath(projectRoot: string) {
  return path.join(projectRoot, '.expo/atlas.jsonl');
}

/** The information to validate if a file is compatible with this library version */
export function getAtlasMetdata(): AtlasMetadata {
  return { name, version };
}

/** Validate if the file is compatible with this library version */
export async function validateAtlasFile(filePath: string, metadata = getAtlasMetdata()) {
  if (!fs.existsSync(filePath)) {
    throw new AtlasValidationError('ATLAS_FILE_NOT_FOUND', filePath);
  }

  if (env.EXPO_ATLAS_NO_VALIDATION) {
    return;
  }

  const data = await parseJsonLine(filePath, 1);

  if (data.name !== metadata.name || data.version !== metadata.version) {
    throw new AtlasValidationError('ATLAS_FILE_INCOMPATIBLE', filePath, data.version);
  }
}

/**
 * Create or overwrite the file with basic metadata.
 * This metdata is used by the API to determine version compatibility.
 */
export async function createAtlasFile(filePath: string) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.rm(filePath, { force: true });
  await appendJsonLine(filePath, getAtlasMetdata());
}

/**
 * Ensure the .expo directory exists for Atlas files.
 *
 * @param projectRoot - The root directory of the project
 */
export async function ensureExpoDirExists(projectRoot: string) {
  await fs.promises.mkdir(path.join(projectRoot, '.expo'), { recursive: true });
}

/**
 * Create the Atlas file if it doesn't exist, or recreate it if it's incompatible.
 *
 * @param filePath - Path to the atlas.jsonl file
 */
export async function ensureAtlasFileExist(filePath: string) {
  try {
    await validateAtlasFile(filePath);
  } catch (error: any) {
    if (error.code === 'ATLAS_FILE_NOT_FOUND' || error.code === 'ATLAS_FILE_INCOMPATIBLE') {
      await createAtlasFile(filePath);
      return false;
    }

    throw error;
  }

  return true;
}

/**
 * Asset file extensions to separate from app files
 */
const ASSET_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'webp',
  'bmp',
  'ttf',
  'otf',
  'woff',
  'woff2',
  'mp4',
  'webm',
  'mp3',
  'wav',
]);

/**
 * Check if a file path is an asset based on extension
 */
function isAsset(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase();
  return ext ? ASSET_EXTENSIONS.has(ext) : false;
}

/**
 * Convert an AtlasBundle to compact stats format for CI analysis.
 * Separates packages, app files, and assets for detailed analysis.
 */
function convertBundleToStats(bundle: AtlasBundle): AtlasStatsBundle {
  const packages: Record<string, number> = {};
  const files: Record<string, number> = {};
  const assets: Record<string, number> = {};

  // Helper to categorize and store module size
  const addModuleSize = (module: AtlasModule) => {
    if (module.package) {
      // External package
      packages[module.package] = (packages[module.package] ?? 0) + module.size;
    } else {
      // App code - check if it's an asset or source file
      const relativePath = module.relativePath;
      if (isAsset(relativePath)) {
        assets[relativePath] = module.size;
      } else {
        files[relativePath] = module.size;
      }
    }
  };

  // Process regular modules
  for (const module of Array.from(bundle.modules.values())) {
    addModuleSize(module);
  }

  // Process runtime modules (Metro polyfills)
  for (const module of bundle.runtimeModules) {
    addModuleSize(module);
  }

  // Calculate total bundle size
  const bundleSize =
    Object.values(packages).reduce((sum, size) => sum + size, 0) +
    Object.values(files).reduce((sum, size) => sum + size, 0) +
    Object.values(assets).reduce((sum, size) => sum + size, 0);

  // Sort all keys alphabetically for diff-friendly output
  const sortRecord = (record: Record<string, number>): Record<string, number> => {
    const sorted: Record<string, number> = {};
    Object.keys(record)
      .sort()
      .forEach((key) => {
        sorted[key] = record[key];
      });
    return sorted;
  };

  return {
    platform: bundle.platform,
    environment: bundle.environment,
    entryPoint: bundle.entryPoint,
    bundleSize,
    packages: sortRecord(packages),
    files: sortRecord(files),
    assets: sortRecord(assets),
  };
}

/**
 * Accumulate stats for a bundle. Call this for each bundle written to atlas.jsonl.
 * Stats are held in memory until finalizeAtlasStats() is called.
 * Auto-finalizes on process exit if not manually finalized.
 */
export function writeAtlasStatsEntry(filePath: string, entry: AtlasBundle): void {
  const statsBundle = convertBundleToStats(entry);
  // Use bundle ID as key to handle duplicate writes (last write wins)
  statsAccumulator.set(entry.id, statsBundle);

  // Store file path for auto-finalization
  statsFilePath = filePath;

  // Schedule auto-finalization on process exit (once)
  if (!finalizationScheduled && statsAccumulator.size > 0) {
    finalizationScheduled = true;

    // Use beforeExit which allows async operations
    process.once('beforeExit', async () => {
      if (statsAccumulator.size > 0 && statsFilePath) {
        try {
          await finalizeAtlasStats(statsFilePath);
        } catch (error) {
          // Silently fail to avoid breaking the build
          console.error('Failed to finalize atlas stats:', error);
        }
      }
    });
  }
}

/**
 * Write accumulated stats to disk as a single JSON file.
 * Call this after all bundles are processed (e.g., at end of Metro export).
 */
export function finalizeAtlasStats(filePath: string): Promise<void> {
  const bundles = Array.from(statsAccumulator.values());

  // Sort bundles for consistent, diff-friendly output
  bundles.sort((a, b) => {
    if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
    if (a.environment !== b.environment) return a.environment.localeCompare(b.environment);
    return a.entryPoint.localeCompare(b.entryPoint);
  });

  const statsPath = filePath.replace(/atlas\.jsonl$/, 'atlas-stats.json');

  // Queue the write operation using existing pattern
  writeQueue = writeQueue.then(async () => {
    const content = JSON.stringify(bundles, null, 2) + '\n';
    await fs.promises.writeFile(statsPath, content, 'utf-8');
  });

  // Clear accumulator after successful write
  writeQueue = writeQueue.then(() => {
    statsAccumulator.clear();
    finalizationScheduled = false; // Reset flag after finalization
  });

  return writeQueue;
}

/**
 * Get the default stats file path for a project.
 */
export function getAtlasStatsPath(projectRoot: string): string {
  return path.join(projectRoot, '.expo/atlas-stats.json');
}
