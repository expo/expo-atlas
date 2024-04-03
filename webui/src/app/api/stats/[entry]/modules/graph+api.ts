import { statsModuleFiltersFromUrlParams } from '~/components/forms/StatsModuleFilter';
import { getSource } from '~/utils/atlas';
import { globFilterModules } from '~/utils/search';
import { type TreemapNode, createModuleTree, finalizeModuleTree } from '~/utils/treemap';
import type { StatsEntry, StatsModule } from '~core/data/types';

export type ModuleGraphResponse = {
  data: TreemapNode;
  entry: {
    platform: 'android' | 'ios' | 'web';
    moduleSize: number;
    moduleFiles: number;
  };
  filtered: {
    moduleSize: number;
    moduleFiles: number;
  };
};

export async function GET(request: Request, params: Record<'entry', string>) {
  let entry: StatsEntry;

  try {
    entry = await getSource().getEntry(params.entry);
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 406 });
  }

  const allModules = Array.from(entry.modules.values());
  const modules = modulesMatchingFilters(request, entry, allModules);
  const tree = createModuleTree(modules);

  const response: ModuleGraphResponse = {
    data: finalizeModuleTree(tree),
    entry: {
      platform: entry.platform as any,
      moduleSize: allModules.reduce((size, module) => size + module.size, 0),
      moduleFiles: entry.modules.size,
    },
    filtered: {
      moduleSize: modules.reduce((size, module) => size + module.size, 0),
      moduleFiles: modules.length,
    },
  };

  return Response.json(response);
}

/**
 * Get and filter the modules from the stats entry based on query parameters.
 *   - `modules=project,node_modules` to show only project code and/or node_modules
 *   - `include=<glob>` to only include specific glob patterns
 *   - `exclude=<glob>` to only exclude specific glob patterns
 *   - `path=<folder>` to only show modules in a specific folder
 */
function modulesMatchingFilters(
  request: Request,
  entry: StatsEntry,
  modules: StatsModule[]
): StatsModule[] {
  const searchParams = new URL(request.url).searchParams;

  const folderRef = searchParams.get('path');
  if (folderRef) {
    modules = modules.filter((module) => module.path.startsWith(folderRef));
  }

  const filters = statsModuleFiltersFromUrlParams(searchParams);
  if (!filters.modules.includes('node_modules')) {
    modules = modules.filter((module) => !module.package);
  }

  return globFilterModules(modules, entry.projectRoot, filters);
}