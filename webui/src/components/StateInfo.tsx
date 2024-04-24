import { type PropsWithChildren } from 'react';

import { Spinner } from '~/ui/Spinner';

type StateInfoProps = PropsWithChildren<{
  title?: string;
}>;

export function StateInfo(props: StateInfoProps) {
  return (
    <div className="flex flex-1 justify-center items-center">
      {!!props.title && <h2 className="text-lg font-bold m-4">{props.title}</h2>}
      <p>{props.children}</p>
    </div>
  );
}

export function LoadingState() {
  return (
    <StateInfo>
      <Spinner />
    </StateInfo>
  );
}

export function DataErrorState({
  title = 'Failed to load data.',
  children = 'Try restarting Expo Atlas. If this error keeps happening, open a bug report.',
}: Partial<StateInfoProps>) {
  return <StateInfo title={title}>{children}</StateInfo>;
}

export function NoDataState({
  title = 'No data available.',
  children = 'Try another bundle, or try inspecting a different path.',
}: Partial<StateInfoProps>) {
  return <StateInfo title={title}>{children}</StateInfo>;
}

export function NoDataWithFiltersState({
  title = 'No data matching filters.',
  children = 'Try adjusting or clearing the filters.',
}: Partial<StateInfoProps>) {
  return <StateInfo title={title}>{children}</StateInfo>;
}
