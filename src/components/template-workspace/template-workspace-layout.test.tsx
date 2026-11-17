import { createMemoryStorage, UiProvider } from '@flamboyantengineer/ui-components/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { installEditorDom } from '../../../test/editor-dom.js';
import {
  LOADED,
  nameField,
  saveButton,
  SLOW,
  storeOf,
  type User,
  workspaceRoot as root,
} from '../../../test/template-workspace.js';
import type { TemplateFile } from '../../model/index.js';
import { TemplateWorkspace } from './template-workspace.js';

const REPORT: TemplateFile = {
  formatVersion: 1,
  id: 'report',
  name: 'Report',
  sections: [{ name: 'cover', label: 'Cover page' }, { name: 'body' }],
};
const LETTER: TemplateFile = { formatVersion: 1, id: 'letter', name: 'Letter' };
const MEMO: TemplateFile = { formatVersion: 1, id: 'memo', name: 'Memo' };

const tabNames = () =>
  within(screen.getByRole('tablist', { name: 'Template parts' }))
    .getAllByRole('tab')
    .map((tab) => tab.textContent);

async function tabMenu(user: User, name: string, action: string) {
  await user.pointer({ keys: '[MouseRight]', target: screen.getByRole('tab', { name }) });
  await user.click(await screen.findByRole('menuitem', { name: action }, LOADED));
}

// The workspace draws its own preview, a document editor, unless a test draws one.
installEditorDom();

describe('TemplateWorkspace layout', () => {
  it(
    'DOCE-TEMPLATE-EDITOR-3.10 shows a tab per section and edits sections from their tabs',
    async () => {
      const user = userEvent.setup();
      const onTemplateIdChange = vi.fn();
      render(
        <TemplateWorkspace
          store={storeOf(REPORT)}
          defaultTemplateId="report"
          defaultPanelExpanded
          onTemplateIdChange={onTemplateIdChange}
        />,
      );
      await nameField();
      // The document's tab first, then each section by its label, or its name without one.
      expect(tabNames()).toEqual(['Document', 'Cover page', 'body']);
      // The tab shown names its panel, which only appears once the tabs do.
      const panelId = screen.getByRole('tab', { name: 'Document' }).getAttribute('aria-controls');
      expect(document.getElementById(panelId ?? '')).toHaveAttribute('role', 'tabpanel');
      expect(screen.getByRole('region', { name: 'Document settings' })).toBeInTheDocument();
      // The panel has no scope picker of its own.
      expect(screen.queryByRole('button', { name: /Settings of/ })).not.toBeInTheDocument();
      await user.click(screen.getByRole('tab', { name: 'body' }));
      expect(await screen.findByRole('region', { name: 'Section settings' }, LOADED)).toBeVisible();
      // Insert before and after the section, each shown once added.
      await tabMenu(user, 'body', 'Insert a section before');
      await waitFor(
        () => expect(tabNames()).toEqual(['Document', 'Cover page', 'section_3', 'body']),
        LOADED,
      );
      expect(screen.getByRole('tab', { name: 'section_3' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await tabMenu(user, 'Cover page', 'Insert a section after');
      await waitFor(
        () =>
          expect(tabNames()).toEqual(['Document', 'Cover page', 'section_4', 'section_3', 'body']),
        LOADED,
      );
      // The add button appends a section, shows it and keeps focus for another.
      const add = screen.getByRole('button', { name: 'Add tab' });
      await user.click(add);
      await waitFor(() => expect(tabNames().at(-1)).toBe('section_5'), LOADED);
      expect(add).toHaveFocus();
      expect(screen.getByRole('tab', { name: 'section_5' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      // Renaming a tab renames the section it shows: its label, or its name.
      await tabMenu(user, 'section_5', 'Rename the section');
      const field = await screen.findByRole('textbox', { name: /Rename/ }, LOADED);
      await user.clear(field);
      await user.type(field, 'Annex A{Enter}');
      await waitFor(() => expect(tabNames().at(-1)).toBe('annex_a'), LOADED);
      await tabMenu(user, 'Cover page', 'Rename the section');
      const label = await screen.findByRole('textbox', { name: /Rename/ }, LOADED);
      await user.clear(label);
      await user.type(label, 'Front{Enter}');
      await waitFor(() => expect(tabNames()[1]).toBe('Front'), LOADED);
      // Deleting asks first, then shows the document's settings.
      await tabMenu(user, 'annex_a', 'Delete the section');
      const confirm = await screen.findByRole('alertdialog', {}, LOADED);
      await user.click(within(confirm).getByRole('button', { name: 'Delete the section' }));
      await waitFor(() => expect(tabNames()).not.toContain('annex_a'), LOADED);
      expect(screen.getByRole('tab', { name: 'Document' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(root()).toHaveAttribute('data-dirty', 'true');
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-3.11 starts its side panel collapsed and remembers the pane shown',
    async () => {
      const user = userEvent.setup();
      const storage = createMemoryStorage();
      const workspace = (
        <UiProvider storage={storage}>
          <TemplateWorkspace store={storeOf(REPORT)} defaultTemplateId="report" />
        </UiProvider>
      );
      const { unmount } = render(workspace);
      await waitFor(() => expect(root()).not.toHaveAttribute('data-loading'), LOADED);
      expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument();
      // The band groups the scope tabs and the template actions: New, Open, Save as, Save.
      const band = screen.getByRole('group', { name: 'Template' });
      const actions = within(band).getByRole('toolbar', { name: 'Template actions' });
      expect(
        within(actions)
          .getAllByRole('button')
          .map((button) => button.getAttribute('aria-label')),
      ).toEqual(['New template', 'Open', 'Save as…', 'Save']);
      await user.click(screen.getByRole('button', { name: 'History' }));
      expect(await screen.findByRole('grid', { name: 'History' }, LOADED)).toBeVisible();
      unmount();
      render(workspace);
      await waitFor(() => expect(root()).not.toHaveAttribute('data-loading'), LOADED);
      // Collapsed again, its History pane shows once expanded.
      expect(screen.queryByRole('grid', { name: 'History' })).not.toBeInTheDocument();
      expect(storage.getItem('de-template-workspace:pane')).toBe('history');
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-3.12 follows the template and version the host names',
    async () => {
      const user = userEvent.setup();
      const store = storeOf(REPORT, { ...REPORT, name: 'Report 2' }, LETTER);
      const changes: (string | null)[] = [];
      let route: (id: string | null, revision?: string | null) => void = () => undefined;
      function Host() {
        const [at, setAt] = useState<{ id: string | null; revision: string | null }>({
          id: 'report',
          revision: null,
        });
        route = (id, revision = null) => setAt({ id, revision });
        return (
          <TemplateWorkspace
            store={store}
            templateId={at.id}
            revision={at.revision}
            defaultPanelExpanded
            onTemplateIdChange={(id) => {
              changes.push(id);
              setAt((now) => ({ ...now, id }));
            }}
            onRevisionChange={(revision) => setAt((now) => ({ ...now, revision }))}
          />
        );
      }
      render(<Host />);
      expect(await nameField()).toHaveValue('Report 2');
      route('report', 'rev-1');
      expect(await screen.findByText('Version 1, read only', {}, LOADED)).toBeInTheDocument();
      route('report', null);
      await waitFor(
        () => expect(screen.queryByText('Version 1, read only')).not.toBeInTheDocument(),
        LOADED,
      );
      // Another template by route, through the unsaved changes guard: staying keeps the draft.
      const field = await nameField();
      await user.clear(field);
      await user.paste('Draft');
      await user.keyboard('{Enter}');
      route('letter');
      await user.click(
        within(await screen.findByRole('alertdialog', {}, LOADED)).getByRole('button', {
          name: /Stay/,
        }),
      );
      await waitFor(() => expect(changes.at(-1)).toBe('report'), LOADED);
      expect(await nameField()).toHaveValue('Draft');
      route('letter');
      await user.click(
        within(await screen.findByRole('alertdialog', {}, LOADED)).getByRole('button', {
          name: /Discard/,
        }),
      );
      await waitFor(
        () => expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Letter'),
        LOADED,
      );
      expect(changes.at(-1)).toBe('letter');
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-3.13 DOCE-ENTRY-2.5 shows the template as JSON with Control+Alt+B when allowed',
    async () => {
      const user = userEvent.setup();
      render(
        <TemplateWorkspace
          store={storeOf(LETTER)}
          defaultTemplateId="letter"
          debug
          defaultPanelExpanded
          renderPreview={() => <p>Pages</p>}
        />,
      );
      expect(await screen.findByText('Pages', {}, LOADED)).toBeInTheDocument();
      await user.click(await nameField());
      await user.keyboard('{Control>}{Alt>}b{/Alt}{/Control}');
      const json = await screen.findByRole('region', { name: 'Template JSON' }, LOADED);
      expect(screen.queryByText('Pages')).not.toBeInTheDocument();
      expect(root()).toHaveAttribute('data-view', 'json');
      const text = within(json).getByRole('textbox');
      await user.click(text);
      await user.keyboard('{Control>}a{/Control}x');
      await user.click(await nameField());
      await waitFor(() => expect(saveButton()).toBeDisabled(), LOADED);
      await user.keyboard('{Control>}{Alt>}b{/Alt}{/Control}');
      expect(await screen.findByText('Pages', {}, LOADED)).toBeInTheDocument();
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-3.14 DOCE-ENTRY-2.5 lists templates in folders, pinned first, and searches',
    async () => {
      const user = userEvent.setup();
      const onTemplateIdChange = vi.fn();
      render(
        <TemplateWorkspace
          store={storeOf(REPORT, LETTER, MEMO)}
          onTemplateIdChange={onTemplateIdChange}
          catalog={{
            pathOf: (template) => (template.id === 'letter' ? ['Outgoing', 'Mail'] : []),
            pinned: ['memo'],
          }}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Open' }));
      const dialog = await screen.findByRole('dialog', { name: 'Open a template' }, LOADED);
      // The list loads the first time the dialog opens.
      const tree = await within(dialog).findByRole('treegrid', { name: 'Templates' }, LOADED);
      const rows = () =>
        within(tree)
          .getAllByRole('row')
          .map((row) => row.textContent);
      expect(rows()).toEqual(['Memo', 'Outgoing', 'Report']);
      expect(within(dialog).getByRole('button', { name: 'Open' })).toBeDisabled();
      // The search reads a template's name, id and folders.
      await user.type(within(dialog).getByRole('searchbox', { name: 'Search templates' }), 'mail');
      await waitFor(() => expect(rows()).toEqual(['Outgoing', 'Mail', 'Letter']), LOADED);
      await user.dblClick(within(tree).getByRole('row', { name: /Letter/ }));
      await waitFor(() => expect(onTemplateIdChange).toHaveBeenLastCalledWith('letter'), LOADED);
      expect(screen.queryByRole('dialog', { name: 'Open a template' })).not.toBeInTheDocument();
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-3.15 lays its parts out in the host’s own layout',
    async () => {
      render(
        <TemplateWorkspace
          store={storeOf(LETTER)}
          defaultTemplateId="letter"
          renderPreview={() => <p>Pages</p>}
          renderLayout={(parts) => (
            <>
              <header aria-label="Host band">
                {parts.tabs}
                {parts.toolbar}
              </header>
              {parts.panel(
                <>
                  <main>{parts.preview}</main>
                  <aside aria-label="Host properties">{parts.properties}</aside>
                  <aside aria-label="Host history">{parts.history}</aside>
                </>,
              )}
            </>
          )}
        />,
      );
      // The tabs' panel takes the parts once the template, and with it the tabs, shows.
      await screen.findByRole('tab', { name: 'Document' }, LOADED);
      const properties = screen.getByRole('complementary', { name: 'Host properties' });
      expect(await within(properties).findByRole('textbox', { name: 'Name' }, LOADED)).toHaveValue(
        'Letter',
      );
      expect(
        within(screen.getByRole('banner', { name: 'Host band' })).getByRole('tab', {
          name: 'Document',
        }),
      ).toBeInTheDocument();
      expect(screen.getByText('Pages')).toBeInTheDocument();
      expect(document.querySelector('.de-template-workspace__panel')).toBeNull();
    },
    SLOW,
  );
});
