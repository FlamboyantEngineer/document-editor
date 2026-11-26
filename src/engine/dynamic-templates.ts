// Template blocks (`dynamic_template`): a block that shows its template markup with each `{{key}}`
// token in its text replaced by the text the document stores for the variable (DOCE-FORMAT-1.7),
// rendered again whenever a stored text it tracks changes; nothing is asked of the host or the
// clock as it renders. The markup is read from an inert document and then as the schema reads markup, so only
// the document's own nodes render and nothing in it runs or loads; values are inserted as text.

import {
  DOMParser as SchemaParser,
  DOMSerializer,
  type Node as ProseMirrorNode,
  type Schema,
} from 'prosemirror-model';
import { Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView, type NodeView } from 'prosemirror-view';
import { storedValue } from '../model/index.js';
import { isInlineTextOnly } from './transaction-kind.js';

/** The text a template block shows for a variable's key; empty for none. */
export type TemplateValue = (key: string) => string;

const TOKEN = /\{\{\s*([\w.-]+)\s*\}\}/g;

/** The keys a template block's markup shows: its tracked keys, else the keys of its tokens. */
export function templateBlockKeys(node: ProseMirrorNode): string[] {
  const tracked = String(node.attrs.trackedKeys ?? '')
    .split(/[\s,]+/)
    .filter(Boolean);
  if (tracked.length) return [...new Set(tracked)];
  const source = String(node.attrs.templateHtml ?? '');
  return [...new Set(Array.from(source.matchAll(TOKEN), (match) => match[1] ?? ''))];
}

// The texts a document stores, as a template block in it shows them.
const storedIn =
  (doc: ProseMirrorNode): TemplateValue =>
  (key) =>
    storedValue(doc, key);

const NO_VALUE: TemplateValue = () => '';

// The markup's body in an inert document, with each token in its text replaced by its value.
function filledBody(source: string, owner: Document, valueOf: TemplateValue) {
  const Parser = owner.defaultView?.DOMParser;
  const inert = owner.implementation.createHTMLDocument('');
  const body = Parser ? new Parser().parseFromString(source, 'text/html').body : inert.body;
  if (!Parser) body.innerHTML = source;
  const walker = body.ownerDocument.createTreeWalker(body, 4);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    const value = text.nodeValue ?? '';
    if (value.includes('{{')) {
      text.nodeValue = value.replace(TOKEN, (_token, key: string) => valueOf(key));
    }
  }
  return body;
}

/** What a template block renders with: the schema that reads and writes it, and its document. */
export interface TemplateBlockTarget {
  readonly schema: Schema;
  readonly document: Document;
}

/**
 * A template block's markup rendered with its values, each key's text as `value` gives it, empty
 * without: read as the schema reads markup and written as the schema writes it, into the target's
 * document.
 */
export function renderTemplateBlock(
  source: string,
  { schema, document: owner }: TemplateBlockTarget,
  value: TemplateValue = NO_VALUE,
): DocumentFragment {
  const slice = SchemaParser.fromSchema(schema).parseSlice(filledBody(source, owner, value));
  const fragment = owner.createDocumentFragment();
  fragment.append(
    DOMSerializer.fromSchema(schema).serializeFragment(slice.content, { document: owner }),
  );
  return fragment;
}

// What a template block shows, by its markup and its values, which renders it again when it moves.
function renderKey(node: ProseMirrorNode, valueOf: TemplateValue): string {
  const values = templateBlockKeys(node).map((key) => `${key}=${valueOf(key)}`);
  return [String(node.attrs.templateHtml ?? ''), ...values].join('\n');
}

function decorate(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  const valueOf = storedIn(doc);
  doc.descendants((node, pos) => {
    if (node.type.name !== 'dynamic_template') return !node.isTextblock;
    const key = renderKey(node, valueOf);
    decorations.push(Decoration.node(pos, pos + node.nodeSize, { 'data-de-measure-key': key }));
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

/** Marks a transaction that renders the template blocks again, as after a value changed. */
export const dynamicTemplatesKey = new PluginKey<DecorationSet>('dynamic-templates');

/** Renders the template blocks again, out of the undo history. */
export function refreshDynamicTemplates(tr: Transaction): Transaction {
  return tr.setMeta(dynamicTemplatesKey, true).setMeta('addToHistory', false);
}

// A template block's view, showing the texts its view's document stores now.
function templateBlockView(node: ProseMirrorNode, view: EditorView) {
  const owner = view.dom.ownerDocument;
  const valueOf: TemplateValue = (key) => storedValue(view.state.doc, key);
  const dom = owner.createElement('div');
  dom.className = 'dynamic-template-block';
  dom.dataset.dynamicTemplate = 'true';
  dom.setAttribute('contenteditable', 'false');
  let shown = '';
  const render = (current: ProseMirrorNode) => {
    const key = renderKey(current, valueOf);
    if (key === shown) return;
    shown = key;
    const source = String(current.attrs.templateHtml ?? '');
    dom.replaceChildren(
      renderTemplateBlock(source, { schema: current.type.schema, document: owner }, valueOf),
    );
  };
  render(node);
  const nodeView: NodeView = {
    dom,
    update(next) {
      if (next.type !== node.type) return false;
      render(next);
      return true;
    },
    ignoreMutation: () => true,
    stopEvent: () => false,
  };
  return nodeView;
}

/**
 * Renders each template block's markup with the texts the document stores, in every view it runs
 * in, so the pages measure what it shows; again when its markup or a stored text it tracks changes.
 */
export function createDynamicTemplates(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: dynamicTemplatesKey,
    state: {
      init: (_config, state) => decorate(state.doc),
      apply: (tr, set) => {
        if (tr.getMeta(dynamicTemplatesKey)) return decorate(tr.doc);
        if (!tr.docChanged) return set;
        // A template block's markup and the stored texts are attributes, so typed text cannot
        // change what one shows.
        return isInlineTextOnly(tr) ? set.map(tr.mapping, tr.doc) : decorate(tr.doc);
      },
    },
    props: {
      decorations: (state) => dynamicTemplatesKey.getState(state) ?? null,
      nodeViews: {
        dynamic_template: (node, view) => templateBlockView(node, view),
      },
    },
  });
}
