// The properties pane: what the document, the section at the caret and the block at the caret are,
// in the base library's property panel. The document's template, sections, pages and words; the
// section's template section, page size, orientation and margins; the block's style, element id
// and author. A host adds rows and actions to these sections, and sections of its own among them.

import {
  PropertyPanel,
  PropertyRow,
  PropertySection,
} from '@flamboyantengineer/ui-components/property-panel';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import { type ReactNode, useMemo } from 'react';
import { customStyleAt, documentStatistics } from '../../engine/index.js';
import {
  documentSections,
  findTemplateSection,
  isStructureNode,
  sectionAt,
  type TemplateFile,
} from '../../model/index.js';
import { pageMap } from '../../pagination/index.js';
import { type EditorContext, useDocumentEditor } from '../document-editor/document-editor.js';
import { DEFAULT_PANELS_LABELS, type DocumentPanelsLabels } from './panel-labels.js';

/** A built-in section of the properties pane, by its id. */
export type PropertiesSectionId = 'document' | 'section' | 'selection';

/** A section a host adds to the properties pane. */
export interface PropertiesSection {
  /** Unique among the pane's sections. */
  readonly id: string;
  readonly title: string;
  /** Its rows (`PropertyRow`), given the editor's context. */
  readonly render: (context: EditorContext) => ReactNode;
  /** Buttons after its title, given the editor's context. */
  readonly renderActions?: ((context: EditorContext) => ReactNode) | undefined;
}

/** What a host adds to a built-in section: rows after its own, and buttons after its title. */
export interface PropertiesSectionExtension {
  readonly renderRows?: ((context: EditorContext) => ReactNode) | undefined;
  readonly renderActions?: ((context: EditorContext) => ReactNode) | undefined;
}

/** What the properties pane shows. */
export interface DocumentPropertiesProps {
  /** The editor described; the editor holding the pane by default. */
  readonly context?: EditorContext | null | undefined;
  /** The template the document and its sections take their pages from. */
  readonly template?: TemplateFile | undefined;
  /** Its sections, in order: built-in ones by id and the host's; the three built-in ones by default. */
  readonly sections?: readonly (PropertiesSectionId | PropertiesSection)[] | undefined;
  /** Rows and buttons a host adds to the built-in sections. */
  readonly extend?: Partial<Record<PropertiesSectionId, PropertiesSectionExtension>> | undefined;
  readonly labels?: Partial<DocumentPanelsLabels> | undefined;
  readonly className?: string | undefined;
}

const BUILT_IN_SECTIONS: readonly PropertiesSectionId[] = ['document', 'section', 'selection'];

interface Described {
  readonly context: EditorContext;
  readonly template: TemplateFile | undefined;
  readonly labels: DocumentPanelsLabels;
  readonly extension: PropertiesSectionExtension | undefined;
}

// The section and the block the caret is in.
function caretNodes(state: EditorState) {
  const { $head } = state.selection;
  let block: ProseMirrorNode | null = null;
  for (let depth = $head.depth; depth > 0 && !block; depth -= 1) {
    const node = $head.node(depth);
    if (!isStructureNode(node) && node.isBlock && node.attrs.dataId !== undefined) block = node;
  }
  return { section: sectionAt($head)?.node ?? null, block };
}

// What a host adds to a built-in section: its rows and the buttons after its title.
const extraRows = ({ extension, context }: Described) => extension?.renderRows?.(context);
const extraActions = ({ extension, context }: Described) => extension?.renderActions?.(context);

const text = (value: unknown, none: string) =>
  value === null || value === undefined || value === '' ? none : String(value);

function DocumentRows(described: Described) {
  const { context, template, labels } = described;
  const { state } = context;
  const sections = documentSections(state.doc).length;
  // The pages and words the status bar counts. The pages a projection shows the state on change
  // as it lays them out, the state unchanged.
  const pages = pageMap(state);
  const statistics = useMemo(() => documentStatistics(state, pages), [state, pages]);
  return (
    <PropertySection id="document" title={labels.document} actions={extraActions(described)}>
      <PropertyRow label={labels.template}>
        {text(template?.name ?? template?.id, labels.none)}
      </PropertyRow>
      <PropertyRow label={labels.sections}>{sections}</PropertyRow>
      <PropertyRow label={labels.pages}>{statistics.pages}</PropertyRow>
      <PropertyRow label={labels.words}>{statistics.words}</PropertyRow>
      {extraRows(described)}
    </PropertySection>
  );
}

function SectionRows(described: Described) {
  const { context, template, labels } = described;
  const { section } = caretNodes(context.state);
  const name = typeof section?.attrs.sectionName === 'string' ? section.attrs.sectionName : null;
  const own = template && name ? findTemplateSection(template, name) : null;
  // The section's page settings over the document's.
  const page = { ...template?.page, ...own?.page };
  const margins = { ...template?.page?.margins, ...own?.page?.margins };
  const none = labels.none;
  return (
    <PropertySection id="section" title={labels.section} actions={extraActions(described)}>
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
      {extraRows(described)}
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

function SelectionRows(described: Described) {
  const { context, labels } = described;
  const { block } = caretNodes(context.state);
  return (
    <PropertySection id="selection" title={labels.selection} actions={extraActions(described)}>
      <PropertyRow label={labels.style}>{text(styleOf(context, block), labels.none)}</PropertyRow>
      <PropertyRow label={labels.element}>{text(block?.attrs.dataId, labels.none)}</PropertyRow>
      <PropertyRow label={labels.author}>{text(block?.attrs.dataAuthor, labels.none)}</PropertyRow>
      {extraRows(described)}
    </PropertySection>
  );
}

const BUILT_IN_ROWS = { document: DocumentRows, section: SectionRows, selection: SelectionRows };

/**
 * The properties of the document, of the section at the caret and of the block at the caret, with
 * the host's rows, actions and sections.
 */
export function DocumentProperties(props: DocumentPropertiesProps) {
  const held = useDocumentEditor();
  const context = props.context ?? held;
  if (!context) return null;
  const labels = { ...DEFAULT_PANELS_LABELS, ...props.labels };
  const sections = props.sections ?? BUILT_IN_SECTIONS;
  const keys = sections.map((section) => (typeof section === 'string' ? section : section.id));
  return (
    <PropertyPanel
      className={props.className}
      isReadOnly
      allowsMultipleExpanded
      defaultExpandedKeys={keys}
    >
      {sections.map((section) => {
        if (typeof section !== 'string') {
          return (
            <PropertySection
              key={section.id}
              id={section.id}
              title={section.title}
              actions={section.renderActions?.(context)}
            >
              {section.render(context)}
            </PropertySection>
          );
        }
        const Rows = BUILT_IN_ROWS[section];
        return (
          <Rows
            key={section}
            context={context}
            template={props.template}
            labels={labels}
            extension={props.extend?.[section]}
          />
        );
      })}
    </PropertyPanel>
  );
}
