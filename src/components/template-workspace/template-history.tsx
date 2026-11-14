// The open template's saved versions on the base library's VersionHistory, newest first, the
// current one marked: selecting another shows it read-only, and restoring one saves its settings as
// the newest version after a confirmation.

import type { Key } from '@flamboyantengineer/ui-components/core';
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
  /** Restores a version by revision, once unsaved changes are saved or discarded. */
  readonly onRestore: (revision: string) => Promise<unknown>;
}

// The template's versions, listed again after each save.
function useVersions(store: TemplateStoreAdapter, templateId: string, revision: string) {
  const [listed, setListed] = useState<{ key: string; versions: readonly TemplateVersion[] }>();
  const [error, setError] = useState<string | null>(null);
  const key = `${templateId}\n${revision}`;
  useEffect(() => {
    let current = true;
    void store.versions?.(templateId).then((result) => {
      if (!current) return;
      if (result.ok) setListed({ key, versions: result.value });
      setError(result.ok ? null : (result.error.message ?? result.error.kind));
    });
    return () => {
      current = false;
    };
  }, [store, key, templateId]);
  return { versions: listed?.key === key ? listed.versions : null, error };
}

/** The open template's history; nothing before its first save. */
export function TemplateHistory({ store, workspace, labels, onRestore }: TemplateHistoryProps) {
  const { open, viewing } = workspace;
  const saved = open?.saved;
  const { versions, error } = useVersions(store, open?.draft.id ?? '', saved?.revision ?? '');
  if (!open || !saved) return null;
  const select = (keys: Set<Key>) => {
    const revision = [...keys].at(-1);
    const version = versions?.find((each) => each.revision === revision);
    void workspace.view(version && version.revision !== saved.revision ? version : null);
  };
  return (
    <div {...workspaceHooks.slot('history')}>
      <RevisionList
        labels={labels}
        aria-label={labels.history}
        versions={(versions ?? []).map((version) => ({
          id: version.revision,
          time: version.savedAt,
        }))}
        currentKey={saved.revision}
        selectedKeys={viewing ? [viewing.version.revision] : []}
        onSelectionChange={select}
        onRestore={(key) => onRestore(String(key))}
        showFilters={false}
        isLoading={versions === null && error === null}
        error={error ?? undefined}
      />
    </div>
  );
}
