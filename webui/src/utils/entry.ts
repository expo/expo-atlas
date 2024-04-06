import { PartialAtlasEntry } from '~core/data/types';

/**
 * Translate an absolute path to a relative path, based on the entry's project root.
 * This is a simple replace operation.
 */
export function relativeEntryPath(entry: Pick<PartialAtlasEntry, 'projectRoot'>, path: string) {
  return path.replace(entry.projectRoot + '/', '');
}