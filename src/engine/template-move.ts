// Moving a document to another template or revision: the sections the template owns brought in
// line with it and the references formatted by it, in one change.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type Command, EditorState } from 'prosemirror-state';
import type { TemplateFile } from '../model/index.js';
import { refreshReferences, updateReferences } from './references.js';
import { syncTemplateSections } from './template-sync.js';

/**
 * Brings the sections in line with the template and formats the references by it, in one change:
 * the sections' change carries the references' when it is made, the references' alone otherwise.
 */
export const moveToTemplate =
  (template: TemplateFile): Command =>
  (state, dispatch) =>
    syncTemplateSections(template)(
      state,
      dispatch &&
        ((tr) => {
          updateReferences(tr, template);
          dispatch(tr);
        }),
    ) || refreshReferences(template)(state, dispatch);

/** A document moved to a template (`moveToTemplate`), or null when moving changes nothing. */
export function movedDocument(
  doc: ProseMirrorNode,
  template: TemplateFile,
): ProseMirrorNode | null {
  let moved: ProseMirrorNode | null = null;
  moveToTemplate(template)(EditorState.create({ doc }), (tr) => {
    moved = tr.doc;
  });
  return moved;
}
