// The buttons on the pages that add a template section the document lacks: one at each insert
// point, after the last page of the section before it, named by the section's label or name.

import type { EditorState } from 'prosemirror-state';
import type { Decoration, EditorView } from 'prosemirror-view';
import {
  insertTemplateSection,
  templateSectionInsertPoints,
} from '../../engine/section-insertion.js';
import type { TemplateFile } from '../../model/index.js';
import { viewOnlyWidget } from '../../utils/view-only-decorations.js';
import { runCommand } from './table-actions.js';

/** The hook class of a button that adds a template section; `data-section-name` names it. */
const SECTION_INSERT_CLASS = 'de-section-insert';

/** What the add-section buttons add and how they are named. */
export interface SectionInsertButtons {
  readonly template: TemplateFile;
  readonly label: (name: string) => string;
}

// A button that adds the template section named, where the template places it.
function buttonFor(
  view: EditorView,
  name: string,
  { template, text }: { template: TemplateFile; text: string },
) {
  const button = view.dom.ownerDocument.createElement('button');
  button.type = 'button';
  button.className = SECTION_INSERT_CLASS;
  button.contentEditable = 'false';
  button.dataset.sectionName = name;
  button.textContent = text;
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', () => runCommand(view, insertTemplateSection(template, name)));
  return button;
}

/** A button at each place the document could take an insertable template section it lacks. */
export function sectionInsertDecorations(
  state: EditorState,
  { template, label }: SectionInsertButtons,
): Decoration[] {
  return templateSectionInsertPoints(state.doc, template).map(({ name, section, pos }) => {
    const text = label(section.label || name);
    return viewOnlyWidget(pos, (view) => buttonFor(view, name, { template, text }), {
      side: 1,
      key: `section-insert-${name}-${text}`,
      ignoreSelection: true,
      stopEvent: () => true,
    });
  });
}
