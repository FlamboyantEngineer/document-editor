// The template editor's extension slots: a host's own settings, kept in the template's
// `extensions`, edited beside the built-in ones. A host adds rows to a built-in section, sections
// of rows after them, and panes it draws itself; each edits a value under `extensions`, which a
// template inherits from its parents like the rest.

import { PropertyRow, PropertySection } from '@flamboyantengineer/ui-components/property-panel';
import type { ReactNode } from 'react';
import { isUnset } from './setting-controls.js';
import { rows } from './setting-row.js';
import type { Rows } from './template-rows.js';
import { settingAt, type SettingKind, type TemplateSetting } from './template-settings.js';

/** What an extension's own field reads and changes: one value under `extensions`. */
export interface TemplateExtensionField {
  /** The template's own value; undefined while it has none. */
  readonly value: unknown;
  /** The value the template inherits from its parents. */
  readonly inherited: unknown;
  /** Sets the template's own value; null takes it away, so the template inherits again. */
  readonly onChange: (value: unknown) => void;
  readonly isDisabled: boolean;
}

/** A row of a host's own setting, at a path under the template's `extensions`. */
export interface TemplateExtensionRow {
  /** Unique in the editor. */
  readonly id: string;
  readonly label: string;
  /** Where the value sits under `extensions`, such as `['folder']` for `extensions.folder`. */
  readonly path: readonly string[];
  /** The built-in field that edits the value; without one, `render` draws the field. */
  readonly kind?: SettingKind | undefined;
  /** Draws the row's field, for a value no built-in kind edits. */
  readonly render?: ((field: TemplateExtensionField) => ReactNode) | undefined;
  /** Words the settings filter also finds the row by. */
  readonly keywords?: readonly string[] | undefined;
  /** A short caption under the field. */
  readonly hint?: string | undefined;
}

/** A section of a host's own rows, after the built-in sections. */
export interface TemplateExtensionSection {
  /** Unique among the editor's sections. */
  readonly id: string;
  readonly title: string;
  readonly rows: readonly TemplateExtensionRow[];
}

/** A pane the host draws itself, editing the whole value at a path under `extensions`. */
export interface TemplateExtensionPane {
  /** Unique among the editor's sections. */
  readonly id: string;
  readonly title: string;
  /** Where the value sits under `extensions`, such as `['fields']`. */
  readonly path: readonly string[];
  readonly render: (field: TemplateExtensionField) => ReactNode;
}

/** A host's own settings in the template editor. They edit the document's settings only. */
export interface TemplateExtensionSlots {
  /** Rows after a built-in section's own, by the section's id, such as `identity` or `page`. */
  readonly rows?: Readonly<Record<string, readonly TemplateExtensionRow[]>> | undefined;
  /** Sections of rows after the built-in sections. */
  readonly sections?: readonly TemplateExtensionSection[] | undefined;
  /** Panes after the sections. */
  readonly panes?: readonly TemplateExtensionPane[] | undefined;
}

const EXTENSIONS = ['extensions'];

// The field of the value at a path under `extensions`.
function fieldAt(context: Rows, path: readonly string[]): TemplateExtensionField {
  const { target, props } = context;
  const at = [...EXTENSIONS, ...path];
  return {
    value: settingAt(target.own, at),
    inherited: target.inherited ? settingAt(target.inherited, at) : undefined,
    onChange: (value) => target.set(at, value),
    isDisabled: Boolean(props.isDisabled),
  };
}

// A row whose field the host draws.
function DrawnRow({ context, row }: { context: Rows; row: TemplateExtensionRow }) {
  const field = fieldAt(context, row.path);
  return (
    <PropertyRow
      label={row.label}
      keywords={row.keywords}
      hint={row.hint}
      isOverridden={!isUnset(field.value)}
    >
      {row.render?.(field)}
    </PropertyRow>
  );
}

/** The rows of a host's own settings: a built-in field for a kind, or the host's own. */
export function extensionRows(
  context: Rows,
  extensionRows: readonly TemplateExtensionRow[],
): ReactNode[] {
  return extensionRows.flatMap((row): ReactNode[] => {
    if (!row.kind) return [<DrawnRow key={row.id} context={context} row={row} />];
    const setting: TemplateSetting = {
      id: row.id,
      path: row.path,
      label: row.label,
      kind: row.kind,
      ...(row.keywords ? { keywords: row.keywords } : {}),
      ...(row.hint ? { hint: row.hint } : {}),
    };
    return rows(context, EXTENSIONS, [setting]);
  });
}

/** The host's own sections and panes, after the built-in sections. */
export function ExtensionSections({
  context,
  slots,
}: {
  context: Rows;
  slots: TemplateExtensionSlots;
}) {
  return (
    <>
      {(slots.sections ?? []).map((section) => (
        <PropertySection key={section.id} id={section.id} title={section.title}>
          {extensionRows(context, section.rows)}
        </PropertySection>
      ))}
      {(slots.panes ?? []).map((pane) => (
        <PropertySection key={pane.id} id={pane.id} title={pane.title}>
          {pane.render(fieldAt(context, pane.path))}
        </PropertySection>
      ))}
    </>
  );
}
