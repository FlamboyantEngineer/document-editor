import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { catalogDocument, ELEMENT_KINDS } from '../model/contents/document-catalog.js';
import type { TemplateFile } from '../model/format/template-format.js';

const equations = { equations: ELEMENT_KINDS.equations };

/** The automatic numbers of body equations by position, including ones before the contents. */
export function equationNumbers(
  doc: ProseMirrorNode,
  template: TemplateFile,
): ReadonlyMap<number, string> {
  const entries = catalogDocument(doc, template, equations).equations ?? [];
  return new Map(entries.map(({ pos, number }) => [pos, number]));
}
