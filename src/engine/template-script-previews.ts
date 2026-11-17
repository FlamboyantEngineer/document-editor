// What a template's script blocks would produce, shown while its content is edited in place: each
// script block of a template part with no output of its own shows what its script produced in a
// preview run, drawn beside the document and never part of it, so the template keeps the script
// alone. A preview is kept by its script for the runner, so showing the template again, such as
// after it remounts, runs no script whose source did not change.

import { DOMSerializer, Fragment, type Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type { ScriptRunnerAdapter } from '../host/index.js';
import { readStoredContent, templatePartSections, writeDocumentFile } from '../model/index.js';

/** What the previews read: the runner, while there is one, and whether template content is edited. */
export interface TemplateScriptPreviewsOptions {
  readonly runner: () => ScriptRunnerAdapter | undefined;
  readonly enabled: () => boolean;
}

// What a script produced in its preview run, by its source, for each runner: null for nothing.
const previews = new WeakMap<ScriptRunnerAdapter, Map<string, Fragment | null>>();

const previewsOf = (runner: ScriptRunnerAdapter) => {
  let kept = previews.get(runner);
  if (!kept) previews.set(runner, (kept = new Map()));
  return kept;
};

/** The key of the template script previews plugin. */
const templateScriptPreviewsKey = new PluginKey<DecorationSet>('templateScriptPreviews');

interface Block {
  readonly pos: number;
  readonly node: ProseMirrorNode;
}

// The script blocks of the template's parts that show no output of their own.
function partScripts(doc: ProseMirrorNode): Block[] {
  const found: Block[] = [];
  for (const { content } of templatePartSections(doc)) {
    content.node.descendants((node, offset) => {
      if (node.type.name !== 'script_block') return true;
      if (node.childCount === 0) found.push({ pos: content.pos + 1 + offset, node });
      return false;
    });
  }
  return found;
}

// The preview of a script's output, drawn from the document's own markup and never edited.
function previewDom(view: EditorView, content: Fragment): HTMLElement {
  const owner = view.dom.ownerDocument;
  const dom = owner.createElement('div');
  dom.className = 'de-script-preview';
  dom.setAttribute('contenteditable', 'false');
  dom.appendChild(
    DOMSerializer.fromSchema(view.state.schema).serializeFragment(content, { document: owner }),
  );
  return dom;
}

function decorate(state: EditorState, runner: ScriptRunnerAdapter | undefined): DecorationSet {
  if (!runner) return DecorationSet.empty;
  const kept = previewsOf(runner);
  const decorations = partScripts(state.doc).flatMap(({ pos, node }) => {
    const source = String(node.attrs.script ?? '');
    const content = kept.get(source);
    if (!content) return [];
    const widget = Decoration.widget(pos + 1, (view) => previewDom(view, content), {
      key: `script-preview:${source}`,
      ignoreSelection: true,
    });
    return [widget, Decoration.node(pos, pos + node.nodeSize, { 'data-script-preview': 'true' })];
  });
  return DecorationSet.create(state.doc, decorations);
}

// Runs each part script that has no preview yet, for the purpose `preview`, then draws it.
function runMissing(view: EditorView, runner: ScriptRunnerAdapter, asked: Set<string>) {
  const kept = previewsOf(runner);
  for (const { node } of partScripts(view.state.doc)) {
    const source = String(node.attrs.script ?? '');
    if (!source.trim() || kept.has(source) || asked.has(source)) continue;
    asked.add(source);
    const blockId = String(node.attrs.dataId ?? 'preview');
    const request = { purpose: 'preview' as const, blockId, source };
    void runner
      .run({ ...request, document: writeDocumentFile(view.state.doc) })
      .then((result) => {
        let content: Fragment | null = null;
        if (result.ok && result.value.content.length > 0) {
          content = Fragment.from(readStoredContent(result.value.content, view.state.schema));
        }
        kept.set(source, content);
      })
      .catch(() => kept.set(source, null))
      .finally(() => {
        asked.delete(source);
        if (!view.isDestroyed)
          view.dispatch(view.state.tr.setMeta(templateScriptPreviewsKey, true));
      });
  }
}

/**
 * Shows, while a template's content is edited in place (`enabled`) beside a runner, what each
 * script block of its parts without output would produce: run once for its script with purpose
 * `preview`, drawn after the block's start (`de-script-preview`, the block marked
 * `data-script-preview`), never part of the document.
 */
export function createTemplateScriptPreviews(options: TemplateScriptPreviewsOptions): Plugin {
  const runner = () => (options.enabled() ? options.runner() : undefined);
  return new Plugin<DecorationSet>({
    key: templateScriptPreviewsKey,
    state: {
      init: (_config, state) => decorate(state, runner()),
      apply: (...[tr, value, , state]) =>
        tr.docChanged || tr.getMeta(templateScriptPreviewsKey) ? decorate(state, runner()) : value,
    },
    props: { decorations: (state) => templateScriptPreviewsKey.getState(state) ?? null },
    view(view) {
      const asked = new Set<string>();
      const check = () => {
        const shown = runner();
        if (shown) runMissing(view, shown, asked);
      };
      check();
      return {
        update(current, previous) {
          if (current.state.doc !== previous.doc) check();
        },
      };
    },
  });
}

// What a run records on a script block, which a template's script, never run there, has none of.
const RUN_ATTRS = { renderedAt: null, provenance: null, signatures: null };

/**
 * Content with each script block's output, and what its run recorded, left out, as a template
 * stores its parts: a document made from the template runs its scripts itself.
 */
export function withoutScriptOutput(content: Fragment): Fragment {
  const nodes: ProseMirrorNode[] = [];
  content.forEach((node) => {
    if (node.type.name === 'script_block') {
      nodes.push(node.type.create({ ...node.attrs, ...RUN_ATTRS }, null, node.marks));
    } else if (node.isTextblock || node.isLeaf) nodes.push(node);
    else nodes.push(node.copy(withoutScriptOutput(node.content)));
  });
  return Fragment.from(nodes);
}
