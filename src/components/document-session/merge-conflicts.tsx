// The blocks the reader and another writer both changed, each with what the other writer's
// version changes in the reader's, and the reader's choices: keep theirs as it is, take the other
// writer's, or, for text, keep both.

import { Banner } from '@flamboyantengineer/ui-components/banner';
import { Button } from '@flamboyantengineer/ui-components/button';
import { ButtonGroup } from '@flamboyantengineer/ui-components/button-group';
import {
  createInlineWordDiff,
  InlineTextDiff,
} from '@flamboyantengineer/ui-components/inline-text-diff';
import type { StoredNode } from '../../model/format/document-format.js';
import type { DocumentSession } from '../../session/document-session.js';
import type { MergeConflict } from '../../session/merge.js';
import { canKeepBoth } from '../../session/merge-conflicts.js';
import { createHooks } from '../../utils/hooks.js';
import { useSessionValue } from './document-session.js';

const hooks = createHooks('merge-conflicts', ['conflict']);

/** The conflict prompt's text. */
export interface MergeConflictsLabels {
  readonly region: string;
  /** A block both changed. */
  readonly changed: string;
  /** A block one side deleted and the other changed. */
  readonly deleted: string;
  readonly keepMine: string;
  readonly keepTheirs: string;
  readonly keepBoth: string;
}

const DEFAULT_LABELS: MergeConflictsLabels = {
  region: 'Changes saved by another writer',
  changed: 'Another writer changed this block too',
  deleted: 'One of you deleted this block while the other changed it',
  keepMine: 'Keep mine',
  keepTheirs: 'Keep theirs',
  keepBoth: 'Keep both',
};

export interface MergeConflictsProps {
  /** The session whose conflicts to settle. */
  readonly session: DocumentSession;
  readonly labels?: Partial<MergeConflictsLabels> | undefined;
  readonly className?: string | undefined;
}

// A stored block's text, its blocks' texts one per line.
function textOf(node: StoredNode | null): string {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  const parts = (node.content ?? []).map(textOf);
  return node.content?.some((child) => child.type === 'text') ? parts.join('') : parts.join('\n');
}

function Conflict({
  conflict,
  session,
  labels,
}: {
  conflict: MergeConflict;
  session: DocumentSession;
  labels: MergeConflictsLabels;
}) {
  const settle = (choice: 'mine' | 'theirs' | 'both') =>
    void session.resolveConflict(conflict.id, choice);
  const deleted = !conflict.mine || !conflict.theirs;
  const title = deleted ? labels.deleted : labels.changed;
  return (
    <Banner
      {...hooks.slot('conflict', { kind: deleted ? 'deleted' : 'changed' })}
      tone="warning"
      title={title}
      description={
        <InlineTextDiff
          segments={createInlineWordDiff(textOf(conflict.mine), textOf(conflict.theirs))}
        />
      }
      actions={
        <ButtonGroup aria-label={title}>
          <Button onPress={() => settle('mine')}>{labels.keepMine}</Button>
          <Button onPress={() => settle('theirs')}>{labels.keepTheirs}</Button>
          {canKeepBoth(conflict) ? (
            <Button onPress={() => settle('both')}>{labels.keepBoth}</Button>
          ) : null}
        </ButtonGroup>
      }
    />
  );
}

/**
 * Prompts the reader for each block both they and another writer changed (DOCE-SESSION-4.3): it
 * shows the other writer's changes to the reader's text and settles each block as the reader
 * chooses. It renders nothing while there is no conflict.
 */
export function MergeConflicts(props: MergeConflictsProps) {
  const conflicts = useSessionValue(props.session.conflicts);
  const labels = { ...DEFAULT_LABELS, ...props.labels };
  if (!conflicts.length) return null;
  return (
    <section {...hooks.root({ className: props.className })} aria-label={labels.region}>
      {conflicts.map((conflict) => (
        <Conflict key={conflict.id} conflict={conflict} session={props.session} labels={labels} />
      ))}
    </section>
  );
}
