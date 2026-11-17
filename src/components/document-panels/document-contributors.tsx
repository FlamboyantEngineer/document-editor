// The contributors pane: one stable row for each writer of the document, by the name the host's
// identity adapter gives them, each in the colour slot their text takes while authorship shows and
// with a card on hover and focus; changes the system made and text no writer is known for have a
// plain row of their own. A switch shows or hides who wrote what.

import { PreviewTrigger } from '@flamboyantengineer/ui-components/hover-card';
import { Switch } from '@flamboyantengineer/ui-components/switch';
import { UserIdentity } from '@flamboyantengineer/ui-components/user-identity';
import { type ReactNode, useMemo } from 'react';
import {
  type DocumentAuthor,
  documentAuthors,
  hasUnattributedText,
  isAuthorshipShown,
} from '../../engine/index.js';
import type { EditorPerson, IdentityAdapter } from '../../host/index.js';
import { createHooks } from '../../utils/hooks.js';
import { usePeople } from '../../utils/use-people.js';
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
  /** The card a named writer's row opens on hover or focus, in place of the editor's. */
  readonly renderCard?: ((person: EditorPerson) => ReactNode) | undefined;
  readonly labels?: Partial<DocumentPanelsLabels> | undefined;
  readonly className?: string | undefined;
}

/** The writer whose changes the system made, not a person. */
const SYSTEM_CONTRIBUTOR = 'system';

const hooks = createHooks('document-contributors', ['list', 'contributor']);

interface Row {
  readonly author: DocumentAuthor;
  readonly label: string;
  readonly person: EditorPerson | undefined;
}

// The writers by the name they show with, then by id, so a row keeps its place as text is added.
function rowsOf(
  authors: readonly DocumentAuthor[],
  { people, labels }: { people: ReadonlyMap<string, EditorPerson>; labels: DocumentPanelsLabels },
): Row[] {
  return authors
    .map((author) => {
      const person = people.get(author.id);
      const label =
        author.id === SYSTEM_CONTRIBUTOR ? labels.systemContributor : (person?.name ?? author.id);
      return { author, label, person };
    })
    .sort((a, b) => a.label.localeCompare(b.label) || a.author.id.localeCompare(b.author.id));
}

// A named writer's row opens their card on hover and focus; the system's and an unknown writer's
// are plain text, with no colour or picture.
function ContributorRow({
  row,
  renderCard,
}: {
  row: Row;
  renderCard: DocumentContributorsProps['renderCard'];
}) {
  const { author, label, person } = row;
  const data = { author: author.id, authorSlot: author.slot };
  if (author.id === SYSTEM_CONTRIBUTOR) {
    return <li {...hooks.slot('contributor', { ...data, kind: 'system' })}>{label}</li>;
  }
  const identity = (
    <UserIdentity
      name={label}
      src={person?.avatarUrl}
      colorKey={author.id}
      colorIndex={author.slot}
    />
  );
  return (
    <li {...hooks.slot('contributor', { ...data, kind: person ? 'person' : 'unresolved' })}>
      {person ? (
        <PreviewTrigger
          trigger="hover"
          previewLabel={label}
          preview={
            renderCard?.(person) ?? <UserIdentity name={person.name} src={person.avatarUrl} />
          }
        >
          {identity}
        </PreviewTrigger>
      ) : (
        identity
      )}
    </li>
  );
}

/** The document's writers, with a switch for showing who wrote what. */
export function DocumentContributors(props: DocumentContributorsProps) {
  const held = useDocumentEditor();
  const context = props.context ?? held;
  const doc = context?.state.doc ?? null;
  const authors = useMemo(() => (doc ? documentAuthors(doc) : []), [doc]);
  const unknown = useMemo(() => (doc ? hasUnattributedText(doc) : false), [doc]);
  const people = usePeople(
    props.identity,
    authors.map((author) => author.id),
  );
  if (!context) return null;
  const labels = { ...DEFAULT_PANELS_LABELS, ...props.labels };
  const shown = props.authorship ?? isAuthorshipShown(context.state);
  const { onAuthorshipChange } = props;
  const rows = rowsOf(authors, { people, labels });
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
      {rows.length === 0 && !unknown ? <p>{labels.noContributors}</p> : null}
      <ul {...hooks.slot('list')}>
        {rows.map((row) => (
          <ContributorRow key={row.author.id} row={row} renderCard={props.renderCard} />
        ))}
        {unknown ? (
          <li {...hooks.slot('contributor', { kind: 'unknown' })}>{labels.unknownContributor}</li>
        ) : null}
      </ul>
    </section>
  );
}
