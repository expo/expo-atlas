/**
 * Type definitions for the Atlas stats export format.
 *
 * The stats file (`.expo/atlas-stats.json`) is a lightweight CI-friendly version of
 * the full atlas.jsonl output. It contains package-level size aggregations optimized
 * for diffing and scripting in CI/CD workflows.
 *
 * @example
 * ```json
 * [
 *   {
 *     "platform": "ios",
 *     "environment": "client",
 *     "entryPoint": "/path/to/app/index.js",
 *     "bundleSize": 2458624,
 *     "packages": {
 *       "react": 85234,
 *       "react-native": 456789,
 *       "expo": 123456,
 *       "@company/ui-lib": 234567
 *     },
 *     "files": {
 *       "app/components/Button.tsx": 2345,
 *       "app/screens/HomeScreen.tsx": 5678,
 *       "app/utils/helpers.ts": 1234
 *     },
 *     "assets": {
 *       "assets/images/logo.png": 12345,
 *       "assets/fonts/custom.ttf": 23456
 *     }
 *   }
 * ]
 * ```
 */

/**
 * Root type for the atlas-stats.json file.
 * Contains an array of bundle stats, one per bundle in the export.
 */
export type AtlasStatsFile = AtlasStatsBundle[];

/**
 * Stats for a single bundle, containing package-level size aggregations.
 *
 * Each bundle in the export (e.g., iOS, Android, different environments)
 * gets its own stats entry with metadata and package size totals.
 */
export type AtlasStatsBundle = {
  /**
   * Target platform for this bundle.
   * Matches the platform specified in Metro's serialization options.
   */
  platform: 'ios' | 'android' | 'web' | 'unknown';

  /**
   * Runtime environment for this bundle.
   * - "client": Standard React Native client bundle
   * - "node": Server-side bundle for Node.js environments
   * - "react-server": React Server Components bundle
   * - "dom": DOM-based web bundle
   */
  environment: 'client' | 'node' | 'react-server' | 'dom';

  /**
   * Absolute path to the bundle's entry point file.
   * This is the starting file from which Metro builds the dependency graph.
   */
  entryPoint: string;

  /**
   * Total size of the entire bundle in bytes (transformed output).
   * This equals the sum of all package sizes, files, and assets.
   */
  bundleSize: number;

  /**
   * Package-level size aggregations for external dependencies.
   *
   * Maps each NPM package to its total size in bytes.
   * Sizes represent transformed/bundled output after Metro processing.
   *
   * Package names are sorted alphabetically for diff-friendly output.
   *
   * @example
   * ```json
   * {
   *   "@babel/runtime": 12345,
   *   "expo": 123456,
   *   "react": 85234,
   *   "react-native": 456789
   * }
   * ```
   */
  packages: Record<string, number>;

  /**
   * Individual app source files with their sizes.
   *
   * Maps relative file paths (from project root) to their size in bytes.
   * Only includes JavaScript/TypeScript source files from your app code.
   *
   * Paths are sorted alphabetically for diff-friendly output.
   *
   * @example
   * ```json
   * {
   *   "app/components/Button.tsx": 2345,
   *   "app/screens/HomeScreen.tsx": 5678,
   *   "app/utils/helpers.ts": 1234
   * }
   * ```
   */
  files: Record<string, number>;

  /**
   * Asset files (images, fonts, etc.) with their sizes.
   *
   * Maps relative asset paths to their size in bytes.
   * Includes common asset types: png, jpg, gif, svg, ttf, otf, woff, etc.
   *
   * Paths are sorted alphabetically for diff-friendly output.
   *
   * @example
   * ```json
   * {
   *   "assets/images/logo.png": 12345,
   *   "assets/fonts/custom-font.ttf": 23456
   * }
   * ```
   */
  assets: Record<string, number>;
};
