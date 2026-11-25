import { Attribution } from '@flamboyantengineer/ui-components/attribution';
import { Badge } from '@flamboyantengineer/ui-components/badge';
import type { Key } from '@flamboyantengineer/ui-components/core';
import { DropdownMenu } from '@flamboyantengineer/ui-components/dropdown-menu';
import { ExpandToggle } from '@flamboyantengineer/ui-components/expand-toggle';
import { Cluster, Stack } from '@flamboyantengineer/ui-components/layout';
import { ListViewItem } from '@flamboyantengineer/ui-components/list-row';
import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import { revisionHooks as hooks } from './revision-hooks.js';
import { type RevisionItem, type RevisionTimeFormat, revisionTitle } from './revision-item.js';
import type { RevisionLabels } from './revision-labels.js';

interface RevisionRowProps {
  version: RevisionItem;
  /** Whether the row is an automatic version folded under a named one. */
  nested: boolean;
  currentKey: Key | null | undefined;
  expanded: boolean;
  onToggle: () => void;
  canView: boolean;
  canRename: boolean;
  canRestore: boolean;
  /** The host's own entries, after View, Rename and Restore. */
  hostActions: readonly MenuEntry[];
  labels: RevisionLabels;
  timeFormat: RevisionTimeFormat;
  onAction: (action: 'view' | 'rename' | 'restore') => void;
}

// The row's actions the reader may take: view it, name or rename it, restore it.
function actionItems(
  allowed: { canView: boolean; canRename: boolean; canRestore: boolean },
  { version, labels, onAction }: Pick<RevisionRowProps, 'version' | 'labels' | 'onAction'>,
) {
  const named = Boolean(version.label?.trim());
  return [
    allowed.canView ? { id: 'view', label: labels.viewRevision, action: 'view' as const } : null,
    allowed.canRename
      ? {
          id: 'rename',
          label: named ? labels.renameRevision : labels.nameRevision,
          action: 'rename' as const,
        }
      : null,
    allowed.canRestore
      ? { id: 'restore', label: labels.restoreRevision, action: 'restore' as const }
      : null,
  ].flatMap((item) =>
    item ? [{ id: item.id, label: item.label, onAction: () => onAction(item.action) }] : [],
  );
}

/** A revision's collection row, including its host-owned grouping and action policy. */
export function RevisionRow({
  version,
  nested,
  currentKey,
  expanded,
  onToggle,
  canView,
  canRename,
  canRestore,
  hostActions,
  labels,
  timeFormat,
  onAction,
}: RevisionRowProps) {
  const items = [
    ...actionItems({ canView, canRename, canRestore }, { version, labels, onAction }),
    ...hostActions,
  ];
  const title = revisionTitle(version, timeFormat);
  const isCurrent = version.id === currentKey;
  const isExpanded = Boolean(version.children?.length) && expanded;
  return (
    <ListViewItem
      {...hooks.slot('row', {
        current: isCurrent,
        named: Boolean(version.label?.trim()),
        nested,
        expanded: isExpanded,
      })}
      id={version.id}
      textValue={title}
      title={
        <Cluster as="span" space="xs">
          {version.children?.length ? (
            <ExpandToggle
              {...hooks.slot('fold')}
              label={labels.olderRevisions(version.children.length, title)}
              isExpanded={expanded}
              onExpandedChange={onToggle}
            />
          ) : null}
          <span {...hooks.slot('title')}>{title}</span>
          {isCurrent ? <Badge {...hooks.slot('current')}>{labels.currentRevision}</Badge> : null}
        </Cluster>
      }
      meta={
        <Stack as="span" space="xs" {...hooks.slot('meta')}>
          <Attribution time={version.time} person={version.person} />
          {version.summary ? <span {...hooks.slot('summary')}>{version.summary}</span> : null}
        </Stack>
      }
      trailing={
        items.length > 0 ? (
          <DropdownMenu
            {...hooks.slot('actions')}
            label={labels.revisionActions}
            variant="ghost"
            size="sm"
            items={items}
          />
        ) : undefined
      }
    />
  );
}
