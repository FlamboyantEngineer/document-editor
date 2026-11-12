// Template blocks (`dynamic_template`): a block that shows its template markup with each `{{key}}`
// token in its text replaced by the variable's value, rendered again whenever a value it tracks
// changes. The markup is read from an inert document and then as the schema reads markup, so only
// the document's own nodes render and nothing in it runs or loads; values are inserted as text.

import {
  DOMParser as SchemaParser,
  DOMSerializer,
  type Node as ProseMirrorNode,
  type Schema,
} from 'prosemirror-model';
import { Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, type NodeView } from 'prosemirror-view';

/** A variable's text, or nothing to show none. */
export type TemplateValue = (key: string) => string | null | undefined;

/** Where template blocks get their values. */
export interface DynamicTemplatesOptions {
  /** The text of a variable other than `date.current`, such as `document.title`. */
  value?: TemplateValue | undefined;
  /** The time `date.current` shows, as the locale writes a date. Defaults to now. */
  now?: (() => Date) | undefined;
  /** The locale `date.current` is written in. Defaults to the browser's. */
  locale?: string | undefined;
}

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

function valueOf(key: string, options: DynamicTemplatesOptions): string {
  if (key === 'date.current') {
    const now = options.now?.() ?? new Date();
    return new Intl.DateTimeFormat(options.locale, { dateStyle: 'long' }).format(now);
  }
  return options.value?.(key) ?? '';
}

// The markup's body in an inert document, with each token in its text replaced by its value.
function filledBody(source: string, owner: Document, options: DynamicTemplatesOptions) {
  const Parser = owner.defaultView?.DOMParser;
  const inert = owner.implementation.createHTMLDocument('');
  const body = Parser ? new Parser().parseFromString(source, 'text/html').body : inert.body;
  if (!Parser) body.innerHTML = source;
  const walker = body.ownerDocument.createTreeWalker(body, 4);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    const value = text.nodeValue ?? '';
    if (value.includes('{{')) {
      text.nodeValue = value.replace(TOKEN, (_token, key: string) => valueOf(key, options));
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
 * A template block's markup rendered with its values: read as the schema reads markup and written
 * as the schema writes it, into the target's document.
 */
export function renderTemplateBlock(
  source: string,
  { schema, document: owner }: TemplateBlockTarget,
  options: DynamicTemplatesOptions = {},
): DocumentFragment {
  const slice = SchemaParser.fromSchema(schema).parseSlice(filledBody(source, owner, options));
  const fragment = owner.createDocumentFragment();
  fragment.append(
    DOMSerializer.fromSchema(schema).serializeFragment(slice.content, { document: owner }),
  );
  return fragment;
}

// What a template block shows, by its markup and its values, which renders it again when it moves.
function renderKey(node: ProseMirrorNode, options: DynamicTemplatesOptions): string {
  const values = templateBlockKeys(node).map((key) => `${key}=${valueOf(key, options)}`);
  return [String(node.attrs.templateHtml ?? ''), ...values].join('\n');
}

function decorate(doc: ProseMirrorNode, options: DynamicTemplatesOptions): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'dynamic_template') return !node.isTextblock;
    const key = renderKey(node, options);
    decorations.push(Decoration.node(pos, pos + node.nodeSize, { 'data-de-measure-key': key }));
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

/** Marks a transaction that renders the template blocks again, as after a value changed. */
export const dynamicTemplatesKey = new PluginKey<DecorationSet>('dynamic-templates');

/** Renders the template blocks again, out of the undo history, after a value they show changed. */
export function refreshDynamicTemplates(tr: Transaction): Transaction {
  return tr.setMeta(dynamicTemplatesKey, true).setMeta('addToHistory', false);
}

function templateBlockView(
  node: ProseMirrorNode,
  owner: Document,
  options: DynamicTemplatesOptions,
) {
  const dom = owner.createElement('div');
  dom.className = 'dynamic-template-block';
  dom.dataset.dynamicTemplate = 'true';
  dom.setAttribute('contenteditable', 'false');
  let shown = '';
  const render = (current: ProseMirrorNode) => {
    const key = renderKey(current, options);
    if (key === shown) return;
    shown = key;
    const source = String(current.attrs.templateHtml ?? '');
    dom.replaceChildren(
      renderTemplateBlock(source, { schema: current.type.schema, document: owner }, options),
    );
  };
  render(node);
  const view: NodeView = {
    dom,
    update(next) {
      if (next.type !== node.type) return false;
      render(next);
      return true;
    },
    ignoreMutation: () => true,
    stopEvent: () => false,
  };
  return view;
}

/**
 * Renders each template block's markup with its values, in every view it runs in, so the pages
 * measure what it shows; again when its markup changes, and, after `refreshDynamicTemplates`, when
 * a value it tracks does.
 */
export function createDynamicTemplates(
  options: DynamicTemplatesOptions = {},
): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: dynamicTemplatesKey,
    state: {
      init: (_config, state) => decorate(state.doc, options),
      apply: (tr, set) =>
        tr.docChanged || tr.getMeta(dynamicTemplatesKey) ? decorate(tr.doc, options) : set,
    },
    props: {
      decorations: (state) => dynamicTemplatesKey.getState(state) ?? null,
      nodeViews: {
        dynamic_template: (node, view) => templateBlockView(node, view.dom.ownerDocument, options),
      },
    },
  });
}
