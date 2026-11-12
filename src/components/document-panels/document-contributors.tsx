// The contributors pane: who wrote the document, the most text first, each named by the host's
// identity adapter and drawn in the colour slot their text takes while authorship shows, with a
// switch that shows or hides who wrote what.

import { Switch } from '@flamboyantengineer/ui-components/switch';
import { UserIdentity } from '@flamboyantengineer/ui-components/user-identity';
import { useEffect, useMemo, useState } from 'react';
import { documentAuthors, isAuthorshipShown } from '../../engine/index.js';
import type { EditorPerson, IdentityAdapter } from '../../host/index.js';
import { createHooks } from '../../utils/hooks.js';
import { type EditorContext, useDocumentEditor } from '../document-editor/document-editor.js';
import { DEFAULT_PANELS_LABELS, type DocumentPanelsLabels } from './panel-labels.js';

/** What the contributors pane lists and how it shows authorship. */
export interface DocumentContributorsProps {
  /** The editor whose writers are listed; the editor holding the pane by default. */
  readonly context?: EditorContext | null | undefined;
  /** Names the writers by their ids; without it, each is shown by their id. */
  readonly identity?: IdentityAdapter | undefined;
  /** Whether authorship shows; read from the editor's state by default. */
  readonly authorship?: boolean | undefined;
  /** Asks the host to show or hide authorship (the editor's `authorship`); no switch without it. */
  readonly onAuthorshipChange?: ((shown: boolean) => void) | undefined;
  readonly labels?: Partial<DocumentPanelsLabels> | undefined;
  readonly className?: string | undefined;
}

const hooks = createHooks('document-contributors', ['list', 'contributor']);

// The people the adapter knows among `ids`, looked up again only when the ids change.
function usePeople(identity: IdentityAdapter | undefined, ids: readonly string[]) {
  const [people, setPeople] = useState<ReadonlyMap<string, EditorPerson>>(new Map());
  const key = ids.join('\n');
  useEffect(() => {
    if (!identity || !key) return;
    let current = true;
    void identity.resolvePeople(key.split('\n')).then((found) => {
      if (current) setPeople(new Map(found.map((person) => [person.id, person])));
    });
    return () => {
      current = false;
    };
  }, [identity, key]);
  return people;
}

/** The document's writers, with a switch for showing who wrote what. */
export function DocumentContributors(props: DocumentContributorsProps) {
  const held = useDocumentEditor();
  const context = props.context ?? held;
  const doc = context?.state.doc ?? null;
  const authors = useMemo(() => (doc ? documentAuthors(doc) : []), [doc]);
  const people = usePeople(
    props.identity,
    authors.map((author) => author.id),
  );
  if (!context) return null;
  const labels = { ...DEFAULT_PANELS_LABELS, ...props.labels };
  const shown = props.authorship ?? isAuthorshipShown(context.state);
  const { onAuthorshipChange } = props;
  return (
    <section
      {...hooks.root({ className: props.className, data: { authorship: shown } })}
      aria-label={labels.contributors}
    >
      {onAuthorshipChange ? (
        <Switch isSelected={shown} onChange={onAuthorshipChange}>
          {labels.showAuthorship}
        </Switch>
      ) : null}
      {authors.length === 0 ? <p>{labels.noContributors}</p> : null}
      <ul {...hooks.slot('list')}>
        {authors.map((author) => {
          const person = people.get(author.id);
          return (
            <li
              key={author.id}
              {...hooks.slot('contributor', { author: author.id, authorSlot: author.slot })}
            >
              <UserIdentity
                name={person?.name ?? author.id}
                src={person?.avatarUrl}
                colorKey={author.id}
                colorIndex={author.slot}
                description={labels.contributorCharacters(author.characters)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
