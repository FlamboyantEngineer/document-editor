import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { catalogDocument, ELEMENT_KINDS } from '../model/contents/document-catalog.js';
import type { TemplateFile } from '../model/format/template-format.js';

const equations = { equations: ELEMENT_KINDS.equations };

interface EquationNumbers {
  readonly positions: ReadonlyMap<number, string>;
  /** A uniquely matching equation's number or blank number. */
  readonly of: (node: ProseMirrorNode) => string | undefined;
}

const idOf = (node: ProseMirrorNode) => {
  const id: unknown = node.attrs.dataId;
  return typeof id === 'string' && id ? id : null;
};

/** The automatic numbers of body equations, including ones before the contents. */
export function equationNumbers(doc: ProseMirrorNode, template: TemplateFile): EquationNumbers {
  const entries = catalogDocument(doc, template, equations).equations ?? [];
  const positions = new Map(entries.map(({ pos, number }) => [pos, number]));
  const byNode = new WeakMap<ProseMirrorNode, string | null>();
  const byId = new Map<string, string | null>();
  doc.descendants((node, pos) => {
    if (node.type.name !== 'math_display') return !node.isTextblock;
    const number = positions.get(pos) ?? '';
    const id = idOf(node);
    byNode.set(node, byNode.has(node) ? null : number);
    if (id) byId.set(id, byId.has(id) ? null : number);
    return false;
  });
  return {
    positions,
    of: (node) => byNode.get(node) ?? byId.get(idOf(node) ?? '') ?? undefined,
  };
}
