import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { installEditorDom } from '../../../test/editor-dom.js';
import {
  LOADED,
  nameField,
  openFromDialog,
  rename,
  saveButton,
  showHistory,
  SLOW,
  storeOf,
  versionAction,
  workspaceRoot as root,
} from '../../../test/template-workspace.js';
import type { TemplateFile } from '../../model/index.js';
import { TemplatePicker } from './template-picker.js';
import { type TemplatePreview, TemplateWorkspace } from './template-workspace.js';

const REPORT: TemplateFile = { formatVersion: 1, id: 'report', name: 'Report' };
const LETTER: TemplateFile = { formatVersion: 1, id: 'letter', name: 'Letter', parent: 'report' };
const ARTICLE: TemplateFile = {
  formatVersion: 1,
  id: 'article',
  name: 'Article',
  extensions: { layout: 'web' },
};

// The workspace draws its own preview, a document editor, unless a test draws one.
installEditorDom();

describe('TemplateWorkspace', () => {
  it(
    'DOCE-TEMPLATE-EDITOR-3.1 opens a stored template and another picked from the store',
    async () => {
      const user = userEvent.setup();
      const onTemplateIdChange = vi.fn();
      render(
        <TemplateWorkspace
          store={storeOf(REPORT, LETTER)}
          defaultTemplateId="report"
          onTemplateIdChange={onTemplateIdChange}
          defaultPanelExpanded
        />,
      );
      expect(await nameField()).toHaveValue('Report');
      expect(root()).toHaveAttribute('data-layout', 'page');
      expect(document.querySelector('.de-template-workspace__toolbar')).toHaveAttribute(
        'role',
        'toolbar',
      );
      expect(document.querySelector('.de-template-workspace__settings')).not.toBeNull();
      await openFromDialog(user, /Letter/);
      await waitFor(
        () => expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Letter'),
        LOADED,
      );
      expect(onTemplateIdChange).toHaveBeenLastCalledWith('letter');
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-3.2 saves on the revision it opened and settles a conflict',
    async () => {
      const user = userEvent.setup();
      const store = storeOf(REPORT);
      render(<TemplateWorkspace store={store} defaultTemplateId="report" defaultPanelExpanded />);
      await rename(user, 'Annual report');
      const save = saveButton();
      expect(root()).toHaveAttribute('data-dirty', 'true');
      await user.click(save);
      // Save says for a moment that it saved, through its name and icon. It is disabled while it
      // saves too, so wait for the name rather than for the disabled state.
      await waitFor(() => expect(save).toHaveAccessibleName('Saved'), LOADED);
      expect(save).toBeDisabled();
      await expect(store.load('report')).resolves.toMatchObject({
        value: { revision: 'rev-2', template: { name: 'Annual report' } },
      });
      // Another save comes between: the workspace's save is refused, and the reader keeps theirs.
      await store.save('report', {
        template: { ...REPORT, name: 'Theirs' },
        baseRevision: 'rev-2',
      });
      await rename(user, 'Mine');
      await user.click(save);
      expect(
        await screen.findByText(/Someone else saved this template/, {}, LOADED),
      ).toBeInTheDocument();
      expect(save).toHaveAccessibleName(/^Not saved/);
      await user.click(screen.getByRole('button', { name: 'Keep my changes' }));
      await waitFor(
        () => expect(screen.queryByText(/Someone else saved/)).not.toBeInTheDocument(),
        LOADED,
      );
      await expect(store.load('report')).resolves.toMatchObject({
        value: { revision: 'rev-4', template: { name: 'Mine' } },
      });
      // Or reloads the template as stored now, dropping theirs.
      await store.save('report', {
        template: { ...REPORT, name: 'Theirs' },
        baseRevision: 'rev-4',
      });
      await rename(user, 'Lost');
      await user.click(save);
      await user.click(await screen.findByRole('button', { name: 'Reload' }, LOADED));
      await waitFor(
        () => expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Theirs'),
        LOADED,
      );
      expect(save).toBeDisabled();
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-3.3 starts a blank template, needs an id to save it, and saves a copy',
    async () => {
      const user = userEvent.setup();
      const store = storeOf(REPORT);
      render(
        <TemplateWorkspace
          store={store}
          saveAsFields={(copy, onChange) => (
            <button
              type="button"
              onClick={() => onChange({ ...copy, extensions: { folder: 'Letters' } })}
            >
              In Letters
            </button>
          )}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'New template' }));
      // A blank template: no id or name yet, and one section of its own.
      expect(await screen.findByRole('tab', { name: 'section_1' }, LOADED)).toBeInTheDocument();
      await user.click(saveButton());
      const id = await screen.findByRole('textbox', { name: 'Id' }, LOADED);
      await waitFor(() => expect(id).toHaveFocus(), LOADED);
      expect(id).toHaveAccessibleDescription('Give the template an id to save it.');
      await expect(store.load('template')).resolves.toMatchObject({ ok: false });
      await user.paste('memo');
      await user.keyboard('{Enter}');
      await user.click(saveButton());
      await waitFor(
        () => expect(screen.queryByRole('textbox', { name: 'Id' })).not.toBeInTheDocument(),
        LOADED,
      );
      await expect(store.load('memo')).resolves.toMatchObject({
        value: { template: { id: 'memo', sections: [{ name: 'section_1', editable: true }] } },
      });
      await user.click(screen.getByRole('button', { name: 'Save as…' }));
      const dialog = await screen.findByRole('dialog', {}, LOADED);
      const copyId = within(dialog).getByRole('textbox', { name: 'Id' });
      expect(copyId).toHaveValue('memo_copy');
      expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('Copy of memo');
      await user.clear(copyId);
      await user.paste('report');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));
      expect(
        await within(dialog).findByText(
          'A template with the id report already exists.',
          {},
          LOADED,
        ),
      ).toBeInTheDocument();
      await user.clear(copyId);
      await user.paste('note');
      await user.click(within(dialog).getByRole('button', { name: 'In Letters' }));
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));
      await waitFor(
        () =>
          expect(
            screen.queryByRole('dialog', { name: 'Save as a new template' }),
          ).not.toBeInTheDocument(),
        LOADED,
      );
      await expect(store.load('note')).resolves.toMatchObject({
        value: {
          template: { id: 'note', name: 'Copy of memo', extensions: { folder: 'Letters' } },
        },
      });
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-3.4 deletes the open template once confirmed and shows a refusal',
    async () => {
      const user = userEvent.setup();
      const store = storeOf(REPORT, LETTER);
      const { rerender } = render(<TemplateWorkspace store={store} defaultTemplateId="report" />);
      await waitFor(() => expect(root()).not.toHaveAttribute('data-loading'), LOADED);
      // Delete is the host's to offer.
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
      rerender(<TemplateWorkspace store={store} defaultTemplateId="report" canDelete />);
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      const confirm = await screen.findByRole('alertdialog', {}, LOADED);
      await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
      expect(await screen.findByText(/has templates under it/, {}, LOADED)).toBeInTheDocument();
      await expect(store.load('report')).resolves.toMatchObject({ ok: true });
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-3.5 shows a saved version read-only and stages a restore',
    async () => {
      const user = userEvent.setup();
      const store = storeOf(REPORT, { ...REPORT, name: 'Second' });
      render(
        <TemplateWorkspace
          store={store}
          defaultTemplateId="report"
          defaultPanelExpanded
          personOf={(author) => ({ name: `Person ${author}` })}
        />,
      );
      await nameField();
      const history = await showHistory(user);
      const rows = await within(history).findAllByRole('row', {}, LOADED);
      expect(rows).toHaveLength(2);
      expect(within(rows[0] as HTMLElement).getByText(/^Person /)).toBeInTheDocument();
      await versionAction(user, rows[1] as HTMLElement, 'View version');
      expect(await screen.findByText('Version 1, read only', {}, LOADED)).toBeInTheDocument();
      await user.click(screen.getByRole('tab', { name: 'Properties' }));
      expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Report');
      expect(screen.getByRole('textbox', { name: 'Name' })).toBeDisabled();
      // Restoring stages the version's settings as unsaved changes; Save stores them.
      await user.click(screen.getByRole('button', { name: 'Restore this version' }));
      await waitFor(
        () => expect(screen.queryByText('Version 1, read only')).not.toBeInTheDocument(),
        LOADED,
      );
      expect(root()).toHaveAttribute('data-dirty', 'true');
      expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Report');
      await expect(store.load('report')).resolves.toMatchObject({ value: { revision: 'rev-2' } });
      await user.click(saveButton());
      await waitFor(() => expect(root()).not.toHaveAttribute('data-dirty'), LOADED);
      await expect(store.load('report')).resolves.toMatchObject({
        value: { revision: 'rev-3', template: { name: 'Report' } },
      });
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-3.6 previews a template in the layout the host says it is for',
    async () => {
      const user = userEvent.setup();
      const previews: TemplatePreview[] = [];
      render(
        <TemplateWorkspace
          store={storeOf(REPORT, ARTICLE)}
          defaultTemplateId="article"
          defaultPanelExpanded
          layoutOf={(template) => (template.extensions?.layout === 'web' ? 'web' : 'page')}
          renderPreview={(preview) => {
            previews.push(preview);
            return <p>Preview of {preview.template.name}</p>;
          }}
        />,
      );
      expect(await screen.findByText('Preview of Article', {}, LOADED)).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Template preview' })).toHaveClass(
        'de-template-workspace__preview',
      );
      expect(root()).toHaveAttribute('data-layout', 'web');
      // A web-layout template has no page size, orientation, header or footer rows; margins stay.
      const settings = document.querySelector('.de-template-workspace__settings') as HTMLElement;
      expect(within(settings).queryByText('Page size')).not.toBeInTheDocument();
      expect(within(settings).queryByText('Orientation')).not.toBeInTheDocument();
      expect(within(settings).queryByText('Header & footer')).not.toBeInTheDocument();
      expect(within(settings).getAllByText('Margins').length).toBeGreaterThan(0);
      expect(within(settings).getByText('Parent template')).toBeInTheDocument();
      // The preview's template is resolved: the base template's page size shows through.
      await waitFor(() => expect(previews.at(-1)?.template.page?.size).toBeTruthy(), LOADED);
      const last = previews.at(-1);
      expect(last).toMatchObject({ layout: 'web', scope: null });
      last?.onRegionChange?.({ region: 'header', section: null, content: [] });
      await waitFor(() => expect(root()).toHaveAttribute('data-dirty', 'true'), LOADED);
      await openFromDialog(user, /Report/);
      expect(await screen.findByRole('alertdialog', {}, LOADED)).toBeInTheDocument();
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-3.18 shows a root web-layout template with its name read-only and margins in pixels',
    async () => {
      const user = userEvent.setup();
      const store = storeOf(REPORT, {
        ...ARTICLE,
        page: { margins: { top: '24px', right: '24px', bottom: '24px', left: '24px' } },
      });
      const previews: TemplatePreview[] = [];
      render(
        <TemplateWorkspace
          store={store}
          defaultTemplateId="article"
          defaultPanelExpanded
          layoutOf={(template) => (template.extensions?.layout === 'web' ? 'web' : 'page')}
          isRoot={(template) => template.id === 'article'}
          isNameReadOnly={(template) => template.id === 'article'}
          renderPreview={(preview) => {
            previews.push(preview);
            return null;
          }}
        />,
      );
      const settings = await screen.findByRole('region', { name: 'Document settings' }, LOADED);
      await waitFor(() => expect(previews.at(-1)?.template.name).toBe('Article'), LOADED);
      // A root inherits nothing, not even the base template's page size, and has no parent row.
      expect(previews.at(-1)?.template.page?.size).toBeUndefined();
      expect(within(settings).queryByText('Parent template')).not.toBeInTheDocument();
      expect(within(settings).getByRole('textbox', { name: 'Name' })).toHaveAttribute('readonly');
      // The web layout has no paged-only categories.
      for (const title of [
        'Paragraph numbering',
        'Footnotes',
        'References',
        'Change bars',
        'Contents',
      ]) {
        expect(within(settings).queryByText(title)).not.toBeInTheDocument();
      }
      // Its margins read and write pixels.
      const top = within(settings).getByRole('textbox', { name: 'Top margin' });
      expect(top).toHaveValue('24');
      await user.clear(top);
      await user.type(top, '32');
      await user.click(saveButton());
      await waitFor(async () => {
        const loaded = await store.load('article');
        expect(loaded.ok && loaded.value.template.page?.margins?.top).toBe('32px');
      }, LOADED);
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-3.10 keeps each section’s own page settings through quick tab switches and a reopen',
    async () => {
      const user = userEvent.setup();
      const store = storeOf({
        formatVersion: 1,
        id: 'sections',
        name: 'Sections',
        sections: [{ name: 'cover' }, { name: 'body' }],
      });
      const view = render(
        <TemplateWorkspace store={store} defaultTemplateId="sections" defaultPanelExpanded />,
      );
      const topOf = async (tab: string, value: string) => {
        await user.click(await screen.findByRole('tab', { name: tab }, LOADED));
        const settings = await screen.findByRole('region', { name: 'Section settings' }, LOADED);
        const top = within(settings).getByRole('textbox', { name: 'Top margin' });
        await user.clear(top);
        await user.type(top, value);
      };
      await topOf('cover', '2');
      // Switch tabs quickly, without waiting for each to settle.
      for (const tab of ['Document', 'body', 'cover', 'body', 'Document', 'cover']) {
        await user.click(screen.getByRole('tab', { name: tab }));
      }
      await topOf('body', '3');
      await user.click(saveButton());
      await waitFor(async () => {
        const loaded = await store.load('sections');
        const sections = loaded.ok ? loaded.value.template.sections : [];
        expect(sections?.map((section) => section.page?.margins?.top)).toEqual(['2mm', '3mm']);
      }, LOADED);
      view.unmount();
      render(<TemplateWorkspace store={store} defaultTemplateId="sections" defaultPanelExpanded />);
      for (const [tab, value] of [
        ['cover', '2'],
        ['body', '3'],
      ] as const) {
        await user.click(await screen.findByRole('tab', { name: tab }, LOADED));
        const settings = await screen.findByRole('region', { name: 'Section settings' }, LOADED);
        expect(within(settings).getByRole('textbox', { name: 'Top margin' })).toHaveValue(value);
      }
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-3.7 asks before opening another template over unsaved changes',
    async () => {
      const user = userEvent.setup();
      render(
        <TemplateWorkspace
          store={storeOf(REPORT, LETTER)}
          defaultTemplateId="report"
          defaultPanelExpanded
        />,
      );
      await rename(user, 'Unsaved');
      await openFromDialog(user, /Letter/);
      const dialog = await screen.findByRole('alertdialog', {}, LOADED);
      expect(within(dialog).getByText('Changes to Unsaved')).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: /Stay/ }));
      await waitFor(
        () => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
        LOADED,
      );
      expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Unsaved');
      await openFromDialog(user, /Letter/);
      await user.click(
        within(await screen.findByRole('alertdialog', {}, LOADED)).getByRole('button', {
          name: /Discard/,
        }),
      );
      await waitFor(
        () => expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Letter'),
        LOADED,
      );
    },
    SLOW,
  );
});

describe('TemplatePicker', () => {
  it('DOCE-TEMPLATE-EDITOR-3.8 lists templates by name with their ids', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    const summary = { revision: 'rev-1', sequence: 1, parent: null };
    render(
      <TemplatePicker
        label="Template"
        templates={[
          { ...summary, id: 'b', name: 'Beta' },
          { ...summary, id: 'a', name: null },
          { ...summary, id: 'c', name: 'Alpha' },
        ]}
        selectedKey={null}
        onSelectionChange={onSelectionChange}
        className="picked"
      />,
    );
    await user.click(screen.getByRole('button', { name: /Template/ }));
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['a', 'Alpha c', 'Beta b']);
    await user.click(options[2] as HTMLElement);
    expect(onSelectionChange).toHaveBeenCalledWith('b');
  });
});
