// The proofing plugin's view: it checks the document's unchecked text a short while after it
// changes, one check at a time, with every proofer, in batches a proofer takes at once and long
// blocks in segments. A check the document outran is aborted, and the next one starts from the new
// text; results wait while a pointer button is down, so they never redraw a selection being made.

import type { PluginView } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { ProofingText } from '../host/adapters.js';
import { readDomSelection } from '../utils/dom-selection.js';
import {
  proofingKey,
  type ProofingOptions,
  type ProofingStatus,
  type SourcedIssue,
  uncheckedBlocks,
} from './proofing.js';
import { type ProofedBlock, segmentsOf, type TextSegment } from './proofing-text.js';

// Whether a pointer button is down on the view: results committed during a drag would draw the
// selection the drag started from back over it, so they wait for the release and for the view to
// take it.
function pointerOn(view: EditorView) {
  const owner = view.dom.ownerDocument.defaultView;
  let pressed = false;
  let waiting: (() => void)[] = [];
  const press = () => {
    pressed = true;
  };
  const release = () => {
    if (!pressed) return;
    pressed = false;
    owner?.setTimeout(() => {
      const resolved = waiting;
      waiting = [];
      for (const resolve of resolved) resolve();
    }, 0);
  };
  view.dom.addEventListener('mousedown', press);
  owner?.addEventListener('mouseup', release);
  return {
    released: () =>
      pressed ? new Promise<void>((resolve) => waiting.push(resolve)) : Promise.resolve(),
    destroy() {
      view.dom.removeEventListener('mousedown', press);
      owner?.removeEventListener('mouseup', release);
      for (const resolve of waiting) resolve();
    },
  };
}

/** A block of a check, with the segments its text goes in. */
interface CheckedBlock {
  readonly block: ProofedBlock;
  readonly segments: readonly TextSegment[];
}

// The next blocks to check: as many as a check takes, by count and by length, and at least one.
function nextBatch(view: EditorView, options: ProofingOptions): CheckedBlock[] {
  const limit = options.batchLength ?? 6000;
  const count = options.batch ?? 50;
  const batch: CheckedBlock[] = [];
  let length = 0;
  for (const block of uncheckedBlocks(view.state)) {
    if (batch.length >= count || (batch.length > 0 && length + block.text.length > limit)) break;
    batch.push({ block, segments: segmentsOf(block.text, options.textLength ?? 2000) });
    length += block.text.length;
  }
  return batch;
}

// Each block's issues from every proofer's answers, by the block's text.
function collect(
  batch: readonly CheckedBlock[],
  answers: readonly PromiseSettledResult<readonly (readonly SourcedIssue[])[]>[],
) {
  const results = new Map<string, SourcedIssue[]>();
  for (const { block } of batch) results.set(block.text, []);
  answers.forEach((answer) => {
    if (answer.status !== 'fulfilled') return;
    let index = 0;
    for (const { block, segments } of batch) {
      for (const segment of segments) {
        for (const issue of answer.value[index] ?? []) {
          results.get(block.text)?.push({
            ...issue,
            from: issue.from + segment.offset,
            to: issue.to + segment.offset,
          });
        }
        index += 1;
      }
    }
  });
  return results;
}

function statusOf(answers: readonly PromiseSettledResult<unknown>[]): ProofingStatus {
  const failed = answers.filter((answer) => answer.status === 'rejected').length;
  if (failed === 0) return 'ready';
  return failed === answers.length ? 'unavailable' : 'degraded';
}

/** Checks a view's document with the plugin's proofers. */
export function proofingView(view: EditorView, options: ProofingOptions): PluginView {
  const owner = view.dom.ownerDocument.defaultView;
  const pointer = pointerOn(view);
  let timer: number | null = null;
  let running: AbortController | null = null;

  function clear() {
    if (timer !== null) owner?.clearTimeout(timer);
    timer = null;
  }

  function restart(delay: number) {
    running?.abort();
    running = null;
    schedule(delay);
  }

  function schedule(delay: number) {
    clear();
    timer =
      owner?.setTimeout(() => {
        timer = null;
        void run();
      }, delay) ?? null;
  }

  async function run() {
    const proofing = proofingKey.getState(view.state);
    const batch = nextBatch(view, options);
    if (!proofing || batch.length === 0 || running) return;
    const controller = new AbortController();
    running = controller;
    const texts: ProofingText[] = batch.flatMap(({ block, segments }) =>
      segments.map((segment) => ({
        text: segment.text,
        language: block.language ?? proofing.language,
      })),
    );
    // A proofer that fails marks nothing; the texts count as checked, and the status says so.
    const answers = await Promise.allSettled(
      proofing.proofers.map(async (proofer, source) => {
        const found = await proofer.check(texts, { signal: controller.signal });
        return found.map((issues) => issues.map((issue) => ({ ...issue, source })));
      }),
    );
    await pointer.released();
    if (running === controller) running = null;
    if (controller.signal.aborted || view.isDestroyed) return;
    readDomSelection(view);
    const meta = { results: collect(batch, answers), status: statusOf(answers) };
    view.dispatch(view.state.tr.setMeta(proofingKey, meta).setMeta('addToHistory', false));
    // More text than one check takes is checked next.
    schedule(0);
  }

  // The first check waits as long as one after a change, so it does not slow the editor's start.
  schedule(options.delay ?? 500);
  return {
    update(next, previous) {
      const now = proofingKey.getState(next.state);
      const before = proofingKey.getState(previous);
      if (now && before && now.results.size === 0 && before.results.size > 0) {
        // Every text starts over, as after a new language.
        restart(0);
        return;
      }
      if (next.state.doc.eq(previous.doc)) return;
      // A collaborator's change waits for the running check rather than aborting it.
      if (now?.remoteChange && running) return;
      restart(options.delay ?? 500);
    },
    destroy() {
      clear();
      running?.abort();
      pointer.destroy();
    },
  };
}
