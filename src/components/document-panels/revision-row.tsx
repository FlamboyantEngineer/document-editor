import { Attribution } from '@flamboyantengineer/ui-components/attribution';
import { Badge } from '@flamboyantengineer/ui-components/badge';
import type { Key } from '@flamboyantengineer/ui-components/core';
import { DropdownMenu } from '@flamboyantengineer/ui-components/dropdown-menu';
import { ExpandToggle } from '@flamboyantengineer/ui-components/expand-toggle';
import { Cluster, Stack } from '@flamboyantengineer/ui-components/layout';
import { ListViewItem } from '@flamboyantengineer/ui-components/list-row';
import { type RevisionItem, revisionTitle } from './revision-item.js';
import type { RevisionLabels } from './revision-labels.js';

interface RevisionRowProps {
  version: RevisionItem;
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
  currentKey,
  expanded,
  onToggle,
  canRename,
  canRestore,
  labels,
  onAction,
}: RevisionRowProps) {
  return (
    <ListViewItem
      id={version.id}
      textValue={revisionTitle(version)}
      title={
        <Cluster as="span" space="xs">
          {version.children?.length ? (
            <ExpandToggle
              label={labels.olderRevisions(version.children.length, revisionTitle(version))}
              isExpanded={expanded}
              onExpandedChange={onToggle}
            />
          ) : null}
          <span>{revisionTitle(version)}</span>
          {version.id === currentKey ? <Badge>{labels.currentRevision}</Badge> : null}
        </Cluster>
      }
      meta={
        <Stack as="span" space="xs">
          <Attribution time={version.time} person={version.person} />
          {version.summary}
        </Stack>
      }
      trailing={
        canRename || canRestore ? (
          <DropdownMenu
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
