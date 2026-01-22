import { type MetroConfig } from 'metro-config';

import {
  createAtlasFile,
  ensureAtlasFileExist,
  ensureExpoDirExists,
  finalizeAtlasStats,
  getAtlasPath,
  getAtlasStatsPath,
  writeAtlasEntry,
  writeAtlasStatsEntry,
} from './data/AtlasFileSource';
import { convertGraph, convertMetroConfig } from './data/MetroGraphSource';
import { env } from './utils/env';

export { waitUntilAtlasFileReady } from './data/AtlasFileSource';

type ExpoAtlasOptions = Partial<{
  /** The output of the atlas file, defaults to `.expo/atlas.json` */
  atlasFile: string;
  /**
   * Only generate the lightweight atlas-stats.json file, skip the full atlas.jsonl.
   * Can also be enabled via EXPO_ATLAS_STATS_ONLY=true environment variable.
   * @default false
   */
  statsOnly: boolean;
}>;

/**
 * Initialize Expo Atlas to gather statistics from Metro when exporting bundles.
 * This function adds the required Metro config, and should be the last config mutation.
 *
 * @example ```js
 *   // Learn more https://docs.expo.dev/guides/customizing-metro
 *   const { getDefaultConfig } = require('expo/metro-config')
 *   const { withExpoAtlas } = require('expo-atlas/metro')
 *
 *   const config = getDefaultConfig(__dirname)
 *
 *   // Make more changes
 *
 *   module.exports = withExpoAtlas(config)
 * ```
 *
 * @example Stats-only mode:
 * ```js
 *   module.exports = withExpoAtlas(config, { statsOnly: true })
 * ```
 * Or via environment variable:
 * ```bash
 *   EXPO_ATLAS_STATS_ONLY=true npx expo export
 * ```
 */
export function withExpoAtlas(config: MetroConfig, options: ExpoAtlasOptions = {}) {
  const projectRoot = config.projectRoot;
  const originalSerializer = config.serializer?.customSerializer ?? (() => {});

  if (!projectRoot) {
    throw new Error('No "projectRoot" configured in Metro config.');
  }

  // Check both option and env var (option takes precedence)
  const statsOnly = options?.statsOnly ?? env.EXPO_ATLAS_STATS_ONLY;
  const atlasFile = options?.atlasFile ?? getAtlasPath(projectRoot);
  const metroConfig = convertMetroConfig(config);

  // Note(cedric): we don't have to await this, Metro would never bundle before this finishes
  ensureExpoDirExists(projectRoot);
  if (!statsOnly) {
    ensureAtlasFileExist(atlasFile);
  }

  // @ts-expect-error
  config.serializer.customSerializer = (entryPoint, preModules, graph, serializeOptions) => {
    const atlasBundle = convertGraph({
      projectRoot,
      entryPoint,
      preModules,
      graph,
      serializeOptions,
      metroConfig,
    });

    // Note(cedric): we don't have to await this, it has a built-in write queue
    if (!statsOnly) {
      writeAtlasEntry(atlasFile, atlasBundle);
    }
    writeAtlasStatsEntry(atlasFile, atlasBundle);

    return originalSerializer(entryPoint, preModules, graph, serializeOptions);
  };

  return config;
}

/**
 * Fully reset, or recreate, the Expo Atlas file containing all Metro information.
 * This method should only be called once per exporting session, to avoid overwriting data with mutliple Metro instances.
 *
 * @param projectRoot - The root directory of the project
 */
export async function resetExpoAtlasFile(projectRoot: string) {
  const filePath = getAtlasPath(projectRoot);
  await createAtlasFile(filePath);
  return filePath;
}

/**
 * Finalize and write the atlas-stats.json file.
 * Call this after all Metro bundles are exported.
 *
 * @example
 * ```ts
 * import { resetExpoAtlasFile, finalizeExpoAtlasStats } from 'expo-atlas/metro';
 *
 * // At start of export
 * await resetExpoAtlasFile(projectRoot);
 *
 * // ... Metro bundling happens ...
 *
 * // After export completes
 * const statsPath = await finalizeExpoAtlasStats(projectRoot);
 * console.log(`Stats written to: ${statsPath}`);
 * ```
 */
export async function finalizeExpoAtlasStats(projectRoot: string): Promise<string> {
  const atlasPath = getAtlasPath(projectRoot);
  await finalizeAtlasStats(atlasPath);
  return getAtlasStatsPath(projectRoot);
}
