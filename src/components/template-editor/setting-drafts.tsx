// The drafts of the template editor's fields: what is typed into a field stays the field's own until
// it is committed, on Enter or on leaving the field, and a draft that is not valid is never
// committed. The editor tells the host while any field, a host's own included, holds such a draft,
// so a save can wait for it to be corrected.

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

/**
 * The state of a field's draft, or of every draft of an editor: none (`clean`), one that has not
 * been committed yet (`pending`), or one that is not valid (`invalid`), which wins over pending.
 */
export type TemplateDraftState = 'clean' | 'pending' | 'invalid';

type Report = (id: string, state: TemplateDraftState) => void;

const DraftsContext = createContext<Report | null>(null);

/**
 * Collects the drafts of the fields inside it and tells `onDraftsChange` the state of them all
 * whenever it changes.
 */
export function TemplateDrafts({
  onDraftsChange,
  children,
}: {
  onDraftsChange: ((state: TemplateDraftState) => void) | undefined;
  children: ReactNode;
}) {
  const drafts = useRef(new Map<string, TemplateDraftState>());
  const latest = useRef(onDraftsChange);
  useEffect(() => {
    latest.current = onDraftsChange;
  });
  const [report] = useState<Report>(() => (id: string, state: TemplateDraftState) => {
    const before = stateOf(drafts.current);
    if (state === 'clean') drafts.current.delete(id);
    else drafts.current.set(id, state);
    const after = stateOf(drafts.current);
    if (before !== after) latest.current?.(after);
  });
  return <DraftsContext value={report}>{children}</DraftsContext>;
}

function stateOf(drafts: ReadonlyMap<string, TemplateDraftState>): TemplateDraftState {
  const states = new Set(drafts.values());
  return states.has('invalid') ? 'invalid' : states.has('pending') ? 'pending' : 'clean';
}

/**
 * Reports a field's draft to the template editor around it: one not committed yet, so the host can
 * offer to save it, or one that is not valid, so the host keeps the template from being saved until
 * it is corrected or reverted. A host's own fields in the editor's extension slots report theirs
 * the same way.
 */
export function useTemplateDraft(state: TemplateDraftState): void {
  const report = useContext(DraftsContext);
  const id = useId();
  useEffect(() => {
    report?.(id, state);
  }, [report, id, state]);
  // A field that goes takes its draft with it.
  useEffect(() => () => report?.(id, 'clean'), [report, id]);
}

/**
 * A field's text while it is typed, apart from the value it shows: the draft follows the value
 * whenever the value changes from outside, such as by an undo or a change elsewhere.
 */
export function useTextDraft(value: string): readonly [string, (text: string) => void] {
  const [draft, setDraft] = useState({ text: value, from: value });
  // A value that changes drops the draft for good, so it does not come back with the old value,
  // such as when a card turns to another style and back.
  if (draft.from !== value) setDraft({ text: value, from: value });
  return [draft.from === value ? draft.text : value, (text) => setDraft({ text, from: value })];
}

/**
 * Commits a field's draft when the field goes, such as when the editor turns to another scope
 * before the field loses focus: the draft is written where it was typed.
 */
export function useCommitOnLeave(commit: () => void): void {
  const latest = useRef(commit);
  useLayoutEffect(() => {
    latest.current = commit;
  });
  // A layout cleanup runs before the next scope's handlers take over.
  useLayoutEffect(() => () => latest.current(), []);
}
