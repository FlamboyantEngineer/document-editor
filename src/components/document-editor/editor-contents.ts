// The lists of contents a document editor draws unless its host installs its own: a contents
// plugin under the editor's template, with the kinds and labels the host gives, whose citations
// link where the host's references adapter says.

import type { EditorState, Plugin } from 'prosemirror-state';
import { contentsKey, type ContentsOptions, createContents } from '../../engine/index.js';
import type { ReferenceSourceAdapter } from '../../host/index.js';
import type { TemplateFile } from '../../model/index.js';

/** The kinds of list and the labels a document editor's lists of contents take from its host. */
export type EditorContentsOptions = Pick<ContentsOptions, 'kinds' | 'labels'>;

/** What the editor's own contents plugin reads, as the editor has it now. */
interface ContentsSource {
  readonly template: TemplateFile;
  readonly contents?: EditorContentsOptions | undefined;
  readonly referenceSource?: ReferenceSourceAdapter | undefined;
}

/** The editor's contents plugin, reading the template and the references adapter as they are. */
export function editorContents(latest: { readonly current: ContentsSource }): Plugin {
  const { contents } = latest.current;
  return createContents({
    template: () => latest.current.template,
    kinds: contents?.kinds,
    labels: contents?.labels,
    citationHref: (citation) => latest.current.referenceSource?.href?.(citation) ?? null,
  });
}

/** The plugins of the editor's own a state lacks, leaving out a contents plugin the host installed. */
export function lackedPlugins(state: EditorState, own: readonly Plugin[]): Plugin[] {
  const hosts = contentsKey.get(state);
  return own.filter(
    (plugin) => !state.plugins.includes(plugin) && !(hosts && plugin.spec.key === contentsKey),
  );
}
