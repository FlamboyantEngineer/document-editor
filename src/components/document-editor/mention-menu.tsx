// Mentions: `@` typed at the start of a block or after a space opens the people whose names match
// what the writer types on, as the host's mentions adapter finds them, and the person chosen takes
// the typed text's place as a mention, followed by a space. The document mentions people only.

import type { CompletionListItem } from '@flamboyantengineer/ui-components/completion-list';
import type { Key } from '@flamboyantengineer/ui-components/core';
import type { Command } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useEffect, useMemo, useState } from 'react';
import { replaceTrigger, type TriggerMatch } from '../../engine/index.js';
import type { MentionsAdapter, MentionTarget } from '../../host/index.js';
import { createHooks } from '../../utils/hooks.js';
import type { EditorContext } from './editor-context.js';
import { type MenuKeys, TriggerMenu, useTriggerMatch } from './trigger-menu.js';

const hooks = createHooks('document-editor', ['mention-menu']);

/**
 * How the editor finds the people a writer mentions: the host's mentions adapter (DOCE-HOST-1.21),
 * whose people the document's text can mention, and what it tells the host.
 */
export interface MentionOptions {
  /** The targets matching the query; the menu offers its people. */
  readonly find: MentionsAdapter['find'];
  /** Told of each person the writer mentions, once the mention is in the document. */
  readonly onMention?: ((person: MentionTarget) => void) | undefined;
}

const AT = { char: '@', allowSpaces: true } as const;

// How long the query rests before the host is asked, so a fast typist asks once.
const QUERY_DELAY = 120;

// The people the host finds for the query, the last ones found while the next are on their way.
function usePeople(find: MentionOptions['find'], query: string | null) {
  const [found, setFound] = useState<{ query: string; people: readonly MentionTarget[] } | null>(
    null,
  );
  useEffect(() => {
    if (query === null) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      find(query, controller.signal).then(
        (targets) => {
          const people = targets.filter((target) => target.kind === 'person');
          if (!controller.signal.aborted) setFound({ query, people });
        },
        () => undefined,
      );
    }, QUERY_DELAY);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [find, query]);
  return query === null ? null : found;
}

// The mention of a person in place of the typed text, and a space after it.
function mentionPerson(match: TriggerMatch, person: MentionTarget): Command {
  return (state, dispatch) => {
    const type = state.schema.nodes.mention;
    if (!type) return false;
    const node = type.create({ userId: person.id, label: person.name });
    return replaceTrigger(match, node)(state, (tr) => dispatch?.(tr.insertText(' ')));
  };
}

/** What the mention menu reads. */
export interface DocumentMentionMenuProps {
  context: EditorContext;
  view: EditorView | null;
  menuKeys: MenuKeys;
  options: MentionOptions;
}

/**
 * The mention menu (DOCE-EDITOR-4.23): an `@` typed while the writer can edit and the schema has
 * mentions opens the people the host finds for the text typed after it; the person chosen
 * replaces it as a mention.
 */
export function DocumentMentionMenu({
  context,
  view,
  menuKeys,
  options,
}: DocumentMentionMenuProps) {
  const isEnabled =
    context.editable &&
    !context.locked &&
    view !== null &&
    Boolean(context.state.schema.nodes.mention);
  const { match, dismiss } = useTriggerMatch(context.state, AT, isEnabled);
  const found = usePeople(options.find, match ? match.query.trim() : null);
  const people = found?.people;
  const items = useMemo(
    () =>
      (people ?? []).map((person): CompletionListItem => ({
        id: person.id,
        label: person.name,
        kind: 'person',
      })),
    [people],
  );
  if (!view || !match || !found) return null;
  const choose = (key: Key, at: TriggerMatch) => {
    const person = found.people.find((each) => each.id === key);
    if (!person) return;
    context.run(mentionPerson(at, person));
    options.onMention?.(person);
  };
  return (
    <TriggerMenu
      {...hooks.slot('mention-menu')}
      view={view}
      match={match}
      dismiss={dismiss}
      items={items}
      menuKeys={menuKeys}
      label={context.labels.mentionMenu}
      emptyState={context.labels.noPeople}
      onChoose={choose}
    />
  );
}
