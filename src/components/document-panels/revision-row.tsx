import { Attribution } from '@flamboyantengineer/ui-components/attribution';
import { Badge } from '@flamboyantengineer/ui-components/badge';
import type { Key } from '@flamboyantengineer/ui-components/core';
import { DropdownMenu } from '@flamboyantengineer/ui-components/dropdown-menu';
import { ExpandToggle } from '@flamboyantengineer/ui-components/expand-toggle';
import { Cluster, Stack } from '@flamboyantengineer/ui-components/layout';
import { ListViewItem } from '@flamboyantengineer/ui-components/list-row';
import { revisionHooks as hooks } from './revision-hooks.js';
import { type RevisionItem, revisionTitle } from './revision-item.js';
import type { RevisionLabels } from './revision-labels.js';

interface RevisionRowProps {
  version: RevisionItem;
  /** Whether the row is an automatic version folded under a named one. */
  nested: boolean;
  currentKey: Key | null | undefined;
  expanded: boolean;
  onToggle: () => void;
  canRename: boolean;
  canRestore: boolean;
  labels: RevisionLabels;
  onAction: (action: 'rename' | 'restore') => void;
}

/** A revision's collection row, including its host-owned grouping and action policy. */
export function RevisionRow({
  version,
  nested,
  currentKey,
  expanded,
  onToggle,
  canRename,
  canRestore,
  labels,
  onAction,
}: RevisionRowProps) {
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
      textValue={revisionTitle(version)}
      title={
        <Cluster as="span" space="xs">
          {version.children?.length ? (
            <ExpandToggle
              {...hooks.slot('fold')}
              label={labels.olderRevisions(version.children.length, revisionTitle(version))}
              isExpanded={expanded}
              onExpandedChange={onToggle}
            />
          ) : null}
          <span {...hooks.slot('title')}>{revisionTitle(version)}</span>
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
        canRename || canRestore ? (
          <DropdownMenu
            {...hooks.slot('actions')}
            label={labels.revisionActions}
            variant="ghost"
            size="sm"
            items={[
              ...(canRename
                ? [
                    {
                      id: 'rename',
                      label: version.label?.trim() ? labels.renameRevision : labels.nameRevision,
                      onAction: () => onAction('rename'),
                    },
                  ]
                : []),
              ...(canRestore
                ? [
                    {
                      id: 'restore',
                      label: labels.restoreRevision,
                      onAction: () => onAction('restore'),
                    },
                  ]
                : []),
            ]}
          />
        ) : undefined
      }
    />
  );
}
