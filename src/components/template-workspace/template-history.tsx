// The open template's saved versions on the editor's RevisionList, newest first, the current one
// marked, each with who saved it when the host knows. A row's actions view a version read-only and
// restore one, which stages its settings as the draft once confirmed; Save stores them. A template
// never saved has no history yet.

import type { AvatarIdentity } from '@flamboyantengineer/ui-components/avatar';
import { EmptyState } from '@flamboyantengineer/ui-components/empty-state';
import { useEffect, useState } from 'react';
import type { TemplateStoreAdapter, TemplateVersion } from '../../host/adapters.js';
import { RevisionList } from '../document-panels/document-panels.js';
import { workspaceHooks } from './template-workspace-hooks.js';
import type { TemplateWorkspaceState } from './use-template-workspace.js';
import type { TemplateWorkspaceLabels } from './workspace-labels.js';

interface TemplateHistoryProps {
  readonly store: TemplateStoreAdapter;
  readonly workspace: TemplateWorkspaceState;
  readonly labels: TemplateWorkspaceLabels;
  /** Who saved a version, from the author id the store gives it. Defaults to the id as a name. */
  readonly personOf?: ((author: string) => AvatarIdentity | undefined) | undefined;
  /** Restores a version by revision, once unsaved changes are saved or discarded. */
  readonly onRestore: (revision: string) => Promise<unknown>;
}

// The template's versions, listed again after each save.
function useVersions(store: TemplateStoreAdapter, templateId: string, revision: string) {
  const [listed, setListed] = useState<{ key: string; versions: readonly TemplateVersion[] }>();
  const [error, setError] = useState<string | null>(null);
  const key = `${templateId}\n${revision}`;
  useEffect(() => {
    if (!revision) return;
    let current = true;
    void store.versions?.(templateId).then((result) => {
      if (!current) return;
      if (result.ok) setListed({ key, versions: result.value });
      setError(result.ok ? null : (result.error.message ?? result.error.kind));
    });
    return () => {
      current = false;
    };
  }, [store, key, templateId, revision]);
  return { versions: listed?.key === key ? listed.versions : null, error };
}

/** The open template's history; an empty state before its first save. */
export function TemplateHistory(props: TemplateHistoryProps) {
  const { store, workspace, labels } = props;
  const { open, viewing } = workspace;
  const saved = open?.saved;
  const { versions, error } = useVersions(store, open?.draft.id ?? '', saved?.revision ?? '');
  if (!open || !saved) {
    return (
      <div {...workspaceHooks.slot('history')}>
        <EmptyState size="sm" description={labels.noHistory} />
      </div>
    );
  }
  const personOf = props.personOf ?? ((author: string) => ({ name: author }));
  const versionOf = (key: unknown) => versions?.find((each) => each.revision === key);
  return (
    <div {...workspaceHooks.slot('history')}>
      <RevisionList
        labels={labels}
        aria-label={labels.history}
        versions={(versions ?? []).map((version) => ({
          id: version.revision,
          time: version.savedAt,
          person: version.author ? personOf(version.author) : undefined,
        }))}
        currentKey={saved.revision}
        selectedKeys={viewing ? [viewing.version.revision] : []}
        onSelectionChange={() => undefined}
        onView={(key) => {
          const version = versionOf(key);
          void workspace.view(version && version.revision !== saved.revision ? version : null);
        }}
        onRestore={(key) => props.onRestore(String(key))}
        showFilters={false}
        isLoading={versions === null && error === null}
        error={error ?? undefined}
      />
    </div>
  );
}
