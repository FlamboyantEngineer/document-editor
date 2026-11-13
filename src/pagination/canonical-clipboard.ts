// The clipboard on the pages. A copy, a cut or a drag takes the canonical selection's content,
// whole blocks with no page between them, where the pages' own slice would hold the pages it
// crosses and the parts of split blocks (DOCE-PAGINATION-7.11). The canonical plugins then make
// of it, and of a paste or a drop, what they would on a view of the canonical state: the slice and
// the text they copy, the HTML and text they transform, the text they parse and the slice they
// transform, on the canonical view (DOCE-PAGINATION-7.15).

import type { ResolvedPos, Slice } from 'prosemirror-model';
import type { Plugin } from 'prosemirror-state';
import type { EditorProps, EditorView } from 'prosemirror-view';
import { contentSlice } from '../model/index.js';
import { type CanonicalPluginsSource, canonicalViewOf } from './canonical-plugins.js';
import { canonicalSelection } from './selection-mirror.js';

type Props = EditorProps;
type Step<T> = (plugin: Plugin, value: T, canonical: EditorView) => T;

// Each canonical plugin's transform of a pasted value, in order, on the canonical view.
function transformed<T>(
  source: CanonicalPluginsSource,
  view: EditorView,
  { value, step }: { value: T; step: Step<T> },
) {
  const canonical = canonicalViewOf(view, source);
  return source
    .canonical()
    .plugins.reduce((current, plugin) => step(plugin, current, canonical), value);
}

interface PastedText {
  readonly text: string;
  readonly $context: ResolvedPos;
  readonly plain: boolean;
}

// The first canonical plugin's parse of pasted text, in the canonical document at the paste.
function parsedText(
  source: CanonicalPluginsSource,
  view: EditorView,
  { text, $context, plain }: PastedText,
): Slice | null {
  const canonical = source.canonical();
  const at = source.map().toCanonical($context.pos);
  if (at === null) return null;
  const $at = canonical.doc.resolve(at);
  const canonicalView = canonicalViewOf(view, source);
  for (const plugin of canonical.plugins) {
    const slice = plugin.props.clipboardTextParser?.call(plugin, text, $at, plain, canonicalView);
    if (slice) return slice;
  }
  return null;
}

// What the pages copy: the content of the canonical selection theirs stands for. A slice that is
// not the selection's, as a dragged node's, or whose selection maps nowhere, is taken as the blocks
// its pages hold.
function copiedSlice(source: CanonicalPluginsSource, view: EditorView, slice: Slice): Slice {
  const { selection, doc } = view.state;
  const map = source.map();
  const own = doc === map.projection && slice.eq(selection.content());
  const mapped = own ? canonicalSelection(map, selection, source.canonical().doc) : null;
  return mapped ? mapped.content() : contentSlice(slice, source.rules());
}

// The first canonical plugin's text of a copied slice; none leaves the text to the view.
function copiedText(source: CanonicalPluginsSource, view: EditorView, slice: Slice): string {
  const canonical = canonicalViewOf(view, source);
  for (const plugin of source.canonical().plugins) {
    const text = plugin.props.clipboardTextSerializer?.call(plugin, slice, canonical);
    if (text) return text;
  }
  return '';
}

type ClipboardProps = Pick<
  Props,
  | 'transformCopied'
  | 'clipboardTextSerializer'
  | 'transformPastedHTML'
  | 'transformPastedText'
  | 'transformPasted'
  | 'clipboardTextParser'
>;

/** The canonical plugins' clipboard props, for a projection plugin. */
export function canonicalClipboard(source: CanonicalPluginsSource): ClipboardProps {
  // With no canonical parse, the view's own parse of the text stands, as ProseMirror's does.
  const parse = (view: EditorView, pasted: PastedText) => parsedText(source, view, pasted) as Slice;
  return {
    transformCopied: (slice, view) =>
      transformed(source, view, {
        value: copiedSlice(source, view, slice),
        step: (plugin, value, canonical) =>
          plugin.props.transformCopied?.call(plugin, value, canonical) ?? value,
      }),
    clipboardTextSerializer: (slice, view) => copiedText(source, view, slice),
    transformPastedHTML: (html, view) =>
      transformed(source, view, {
        value: html,
        step: (plugin, value, canonical) =>
          plugin.props.transformPastedHTML?.call(plugin, value, canonical) ?? value,
      }),
    transformPastedText: (text, plain, view) =>
      transformed(source, view, {
        value: text,
        step: (plugin, value, canonical) =>
          plugin.props.transformPastedText?.call(plugin, value, plain, canonical) ?? value,
      }),
    // A slice that holds pages, as another view of pages copied it, would add a page to a section.
    transformPasted: (slice, view, plain) =>
      transformed(source, view, {
        value: contentSlice(slice, source.rules()),
        step: (plugin, value, canonical) =>
          plugin.props.transformPasted?.call(plugin, value, canonical, plain) ?? value,
      }),
    clipboardTextParser: (...[text, $context, plain, view]) =>
      parse(view, { text, $context, plain }),
  };
}
