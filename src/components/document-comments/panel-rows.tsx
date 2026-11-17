// The threads and suggestions the margin shows beside the text, listed in the comments panel as one
// row each under "In the document", rather than as a second card (DOCE-COMMENTS-4.13): who wrote
// it and the text it is on, each on one line. Activating a row opens its card in the margin.

import { EditGlyph, type Key } from '@flamboyantengineer/ui-components/core';
import { List, ListRow } from '@flamboyantengineer/ui-components/list-row';
import { memo, useId } from 'react';
import type { CardContext } from './comment-cards.js';
import type { CommentItem } from './comment-items.js';
import { hooks } from './comments-panel-hooks.js';

/** An item the margin shows, which the panel lists as a row. */
export type RowItem = Extract<CommentItem, { kind: 'thread' | 'suggestion' }>;

/** Whether the margin shows an item beside its text: an open thread, or a standing suggestion. */
export function isBesideText(item: CommentItem): item is RowItem {
  return item.kind === 'suggestion' || (item.kind === 'thread' && item.thread.state === 'open');
}

// Who wrote an item, and the text it is on.
function describe(item: RowItem, { comments, labels }: CardContext) {
  const author = item.kind === 'thread' ? item.thread.entries[0]?.author : item.suggestion.author;
  const name = (author ? comments.people.get(author)?.name : undefined) ?? labels.someone;
  const text =
    item.kind === 'thread'
      ? item.thread.quote
      : item.suggestion.inserted || item.suggestion.deleted;
  const title = item.kind === 'thread' ? labels.threadRow(name) : labels.suggestionRow(name);
  const excerpt = text.replace(/\s+/g, ' ').trim();
  return { title, meta: excerpt ? labels.onText(excerpt) : labels.showInDocument };
}

interface RowProps {
  readonly id: string;
  readonly title: string;
  readonly meta: string;
  readonly suggestion: boolean;
  readonly isCurrent: boolean;
  readonly onOpen: (key: string) => void;
}

// One row, drawn again only when what it says changes, not as the reader types beside it.
const Row = memo(function Row({ id, title, meta, suggestion, isCurrent, onOpen }: RowProps) {
  return (
    <ListRow
      {...hooks.slot('row', { annotation: suggestion ? 'suggestion' : 'thread' })}
      title={title}
      meta={meta}
      icon={suggestion ? EditGlyph : undefined}
      isCurrent={isCurrent}
      onPress={() => onOpen(id)}
    />
  );
});

interface InDocumentRowsProps {
  readonly items: readonly RowItem[];
  readonly context: CardContext;
  readonly active: Key | null;
  /** Opens an item's card beside its text, by its key. */
  readonly onOpen: (key: string) => void;
}

/** The rows of the items beside the text, under their heading; nothing while there are none. */
export function InDocumentRows({ items, context, active, onOpen }: InDocumentRowsProps) {
  const heading = useId();
  if (items.length === 0) return null;
  return (
    <section {...hooks.slot('in-document')} aria-labelledby={heading}>
      <p {...hooks.slot('heading')} id={heading}>
        {context.labels.inDocument}
      </p>
      <List aria-labelledby={heading}>
        {items.map((item) => (
          <Row
            key={item.key}
            id={item.key}
            {...describe(item, context)}
            suggestion={item.kind === 'suggestion'}
            isCurrent={item.key === active}
            onOpen={onOpen}
          />
        ))}
      </List>
    </section>
  );
}
