// The properties pane: what the document, the section at the caret and the block at the caret are,
// in the base library's property panel. The document's template, sections, pages and words; the
// section's template section, page size, orientation and margins; the block's style, element id
// and author.

import {
  PropertyPanel,
  PropertyRow,
  PropertySection,
} from '@flamboyantengineer/ui-components/property-panel';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import { customStyleAt } from '../../engine/index.js';
import { countWords, findTemplateSection, type TemplateFile } from '../../model/index.js';
import { type EditorContext, useDocumentEditor } from '../document-editor/document-editor.js';
import { DEFAULT_PANELS_LABELS, type DocumentPanelsLabels } from './panel-labels.js';

/** What the properties pane shows. */
export interface DocumentPropertiesProps {
  /** The editor described; the editor holding the pane by default. */
  readonly context?: EditorContext | null | undefined;
  /** The template the document and its sections take their pages from. */
  readonly template?: TemplateFile | undefined;
  readonly labels?: Partial<DocumentPanelsLabels> | undefined;
  readonly className?: string | undefined;
}

interface Described {
  readonly context: EditorContext;
  readonly template: TemplateFile | undefined;
  readonly labels: DocumentPanelsLabels;
}

// The section and the block the caret is in.
function caretNodes(state: EditorState) {
  const { $head } = state.selection;
  let section: ProseMirrorNode | null = null;
  let block: ProseMirrorNode | null = null;
  for (let depth = $head.depth; depth > 0; depth -= 1) {
    const node = $head.node(depth);
    if (node.type.name === 'page_section') section = node;
    else if (!block && node.isBlock && node.attrs.dataId !== undefined) block = node;
  }
  return { section, block };
}

const text = (value: unknown, none: string) =>
  value === null || value === undefined || value === '' ? none : String(value);

function DocumentRows({ context, template, labels }: Described) {
  const { state, view } = context;
  let sections = 0;
  state.doc.forEach((node) => {
    if (node.type.name === 'page_section') sections += 1;
  });
  const pages = view ? view.dom.querySelectorAll('.pm-page').length : null;
  return (
    <PropertySection id="document" title={labels.document}>
      <PropertyRow label={labels.template}>
        {text(template?.name ?? template?.id, labels.none)}
      </PropertyRow>
      <PropertyRow label={labels.sections}>{sections}</PropertyRow>
      <PropertyRow label={labels.pages}>{text(pages, labels.none)}</PropertyRow>
      <PropertyRow label={labels.words}>{countWords(state.doc)}</PropertyRow>
    </PropertySection>
  );
}

function SectionRows({ context, template, labels }: Described) {
  const { section } = caretNodes(context.state);
  const name = typeof section?.attrs.sectionName === 'string' ? section.attrs.sectionName : null;
  const own = template && name ? findTemplateSection(template, name) : null;
  // The section's page settings over the document's.
  const page = { ...template?.page, ...own?.page };
  const margins = { ...template?.page?.margins, ...own?.page?.margins };
  const none = labels.none;
  return (
    <PropertySection id="section" title={labels.section}>
      <PropertyRow label={labels.section}>
        {own ? (own.label ?? own.name) : labels.body}
      </PropertyRow>
      <PropertyRow label={labels.pageSize}>{text(page.size, none)}</PropertyRow>
      <PropertyRow label={labels.orientation}>
        {page.orientation === 'landscape' ? labels.landscape : labels.portrait}
      </PropertyRow>
      <PropertyRow label={labels.margins}>
        {labels.marginValues({
          top: text(margins.top, none),
          right: text(margins.right, none),
          bottom: text(margins.bottom, none),
          left: text(margins.left, none),
        })}
      </PropertyRow>
    </PropertySection>
  );
}

// A block's style: its custom style, its heading level or its type.
function styleOf(context: EditorContext, block: ProseMirrorNode | null): string | null {
  const custom = customStyleAt(context.state);
  if (custom) return custom;
  if (!block) return null;
  if (block.type.name === 'heading') return context.labels.heading(Number(block.attrs.level));
  if (block.type.name === 'paragraph') return context.labels.paragraph;
  return block.type.name.replace(/_/g, ' ');
}

function SelectionRows({ context, labels }: Described) {
  const { block } = caretNodes(context.state);
  return (
    <PropertySection id="selection" title={labels.selection}>
      <PropertyRow label={labels.style}>{text(styleOf(context, block), labels.none)}</PropertyRow>
      <PropertyRow label={labels.element}>{text(block?.attrs.dataId, labels.none)}</PropertyRow>
      <PropertyRow label={labels.author}>{text(block?.attrs.dataAuthor, labels.none)}</PropertyRow>
    </PropertySection>
  );
}

/** The properties of the document, of the section at the caret and of the block at the caret. */
export function DocumentProperties(props: DocumentPropertiesProps) {
  const held = useDocumentEditor();
  const context = props.context ?? held;
  if (!context) return null;
  const described: Described = {
    context,
    template: props.template,
    labels: { ...DEFAULT_PANELS_LABELS, ...props.labels },
  };
  return (
    <PropertyPanel
      className={props.className}
      isReadOnly
      allowsMultipleExpanded
      defaultExpandedKeys={['document', 'section', 'selection']}
    >
      <DocumentRows {...described} />
      <SectionRows {...described} />
      <SelectionRows {...described} />
    </PropertyPanel>
  );
}
