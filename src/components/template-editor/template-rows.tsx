// The template editor's rows: each setting of a scope as a property row holding the target's own
// value and showing the one it inherits, the cards of a section, and the sections themselves, with
// only the settings the scope may set.

import { PropertySection } from '@flamboyantengineer/ui-components/property-panel';
import { Fragment, type ReactNode, useCallback, useLayoutEffect, useRef } from 'react';
import type { TemplateFile } from '../../model/index.js';
import { ContentsSection } from './contents-section.js';
import { CustomStyleSection } from './custom-style-section.js';
import { SettingCard } from './setting-card.js';
import { rows } from './setting-row.js';
import { referenceSection, TEMPLATE_SECTIONS } from './settings-catalog.js';
import { HeadingNumberingSection, TextStyleSection } from './style-sections.js';
import type { TemplateEditorLabels, TemplateEditorProps } from './template-editor.js';
import { settingAt, type TemplateSettingSection } from './template-settings.js';

// What the rows read and change: the document's settings, or a section's over them.
export interface Target {
  readonly own: TemplateFile;
  readonly inherited: TemplateFile | undefined;
  /** Where the inherited values come from: the parent template, or the document's settings. */
  readonly source: string;
  readonly set: (path: readonly string[], value: unknown) => void;
}

export interface Rows {
  readonly props: TemplateEditorProps;
  readonly labels: TemplateEditorLabels;
  readonly target: Target;
  /** Whether the rows are a template section's, over the document's settings. */
  readonly inSection?: boolean;
}

// A section of settings, with its cards; in a template section, only what a section may set.
function SettingSection({
  context,
  section,
  inSection,
  onPages,
  extra,
}: {
  context: Rows;
  section: TemplateSettingSection;
  inSection: boolean;
  onPages: boolean;
  extra: ReactNode;
}) {
  const settings = section.settings.filter(
    (setting) => (!inSection || !setting.documentOnly) && (onPages || !setting.pagesOnly),
  );
  return (
    <PropertySection id={section.id} title={section.title}>
      {rows(context, section.scope, settings)}
      {section.cards?.map((card) => {
        const path = [...section.scope, ...card.path];
        const { own, inherited } = context.target;
        return (
          <SettingCard
            key={card.id}
            context={context}
            scope={section.scope}
            card={card}
            own={settingAt(own, path)}
            inherited={inherited ? settingAt(inherited, path) : undefined}
          />
        );
      })}
      {extra}
    </PropertySection>
  );
}

/**
 * The editor's sections of settings, in order, with the text and custom styles after the page
 * setup; in a template section, only the sections and settings a section may set. `extra` adds
 * rows of the host's at the end of a section, by its id.
 */
export function SettingSections({
  context: given,
  inSection,
  onPages = true,
  extra,
}: {
  context: Rows;
  inSection: boolean;
  /** Whether the template is for pages; one for the web layout has no page-only rows. */
  onPages?: boolean;
  extra?: ((sectionId: string) => ReactNode) | undefined;
}) {
  // A card that does not render again keeps its handlers: they write through the latest target.
  const latest = useRef(given.target.set);
  useLayoutEffect(() => {
    latest.current = given.target.set;
  });
  const set = useCallback<Target['set']>((path, value) => latest.current(path, value), []);
  const context: Rows = { ...given, inSection, target: { ...given.target, set } };
  const { referenceTypes } = given.props;
  const sections = referenceTypes?.length
    ? TEMPLATE_SECTIONS.map((section) =>
        section.id === 'references' ? referenceSection(referenceTypes) : section,
      )
    : TEMPLATE_SECTIONS;
  const shown = sections.filter(
    (section) => (!inSection || !section.documentOnly) && (onPages || !section.pagesOnly),
  );
  return shown.map((section) => (
    <Fragment key={section.id}>
      {section.id === 'contents' ? (
        <ContentsSection context={context} extra={extra?.(section.id)} />
      ) : (
        <SettingSection
          context={context}
          section={section}
          inSection={inSection}
          onPages={onPages}
          extra={extra?.(section.id)}
        />
      )}
      {section.id === 'page' ? (
        <>
          <TextStyleSection context={context} />
          {inSection ? <HeadingNumberingSection context={context} /> : null}
          <CustomStyleSection context={context} />
        </>
      ) : null}
    </Fragment>
  ));
}
