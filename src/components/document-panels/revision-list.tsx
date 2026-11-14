// The editor owns revision policy; the shared collection owns selection and keyboard navigation.
import type { Key, Selection } from '@flamboyantengineer/ui-components/core';
import { InlineError } from '@flamboyantengineer/ui-components/inline-error';
import { Stack } from '@flamboyantengineer/ui-components/layout';
import { ListView } from '@flamboyantengineer/ui-components/list-row';
import { useState } from 'react';
import { useRevisionActions } from './revision-actions.js';
import { RevisionDialog } from './revision-dialog.js';
import type { RevisionItem } from './revision-item.js';
import { DEFAULT_REVISION_LABELS, type RevisionLabels } from './revision-labels.js';
import { RevisionRow } from './revision-row.js';
import { RevisionToolbar } from './revision-toolbar.js';

interface RevisionListProps {
  labels?: Partial<RevisionLabels> | undefined;
  'aria-label': string;
  versions: readonly RevisionItem[];
  currentKey?: Key | null | undefined;
  selectedKeys?: Iterable<Key> | undefined;
  onSelectionChange: (keys: Set<Key>) => void;
  onCompare?: ((keys: [Key, Key]) => void) | undefined;
  onRestore?: ((key: Key) => unknown) | undefined;
  onRename?: ((key: Key, label: string) => unknown) | undefined;
  showFilters?: boolean | undefined;
  isLoading?: boolean | undefined;
  error?: string | undefined;
  onRetry?: (() => void) | undefined;
}

/** History selection, folding, filters and revision actions belong to the editor. */
function useRevisionList(props: RevisionListProps) {
  const { versions, onSelectionChange } = props;
  const labels = { ...DEFAULT_REVISION_LABELS, ...props.labels };
  const [namedOnly, setNamedOnly] = useState(false);
  const [person, setPerson] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<Key>>(new Set());
  const actions = useRevisionActions(props);
  const all = versions.flatMap((version) => [version, ...(version.children ?? [])]);
  const people = [
    ...new Set(
      all.flatMap((version) => (version.person?.name.trim() ? [version.person.name.trim()] : [])),
    ),
  ];
  const known = new Set(all.map((version) => version.id));
  const selected = new Set([...(props.selectedKeys ?? [])].filter((key) => known.has(key)));
  const visible = versions.flatMap((version) => {
    const matches = (item: RevisionItem) =>
      (!namedOnly || Boolean(item.label?.trim())) &&
      (!person || item.person?.name.trim() === person);
    const children = (version.children ?? []).filter(matches);
    return [
      ...(matches(version) ? [version] : []),
      ...(expanded.has(version.id) || !matches(version) ? children : []),
    ];
  });
  const choose = (keys: Selection) => {
    const picked = keys === 'all' ? new Set(all.map((version) => version.id)) : keys;
    const added = [...picked].filter((key) => !selected.has(key));
    const kept = [...selected].filter((key) => picked.has(key));
    onSelectionChange(new Set([...kept, ...added].slice(-2)));
  };
  const compare = () => {
    const ordered = all
      .filter((version) => selected.has(version.id))
      .map((version) => version.id)
      .reverse();
    if (ordered.length === 2) props.onCompare?.(ordered as [Key, Key]);
  };
  const toggle = (key: Key) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return {
    labels,
    namedOnly,
    setNamedOnly,
    person,
    setPerson,
    expanded,
    ...actions,
    people,
    selected,
    visible,
    choose,
    compare,
    toggle,
  };
}

/** The editor's saved-revision collection and the dialogs its actions open. */
export function RevisionList(props: RevisionListProps) {
  const { onRename, onRestore } = props;
  const model = useRevisionList(props);
  return (
    <Stack space="sm">
      {props.showFilters !== false || props.onCompare ? (
        <RevisionToolbar
          showFilters={props.showFilters !== false}
          namedOnly={model.namedOnly}
          onNamedOnlyChange={model.setNamedOnly}
          person={model.person}
          onPersonChange={model.setPerson}
          people={model.people}
          labels={model.labels}
          onCompare={props.onCompare ? model.compare : undefined}
          canCompare={model.selected.size === 2}
        />
      ) : null}
      {props.error ? <InlineError onRetry={props.onRetry}>{props.error}</InlineError> : null}
      <ListView
        aria-label={props['aria-label']}
        selectionMode="multiple"
        selectionBehavior="toggle"
        selectedKeys={model.selected}
        onSelectionChange={model.choose}
        isLoading={props.isLoading}
        renderEmptyState={() => model.labels.noRevisions}
      >
        {model.visible.map((version) => (
          <RevisionRow
            key={version.id}
            version={version}
            currentKey={props.currentKey}
            expanded={model.expanded.has(version.id)}
            onToggle={() => model.toggle(version.id)}
            labels={model.labels}
            canRename={Boolean(onRename)}
            canRestore={Boolean(onRestore && version.id !== props.currentKey)}
            onAction={(action) => model.openDialog(version.id, action)}
          />
        ))}
      </ListView>
      {model.dialog ? (
        <RevisionDialog
          key={`${String(model.dialog.version.id)}:${model.dialog.action}`}
          {...model.dialog}
          labels={model.labels}
          onClose={model.closeDialog}
          onRename={model.rename}
          onRestore={model.restore}
        />
      ) : null}
    </Stack>
  );
}
