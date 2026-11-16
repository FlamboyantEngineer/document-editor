import { DOMSerializer, type Node as ProseMirrorNode } from 'prosemirror-model';
import type { NodeViewConstructor } from 'prosemirror-view';

function renderTable(node: ProseMirrorNode, owner: Document) {
  const spec = node.type.spec.toDOM?.(node);
  if (!spec) throw new Error('A table needs a DOM representation.');
  const rendered = DOMSerializer.renderSpec(owner, spec);
  if (rendered.dom.nodeType !== 1 || !rendered.contentDOM)
    throw new Error('A table needs editable HTML content.');
  return { dom: rendered.dom as HTMLElement, contentDOM: rendered.contentDOM };
}

// Compare model markup, not live styles: a border drag can be previewing different column widths.
function updateAttributes(dom: HTMLElement, before: HTMLElement, after: HTMLElement) {
  const names = new Set([...before.getAttributeNames(), ...after.getAttributeNames()]);
  for (const name of names) {
    const value = after.getAttribute(name);
    if (value === before.getAttribute(name)) continue;
    if (value === null) dom.removeAttribute(name);
    else dom.setAttribute(name, value);
  }
}

function updateChrome(dom: HTMLElement, before: HTMLElement, after: HTMLElement) {
  updateAttributes(dom, before, after);
  for (const tag of ['caption', 'colgroup']) {
    const next = after.querySelector(`:scope > ${tag}`);
    if (next?.outerHTML === before.querySelector(`:scope > ${tag}`)?.outerHTML) continue;
    const old = dom.querySelector(`:scope > ${tag}`);
    if (!next) old?.remove();
    else if (old) old.replaceWith(next.cloneNode(true));
    else dom.insertBefore(next.cloneNode(true), dom.querySelector(':scope > tbody'));
  }
}

/** Keeps column markup in sync with cell attributes while leaving drag previews out of the model. */
export const createTableView: NodeViewConstructor = (node, view) => {
  const owner = view.dom.ownerDocument;
  const { dom, contentDOM } = renderTable(node, owner);
  let current = node;
  let markup = dom.cloneNode(true) as HTMLElement;
  return {
    dom,
    contentDOM,
    update(next) {
      if (next.type !== current.type) return false;
      if (!next.eq(current)) {
        const rendered = renderTable(next, owner);
        updateChrome(dom, markup, rendered.dom);
        markup = rendered.dom;
        current = next;
      }
      return true;
    },
    // Captions and column groups are derived presentation; only the body holds editable nodes.
    ignoreMutation: (mutation) =>
      mutation.type !== 'selection' && !contentDOM.contains(mutation.target),
  };
};
