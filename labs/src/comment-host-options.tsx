// The comments lab's host options (DOCE-LABS-3.10): what a host sets on the comments margin and the
// editor around it, each with a control, and a log of what the editor told the host.

import { UsersGlyph } from '@flamboyantengineer/ui-components/core';
import { type ReactNode, type RefObject, useCallback, useState } from 'react';
import {
  type DocumentCommentsOptions,
  DocumentContributors,
  type DocumentEditorHandle,
  DocumentPresence,
  DocumentSidePanel,
  type ThreadActionTarget,
} from '../../src/components/index.js';
import type { CommentThread, IdentityAdapter, MentionTarget } from '../../src/host/index.js';
import type { AnswerOutcome, LabCommentStore } from './lab-comment-store.js';

/** The host options the lab's controls set. */
export interface HostOptions {
  readonly cardGap: string;
  readonly headerActions: boolean;
  readonly quickDelete: boolean;
  readonly replyStart: boolean;
  readonly clearsActive: boolean;
  readonly revealsPane: boolean;
  readonly sidePanel: boolean;
  readonly personCards: boolean;
  readonly copyLink: boolean;
  readonly collaborators: boolean;
  readonly othersTyping: boolean;
}

const NO_OPTIONS: HostOptions = {
  cardGap: '',
  headerActions: false,
  quickDelete: false,
  replyStart: false,
  clearsActive: false,
  revealsPane: false,
  sidePanel: false,
  personCards: false,
  copyLink: false,
  collaborators: false,
  othersTyping: false,
};

/** The host log's latest lines, and how the host writes one. */
export function useHostLog(): [readonly string[], (line: string) => void] {
  const [lines, setLines] = useState<readonly string[]>([]);
  const write = useCallback((line: string) => setLines((all) => [...all, line].slice(-8)), []);
  return [lines, write];
}

/** The lab's host options, and how a control changes one. */
export function useHostOptions(): [HostOptions, (change: Partial<HostOptions>) => void] {
  const [options, setOptions] = useState(NO_OPTIONS);
  const change = useCallback(
    (next: Partial<HostOptions>) => setOptions((all) => ({ ...all, ...next })),
    [],
  );
  return [options, change];
}

// A host's own entry ending each card's header menu: sharing the thread, or the suggestion before
// it has one.
const shareActions = (log: (line: string) => void) => (target: ThreadActionTarget) => [
  {
    id: 'share',
    label: target.thread ? 'Share thread' : 'Share suggestion',
    onAction: () => log(`Shared ${target.thread?.id ?? target.suggestion ?? ''}`),
  },
];

// The text each reply starts with: the text the thread is on.
const replyAbout = (thread: CommentThread) => `Re ${thread.quote}: `;

/** The comments options the host's controls set, with what the editor tells the host logged. */
export function hostCommentOptions(
  options: HostOptions,
  log: (line: string) => void,
): Partial<DocumentCommentsOptions> {
  const gap = Number.parseInt(options.cardGap, 10);
  return {
    cardGap: Number.isFinite(gap) ? gap : undefined,
    threadActions: options.headerActions ? shareActions(log) : undefined,
    confirmsDelete: options.quickDelete ? false : undefined,
    replyStart: options.replyStart ? replyAbout : undefined,
    clearsActiveOnBlur: options.clearsActive || undefined,
    revealsPane: options.revealsPane || undefined,
    onActivityShown: ({ threadId, entryId }) => log(`Shown ${threadId}/${entryId}`),
  };
}

// The host's own card for a person, in place of the editor's.
const personCard = (person: { name: string }) => (
  <div className="lab-person-card">
    <strong>{person.name}</strong> · Host card
  </div>
);

/** The side panel at the document's end: the comments and the contributors, with host cards. */
export function LabSidePanel({
  personCards,
  identity,
}: {
  personCards: boolean;
  identity: IdentityAdapter;
}) {
  return (
    <DocumentSidePanel
      position="end"
      defaultExpanded={false}
      panes={[
        'comments',
        {
          id: 'people',
          label: 'Contributors',
          icon: UsersGlyph,
          render: () => (
            <DocumentContributors
              identity={identity}
              renderCard={personCards ? personCard : undefined}
            />
          ),
        },
      ]}
    />
  );
}

/** The other people's avatars, opening the host's cards when it gives them. */
export function LabPresence({ personCards }: { personCards: boolean }) {
  return (
    <div className="lab-presence-avatars">
      <DocumentPresence renderCard={personCards ? personCard : undefined} />
    </div>
  );
}

/** The editor's Copy link, as a host that makes the link would take it. */
export function copyLinkOf(options: HostOptions, log: (line: string) => void) {
  return options.copyLink
    ? ({ elementId, from, to }: { elementId: string; from?: number; to?: number }) =>
        log(`Link to ${elementId}${from === undefined ? '' : `:${String(from)}-${String(to)}`}`)
    : undefined;
}

/** A mention the writer made, as the host hears of it. */
export const mentionLogOf = (log: (line: string) => void) => (person: MentionTarget) =>
  log(`Mentioned ${person.name}`);

function Toggle({
  name,
  checked,
  onChange,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label>
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />{' '}
      {children}
    </label>
  );
}

const THREAD = 'c0ffee01';
const OUTCOMES: readonly [AnswerOutcome, string][] = [
  ['answer', 'Finish the answer'],
  ['retryable', 'Fail the answer'],
  ['final', 'Fail the answer for good'],
];

/** The reader's moderation, which the store takes once: changing it reloads the page. */
function ModeratorToggle({ moderator }: { moderator: boolean }) {
  return (
    <Toggle
      name="moderator"
      checked={moderator}
      onChange={(checked) => {
        window.location.search = checked ? '?moderator' : '';
      }}
    >
      Moderator (reloads)
    </Toggle>
  );
}

/** The assistant writing a reply for the reader, and another person typing, at the host. */
function StoreControls({
  store,
  options,
  onChange,
}: {
  store: LabCommentStore;
  options: HostOptions;
  onChange: (change: Partial<HostOptions>) => void;
}) {
  return (
    <>
      <button type="button" onClick={() => store.ask('lab', THREAD)}>
        Ask the assistant
      </button>
      {OUTCOMES.map(([outcome, label]) => (
        <button key={outcome} type="button" onClick={() => store.settle('lab', outcome)}>
          {label}
        </button>
      ))}
      <Toggle
        name="others-typing"
        checked={options.othersTyping}
        onChange={(checked) => {
          onChange({ othersTyping: checked });
          store.setOthersTyping(
            'lab',
            checked ? [{ threadId: THREAD, person: 'grace', kind: 'typing' }] : [],
          );
        }}
      >
        Grace is typing in the first thread
      </Toggle>
    </>
  );
}

// The checkboxes, by option, each with its label.
const TOGGLES: readonly [keyof HostOptions, string, string][] = [
  ['headerActions', 'header-actions', 'Share in the header menu'],
  ['quickDelete', 'quick-delete', 'Delete without asking'],
  ['replyStart', 'reply-start', 'Replies start with the quote'],
  ['clearsActive', 'clears-active', 'No active card once focus leaves'],
  ['sidePanel', 'side-panel', 'Side panel'],
  ['revealsPane', 'reveals-pane', 'Threads reveal the comments pane'],
  ['collaborators', 'collaborators', 'Collaborators'],
  ['personCards', 'person-cards', 'Host person cards'],
  ['copyLink', 'copy-link', 'Copy link in the menu'],
];

/** The host options' controls, the store's, and the host log. */
export function CommentHostOptions({
  options,
  onChange,
  store,
  moderator,
  handle,
  log,
  lines,
}: {
  options: HostOptions;
  onChange: (change: Partial<HostOptions>) => void;
  store: LabCommentStore;
  moderator: boolean;
  handle: RefObject<DocumentEditorHandle | null>;
  log: (line: string) => void;
  lines: readonly string[];
}) {
  return (
    <fieldset>
      <legend>Host options</legend>
      <label>
        Card gap{' '}
        <input
          type="number"
          name="card-gap"
          min={0}
          value={options.cardGap}
          onChange={(event) => onChange({ cardGap: event.currentTarget.value })}
        />
      </label>
      {TOGGLES.map(([key, name, label]) => (
        <Toggle
          key={key}
          name={name}
          checked={Boolean(options[key])}
          onChange={(checked) =>
            onChange(
              key === 'revealsPane' && checked
                ? { revealsPane: true, sidePanel: true }
                : { [key]: checked },
            )
          }
        >
          {label}
        </Toggle>
      ))}
      <ModeratorToggle moderator={moderator} />
      <button
        type="button"
        onClick={() => {
          const found = handle.current?.revealPane('comments', {
            onShown: (pane) => log(`Pane shown: ${pane.getAttribute('aria-label') ?? ''}`),
          });
          if (!found) log('No comments pane');
        }}
      >
        Reveal the comments pane
      </button>
      <StoreControls store={store} options={options} onChange={onChange} />
      <output aria-label="Host log" className="lab-host-log">
        {lines.join('\n')}
      </output>
    </fieldset>
  );
}
