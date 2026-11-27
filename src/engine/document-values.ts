// The texts a document stores for its variables (DOCE-FORMAT-1.7), brought up to date as an edit:
// each variable other than a page's number and the page count is shown from the document, never
// asked of the host or the clock while the pages are laid out, so every machine, viewer and print
// lays the same document out alike. A refresh asks the host for each key the document shows and
// writes today's date; it changes the document, so it is saved and shared like any other edit.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type Command, type EditorState, Plugin, type Transaction } from 'prosemirror-state';
import { ReplaceAroundStep, ReplaceStep } from 'prosemirror-transform';
import {
  documentLanguage,
  type DocumentValues,
  LAYOUT_VARIABLES,
  storedValues,
  type TemplateFile,
} from '../model/index.js';
import { templateBlockKeys } from './template-block-render.js';

/** Where a refresh takes the variables' texts from. */
export interface ValueSource {
  /** A host variable's text now, such as `document.name`'s; null or undefined for none. */
  readonly value?: ((key: string) => string | null | undefined) | undefined;
  /** The time `date.current` is written at. Defaults to now. */
  readonly now?: (() => Date) | undefined;
  /** The locale `date.current` is written in. Defaults to the document's language. */
  readonly locale?: string | undefined;
  /** The template, whose regions' variables are refreshed too and whose language is the default. */
  readonly template?: TemplateFile | undefined;
}

/** Whether a refresh writes every key's text again or only those the document stores none for. */
export type ValueRefresh = 'all' | 'missing';

// The keys of the variables stored content holds, as a template's regions hold them.
function storedKeys(value: unknown, keys: Set<string>): void {
  if (Array.isArray(value)) {
    for (const each of value) storedKeys(each, keys);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  const attrs = record.attrs as Record<string, unknown> | undefined;
  if (record.type === 'variable' && typeof attrs?.key === 'string') keys.add(attrs.key);
  for (const child of Object.values(record)) storedKeys(child, keys);
}

/**
 * The keys of the variables a document shows that it stores the text of: those in its text, its
 * page regions and its template blocks, and, with its template, those of the template's regions;
 * never a page's number or the page count.
 */
export function documentValueKeys(doc: ProseMirrorNode, template?: TemplateFile): string[] {
  const keys = new Set<string>();
  doc.descendants((node) => {
    if (node.type.name === 'template_variable') keys.add(String(node.attrs.variableKey ?? ''));
    if (node.type.name === 'dynamic_template')
      for (const key of templateBlockKeys(node)) keys.add(key);
    return node.type.name !== 'dynamic_template';
  });
  if (template) storedKeys(template, keys);
  return [...keys].filter((key) => key && !LAYOUT_VARIABLES.has(key));
}

// The text a key has now: today's date in the locale, or the host's; null when the host gives none.
function textNow(key: string, source: ValueSource, locale: string): string | null {
  if (key === 'date.current') {
    const now = source.now?.() ?? new Date();
    return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(now);
  }
  return source.value?.(key) ?? null;
}

/**
 * The texts a document's variables have after a refresh: each key it shows written again, or,
 * for `missing`, only those it stores none for, the others kept. A key the host gives no text for
 * stores none, so a document whose host gives no variables is left as it is.
 */
export function refreshedValues(
  doc: ProseMirrorNode,
  source: ValueSource,
  refresh: ValueRefresh = 'all',
): DocumentValues {
  const stored = storedValues(doc);
  const locale = source.locale ?? documentLanguage(doc, source.template);
  const next: Record<string, string> = refresh === 'missing' ? { ...stored } : {};
  for (const key of documentValueKeys(doc, source.template)) {
    if (refresh === 'missing' && key in stored) continue;
    const text = textNow(key, source, locale);
    if (text !== null) next[key] = text;
  }
  return next;
}

const sameValues = (one: DocumentValues, other: DocumentValues) => {
  const keys = Object.keys(one);
  return keys.length === Object.keys(other).length && keys.every((key) => one[key] === other[key]);
};

// The change that stores a document's refreshed texts; null when they are the texts it stores.
function valuesChange(state: EditorState, source: ValueSource, refresh: ValueRefresh) {
  const next = refreshedValues(state.doc, source, refresh);
  if (sameValues(next, storedValues(state.doc))) return null;
  return state.tr.setDocAttribute('values', Object.keys(next).length ? next : null);
}

/**
 * Brings the texts the document stores for its variables up to date, as one edit
 * (DOCE-PAGINATION-8.8); false when they already are.
 */
export function refreshDocumentValues(source: ValueSource, refresh: ValueRefresh = 'all'): Command {
  return (state, dispatch) => {
    const tr = valuesChange(state, source, refresh);
    if (!tr) return false;
    dispatch?.(tr);
    return true;
  };
}

// Whether a change inserts a variable or a template block, which may show a key with no text yet.
function insertsVariable(tr: Transaction): boolean {
  return tr.steps.some((step) => {
    if (!(step instanceof ReplaceStep || step instanceof ReplaceAroundStep)) return false;
    let found = false;
    step.slice.content.descendants((node) => {
      found ||= node.type.name === 'template_variable' || node.type.name === 'dynamic_template';
      return !found;
    });
    return found;
  });
}

/**
 * Stores the text of each variable a writer's edit adds that the document has none for, in the
 * same change, from the source: a variable inserted from the menu, typed, pasted or brought back
 * by undo shows its value at once. Changes out of the history, such as another writer's, are left,
 * and so is every change while `source` gives null, as it does while the writer suggests or reads:
 * no suggestion records a change of the top node, which a room refuses from a suggester.
 */
export function createDocumentValues(source: () => ValueSource | null): Plugin {
  return new Plugin({
    appendTransaction(transactions, _old, state) {
      const added = transactions.some(
        (tr) => tr.docChanged && tr.getMeta('addToHistory') !== false && insertsVariable(tr),
      );
      const from = added ? source() : null;
      return from ? valuesChange(state, from, 'missing') : null;
    },
  });
}
