// The document editor lab's agent: buttons that act on the live document through the automation
// API as an agent would, by element id, directly or as suggestions, and a stream that writes a
// note piece by piece. It reads the document first (`describeBlocks`), as an agent does. Its
// provider of actions on the selected text shortens each selected passage to its first words.

import type { EditorView } from 'prosemirror-view';
import { useRef, useState } from 'react';
import {
  type Actor,
  applyEdits,
  type AutomationEdit,
  describeBlocks,
  runSelectionAction,
  streamText,
} from '../../src/engine/index.js';
import type { SelectionActionsAdapter } from '../../src/host/index.js';

const AGENT: Actor = { id: 'lab-agent', kind: 'agent', session: 'lab-session' };

// The lab's provider: each selected passage of more than three words keeps its first three.
const SHORTEN: SelectionActionsAdapter = {
  agent: AGENT.id,
  run: ({ passages }) => {
    const replacements = passages
      .map((passage) => ({ passage, words: passage.text.trim().split(/\s+/) }))
      .filter(({ words }) => words.length > 3)
      .map(({ passage, words }) => ({ ...passage, text: `${words.slice(0, 3).join(' ')}…` }));
    return Promise.resolve({ ok: true, value: { replacements, session: AGENT.session } });
  },
};

// The first paragraph after the heading named `title`.
function paragraphAfter(view: EditorView, title: string) {
  const blocks = describeBlocks(view.state.doc);
  const heading = blocks.findIndex((block) => block.type === 'heading' && block.text === title);
  return blocks.slice(heading + 1).find((block) => block.type === 'paragraph') ?? null;
}

/** The lab's agent, acting on the view the editor mounted. */
export function AgentPanel({ view }: { view: EditorView | null }) {
  const [report, setReport] = useState('');
  const [mode, setMode] = useState<'direct' | 'suggest'>('suggest');
  const streaming = useRef<number | null>(null);
  const run = (edits: (view: EditorView) => AutomationEdit[] | null) => {
    if (!view) return;
    const batch = edits(view);
    if (!batch) return;
    const result = applyEdits(view.state, batch, { actor: AGENT, mode });
    if (!result.ok) {
      setReport(`Refused: ${result.error.message}`);
      return;
    }
    view.dispatch(result.tr);
    const threads = result.threads.map((thread) => `"${thread.quote}"`).join(', ');
    setReport(threads ? `Commented on ${threads}` : `Applied ${String(batch.length)} edit(s)`);
  };
  const rewrite = () =>
    run((current) => {
      const block = paragraphAfter(current, 'Power');
      const at = block?.text.indexOf('condition') ?? -1;
      if (!block || at < 0) return null;
      return [
        {
          op: 'replaceText',
          at: { elementId: block.elementId, from: at, to: at + 9, expect: 'condition' },
          text: 'operating state',
        },
      ];
    });
  const comment = () =>
    run((current) => {
      const block = paragraphAfter(current, 'Timing');
      if (!block) return null;
      return [
        {
          op: 'comment',
          at: { elementId: block.elementId, from: 0, to: 15 },
          text: 'Is this tested?',
        },
      ];
    });
  const shorten = async () => {
    if (!view) return;
    const result = await runSelectionAction(view, SHORTEN, { action: 'shorten', mode });
    setReport(result.ok ? 'Shortened the selection' : `Not shortened: ${result.reason}`);
  };
  const stream = () => {
    const block = view && paragraphAfter(view, 'Interfaces');
    if (!view || !block || streaming.current !== null) return;
    const writer = streamText(view, { elementId: block.elementId }, { actor: AGENT, mode });
    const pieces = [' The agent', ' writes', ' this note', ' piece', ' by piece.'];
    const owner = view.dom.ownerDocument.defaultView;
    const next = () => {
      const piece = pieces.shift();
      if (piece === undefined || !writer.append(piece)) {
        writer.finish();
        streaming.current = null;
        setReport('Streamed a note');
        return;
      }
      streaming.current = owner?.setTimeout(next, 60) ?? null;
    };
    next();
  };
  return (
    <fieldset className="lab-agent">
      <legend>Agent</legend>
      <label>
        <input
          type="checkbox"
          name="agent-suggests"
          checked={mode === 'suggest'}
          onChange={(event) => setMode(event.currentTarget.checked ? 'suggest' : 'direct')}
        />{' '}
        Agent suggests
      </label>
      <button type="button" onClick={rewrite}>
        Rewrite a phrase
      </button>
      <button type="button" onClick={comment}>
        Comment on a sentence
      </button>
      <button type="button" onClick={() => void shorten()}>
        Shorten the selection
      </button>
      <button type="button" onClick={stream}>
        Stream a note
      </button>
      <output aria-label="Agent report">{report}</output>
    </fieldset>
  );
}
