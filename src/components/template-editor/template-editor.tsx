// The template editor: a template's settings in a filterable property panel, by section — its
// identity, page setup, text styles picked one at a time, header and footer with their content,
// lists, tables, code blocks, footnotes, the table of contents and change bars, and a host's own
// settings in extension slots — for the whole document or one of its template sections, picked by
// name. Each field holds the template's own value and shows the one it inherits while it has none;
// clearing a field inherits again. Every change hands the host a new template, so a document beside
// it restyles at once.

import { PropertyFilter } from '@flamboyantengineer/ui-components/property-filter';
import { PropertySection } from '@flamboyantengineer/ui-components/property-panel';
import { Fragment } from 'react';
import type { RegionChange } from '../../engine/index.js';
import type { TemplateFile, TemplateSection } from '../../model/index.js';
import { createHooks } from '../../utils/hooks.js';
import { MarginsRow } from './margins-row.js';
import { CustomStyleSection, TextStyleSection } from './style-sections.js';
import {
  extensionRows,
  ExtensionSections,
  type TemplateExtensionSlots,
} from './template-extensions.js';
import {
  DEFAULT_TEMPLATE_IDENTITY_LABELS,
  TemplateIdentity,
  type TemplateIdentityLabels,
  type TemplateParentOption,
} from './template-identity.js';
import { type Rows, rows, type Target } from './template-rows.js';
import {
  DEFAULT_TEMPLATE_SCOPE_LABELS,
  ScopePicker,
  SECTION_SCOPED,
  SectionRows,
  type TemplateScopeLabels,
} from './template-scope.js';
import {
  type TemplateScope,
  type TemplateScopeProps,
  useTemplateScope,
} from './template-scope-state.js';
import { withNamedSection } from './template-section-list.js';
import { TEMPLATE_SECTIONS, withSetting } from './template-settings.js';

const hooks = createHooks('template-editor');

/** The template editor's own text. */
export interface TemplateEditorLabels extends TemplateScopeLabels, TemplateIdentityLabels {
  readonly panel: string;
  readonly filter: string;
  readonly textStyles: string;
  readonly numbering: string;
  readonly font: string;
  readonly size: string;
  /** Names the weight, slant and underline toggles and the alignment together. */
  readonly face: string;
  readonly bold: string;
  readonly italic: string;
  readonly underline: string;
  readonly alignment: string;
  readonly alignments: Readonly<Record<'left' | 'center' | 'right' | 'justify', string>>;
  readonly colour: string;
  readonly spacing: string;
  readonly spaceBefore: string;
  readonly spaceAfter: string;
  readonly lineHeight: string;
  readonly styleName: string;
  readonly overrideCustomStyle: string;
  /** Marks a custom style the template inherits. */
  readonly inheritedStyle: string;
  readonly noCustomStyles: string;
  readonly margins: string;
  readonly marginSides: Readonly<Record<'top' | 'right' | 'bottom' | 'left', string>>;
  readonly numberPrefix: string;
  readonly numberSuffix: string;
  /** Where a section's inherited values come from. */
  readonly documentSettings: string;
  readonly customStyle: string;
  readonly addCustomStyle: string;
  readonly deleteCustomStyle: string;
  /** Takes a row's own value away, so it inherits again. */
  readonly useInherited: string;
}

/** The template editor's English text. */
export const DEFAULT_TEMPLATE_EDITOR_LABELS: TemplateEditorLabels = {
  ...DEFAULT_TEMPLATE_IDENTITY_LABELS,
  ...DEFAULT_TEMPLATE_SCOPE_LABELS,
  panel: 'Template settings',
  filter: 'Filter settings',
  textStyles: 'Text styles',
  numbering: 'Numbering',
  font: 'Font',
  size: 'Size',
  face: 'Weight & align',
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  alignment: 'Alignment',
  alignments: { left: 'Left', center: 'Centre', right: 'Right', justify: 'Justify' },
  colour: 'Colour',
  spacing: 'Spacing',
  spaceBefore: 'Space before',
  spaceAfter: 'Space after',
  lineHeight: 'Line height',
  styleName: 'Name',
  overrideCustomStyle: 'Override the inherited style',
  inheritedStyle: 'inherited',
  noCustomStyles: 'No custom styles yet.',
  margins: 'Margins',
  marginSides: {
    top: 'Top margin',
    right: 'Right margin',
    bottom: 'Bottom margin',
    left: 'Left margin',
  },
  numberPrefix: 'Before the number',
  numberSuffix: 'After the number',
  documentSettings: 'the document settings',
  customStyle: 'Custom styles',
  addCustomStyle: 'Add a style',
  deleteCustomStyle: 'Delete the style',
  useInherited: 'Use the inherited value',
  inherited: (value, source) =>
    source ? `Inherited from ${source}: ${value}` : `Inherited: ${value}`,
};

/** What the template editor edits. */
export interface TemplateEditorProps extends TemplateScopeProps {
  /** The template's own settings. */
  readonly template: TemplateFile;
  /** The template resolved with its parents, whose values show where the template sets none. */
  readonly resolved?: TemplateFile | undefined;
  /** Receives the template after each change. */
  readonly onChange: (template: TemplateFile) => void;
  /**
   * Receives a template section's old and new name once a rename is committed, so the host can
   * follow it in what refers to the section by name.
   */
  readonly onSectionRename?: ((from: string, to: string) => void) | undefined;
  /**
   * The templates the template may inherit from, by id; one marked `cycle` inherits from the
   * template, so it is shown and cannot be picked.
   */
  readonly parentOptions?: readonly TemplateParentOption[] | undefined;
  /** Why the template's parent could not be loaded, shown under the parent field. */
  readonly parentError?: string | undefined;
  /** Whether the host has never saved the template, so its id is still a row to edit. */
  readonly isNew?: boolean | undefined;
  /** The host's own settings, kept in the template's `extensions`. */
  readonly extensions?: TemplateExtensionSlots | undefined;
  /** The fonts the font fields suggest; others may be typed. */
  readonly fonts?: readonly string[] | undefined;
  readonly labels?: Partial<TemplateEditorLabels> | undefined;
  readonly isDisabled?: boolean | undefined;
  readonly className?: string | undefined;
}

// The target of the rows: the template, or its named section over the resolved document.
function targetOf(
  props: TemplateEditorProps,
  scope: TemplateScope,
  labels: TemplateEditorLabels,
): Target {
  const { template, resolved, onChange } = props;
  const section = template.sections?.find((entry) => entry.name === scope);
  if (scope === null || !section) {
    const parent = props.parentOptions?.find((option) => option.id === template.parent);
    return {
      own: template,
      inherited: resolved,
      source: parent?.label ?? labels.noParent,
      set: (path, value) => onChange(withSetting(template, path, value)),
    };
  }
  const own = section as unknown as TemplateFile;
  return {
    own,
    inherited: resolved ?? template,
    source: labels.documentSettings,
    set: (path, value) =>
      onChange(
        withNamedSection(
          template,
          scope,
          () => withSetting(own, path, value) as unknown as TemplateSection,
        ),
      ),
  };
}

/**
 * A template with a region edited on the pages written into it, where the section's pages take the
 * region from (`resolveSectionRegion`): into the section's own region while it has one that does
 * not inherit, and into the document's otherwise.
 */
export function withRegionChange(template: TemplateFile, change: RegionChange): TemplateFile {
  const section = template.sections?.find((entry) => entry.name === change.section);
  const own = section?.[change.region];
  if (section && own && own.inherit !== true) {
    return withNamedSection(
      template,
      section.name,
      (entry) =>
        withSetting(
          entry as unknown as TemplateFile,
          [change.region, 'content'],
          change.content,
        ) as unknown as TemplateSection,
    );
  }
  return withSetting(template, [change.region, 'content'], change.content);
}

/** Edits a template's settings, handing each change to the host. */
export function TemplateEditor(props: TemplateEditorProps) {
  const labels = { ...DEFAULT_TEMPLATE_EDITOR_LABELS, ...props.labels };
  const { template, onChange, isDisabled, extensions } = props;
  const [scope, setScope] = useTemplateScope(props, template.sections);
  const context: Rows = { props, labels, target: targetOf(props, scope, labels) };
  const scoped = {
    template,
    scope,
    onScopeChange: setScope,
    onChange,
    onSectionRename: props.onSectionRename,
    labels,
    isDisabled,
  };
  // A host's own settings are the document's: a template section has no `extensions`.
  const slots = scope === null ? extensions : undefined;
  const sections = TEMPLATE_SECTIONS.filter(
    (section) => scope === null || SECTION_SCOPED.has(section.id),
  );
  return (
    <PropertyFilter
      {...hooks.root({
        className: props.className,
        data: { scope: scope === null ? 'document' : 'section' },
      })}
      aria-label={labels.panel}
      placeholder={labels.filter}
      isDisabled={isDisabled}
    >
      <TemplateIdentity
        template={template}
        onChange={onChange}
        parentOptions={props.parentOptions}
        parentError={props.parentError}
        isNew={props.isNew}
        isDisabled={isDisabled}
        labels={labels}
      >
        {slots?.rows?.identity ? extensionRows(context, slots.rows.identity) : null}
      </TemplateIdentity>
      <PropertySection id="scope" title={labels.scope} defaultExpanded>
        <ScopePicker {...scoped} />
      </PropertySection>
      <SectionRows {...scoped} />
      {sections.map((section) => (
        <Fragment key={section.id}>
          <PropertySection id={section.id} title={section.title}>
            {rows(
              context,
              section.scope,
              scope === null
                ? section.settings
                : section.settings.filter((setting) => !setting.documentOnly),
            )}
            {section.id === 'page' ? <MarginsRow context={context} /> : null}
            {slots?.rows?.[section.id]
              ? extensionRows(context, slots.rows[section.id] ?? [])
              : null}
          </PropertySection>
          {section.id === 'page' ? (
            <>
              <TextStyleSection context={context} />
              <CustomStyleSection context={context} />
            </>
          ) : null}
        </Fragment>
      ))}
      {slots ? <ExtensionSections context={context} slots={slots} /> : null}
    </PropertyFilter>
  );
}
