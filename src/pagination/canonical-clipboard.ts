// What the canonical plugins make of a paste or a drop on the pages: the HTML and text they
// transform, the text they parse, and the slice they transform, on the canonical view, as they
// would on a view of the canonical state (DOCE-PAGINATION-7.15).

import type { ResolvedPos, Slice } from 'prosemirror-model';
import type { Plugin } from 'prosemirror-state';
import type { EditorProps, EditorView } from 'prosemirror-view';
import { type CanonicalPluginsSource, canonicalViewOf } from './canonical-plugins.js';

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

type ClipboardProps = Pick<
  Props,
  'transformPastedHTML' | 'transformPastedText' | 'transformPasted' | 'clipboardTextParser'
>;

/** The canonical plugins' clipboard props, for a projection plugin. */
export function canonicalClipboard(source: CanonicalPluginsSource): ClipboardProps {
  // With no canonical parse, the view's own parse of the text stands, as ProseMirror's does.
  const parse = (view: EditorView, pasted: PastedText) => parsedText(source, view, pasted) as Slice;
  return {
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
    transformPasted: (slice, view, plain) =>
      transformed(source, view, {
        value: slice,
        step: (plugin, value, canonical) =>
          plugin.props.transformPasted?.call(plugin, value, canonical, plain) ?? value,
      }),
    clipboardTextParser: (...[text, $context, plain, view]) =>
      parse(view, { text, $context, plain }),
  };
}
