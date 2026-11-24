// The caption labels a document shows that CSS counters would draw. A page out of view is not drawn
// (`content-visibility: auto`), so a counter there counts nothing; the engine counts them instead,
// from the document and its template, and lays them out and draws them as text
// (DOCE-PAGINATION-10.7). Footnote numbers come from the pages' node numbers, heading and paragraph
// numbers from the text layout engine's own numbering.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { ContentsKind } from '../../model/contents/contents-kinds.js';
import { catalogDocument } from '../../model/contents/document-catalog.js';
import type { TemplateFile } from '../../model/format/template-format.js';
import { repeatedCaptionOf } from '../../model/pagination/held-split.js';
import { captionNodeOf } from '../../model/schema/caption-content.js';

/** The caption labels of one document, by node. */
interface CaptionNumbers {
  /**
   * A caption's label and the ` - ` after it, as the label line draws it, or linked code's own;
   * none when it shows none.
   */
  labelOf(caption: ProseMirrorNode): string | undefined;
  /** Every caption's label, in the document's order, as one key. */
  readonly labelsKey: string;
}

// What a caption label adds after its number (`::before { content: … ' - ' }`).
const LABEL_SEPARATOR = ' - ';

// Every captioned object, whether its caption shows or not; one that shows none gets no label.
const CAPTIONED: Readonly<Record<string, ContentsKind>> = {
  figures: { nodes: ['figure'] },
  tables: { nodes: ['table'] },
  code: { nodes: ['code_block', 'linked_code_block'] },
};

function captionLabels(doc: ProseMirrorNode, template: TemplateFile) {
  const labels = new Map<ProseMirrorNode, string>();
  const catalog = catalogDocument(doc, template, CAPTIONED);
  for (const entry of Object.values(catalog).flat()) {
    const $pos = doc.resolve(entry.pos);
    const object = $pos.nodeAfter;
    if (!object || object.attrs.captionEnabled === false || !entry.number) continue;
    // Linked code draws its caption from its address: its label goes with the node itself.
    const caption =
      object.type.name === 'linked_code_block' ? object : captionNodeOf(object, $pos.parent);
    if (caption) labels.set(caption, entry.number + LABEL_SEPARATOR);
  }
  return labels;
}

/**
 * The caption labels of a document under its template, each section by its own scope. Repeated
 * captions can be found by element id when editing a header row gives its copies different node
 * identities.
 */
export function captionNumbers(doc: ProseMirrorNode, template: TemplateFile): CaptionNumbers {
  const labels = captionLabels(doc, template);
  const ids = new Map<string, string>();
  for (const [caption, label] of labels) {
    const id: unknown = caption.attrs.dataId;
    if (typeof id === 'string' && id) ids.set(id, label);
  }
  return {
    labelOf: function labelOf(caption): string | undefined {
      const label = labels.get(caption);
      if (label !== undefined) return label;
      const id: unknown = caption.attrs.dataId;
      if (typeof id === 'string' && ids.has(id)) return ids.get(id);
      // A later part's caption, made again by a split after an edit, shows the label of the
      // caption it repeats.
      const repeated = repeatedCaptionOf(caption);
      return repeated ? labelOf(repeated) : undefined;
    },
    labelsKey: [...labels.values()].join('|'),
  };
}
