import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryHost } from '../../host/memory-host.js';
import type { TemplateFile } from '../../model/index.js';
import { TemplatePicker } from './template-picker.js';
import { type TemplatePreview, TemplateWorkspace } from './template-workspace.js';

// The whole template editor renders in each test, which takes seconds on a shared CI runner.
const SLOW = 45_000;

const REPORT: TemplateFile = { formatVersion: 1, id: 'report', name: 'Report' };
const LETTER: TemplateFile = { formatVersion: 1, id: 'letter', name: 'Letter', parent: 'report' };
const ARTICLE: TemplateFile = {
  formatVersion: 1,
  id: 'article',
  name: 'Article',
  extensions: { layout: 'web' },
};

const storeOf = (...templates: TemplateFile[]) =>
  createMemoryHost({ templates, now: () => new Date('2026-01-02T03:04:05Z') }).templates;

const root = () => document.querySelector('.de-template-workspace');

// Renames the open template through its Name row.
async function rename(user: ReturnType<typeof userEvent.setup>, name: string) {
  const field = await screen.findByRole('textbox', { name: 'Name' });
  await user.clear(field);
  await user.paste(name);
  await user.keyboard('{Enter}');
}

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
        />,
      );
      expect(await screen.findByRole('textbox', { name: 'Name' })).toHaveValue('Report');
      expect(root()).toHaveAttribute('data-layout', 'page');
      expect(document.querySelector('.de-template-workspace__toolbar')).toHaveAttribute(
        'role',
        'toolbar',
      );
      expect(document.querySelector('.de-template-workspace__settings')).not.toBeNull();
      await user.click(screen.getByRole('button', { name: /Template/ }));
      await user.click(await screen.findByRole('option', { name: /Letter/ }));
      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Letter'),
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
      render(<TemplateWorkspace store={store} defaultTemplateId="report" />);
      const save = screen.getByRole('button', { name: 'Save' });
      await rename(user, 'Annual report');
      expect(root()).toHaveAttribute('data-dirty', 'true');
      await user.click(save);
      await waitFor(() => expect(save).toBeDisabled());
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
      expect(await screen.findByText(/Someone else saved this template/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Keep my changes' }));
      await waitFor(() => expect(screen.queryByText(/Someone else saved/)).not.toBeInTheDocument());
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
      await user.click(await screen.findByRole('button', { name: 'Reload' }));
      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Theirs'),
      );
      expect(save).toBeDisabled();
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-3.3 creates a template on its first save and saves one as a copy',
    async () => {
      const user = userEvent.setup();
      const store = storeOf(REPORT);
      render(<TemplateWorkspace store={store} />);
      await user.click(screen.getByRole('button', { name: 'New template' }));
      expect(await screen.findByRole('textbox', { name: 'Id' })).toHaveValue('template');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() =>
        expect(screen.queryByRole('textbox', { name: 'Id' })).not.toBeInTheDocument(),
      );
      await expect(store.load('template')).resolves.toMatchObject({
        value: { template: { name: 'New template' } },
      });
      await user.click(screen.getByRole('button', { name: 'Save as…' }));
      const dialog = await screen.findByRole('dialog');
      const id = within(dialog).getByRole('textbox', { name: 'Id' });
      expect(id).toHaveValue('template-copy');
      expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue(
        'Copy of New template',
      );
      await user.clear(id);
      await user.paste('report');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));
      expect(
        await within(dialog).findByText('A template with the id report already exists.'),
      ).toBeInTheDocument();
      await user.clear(id);
      await user.paste('memo');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await expect(store.load('memo')).resolves.toMatchObject({
        value: { template: { id: 'memo', name: 'Copy of New template' } },
      });
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-3.4 deletes the open template once confirmed and shows a refusal',
    async () => {
      const user = userEvent.setup();
      const store = storeOf(REPORT, LETTER);
      render(<TemplateWorkspace store={store} defaultTemplateId="report" />);
      await screen.findByRole('textbox', { name: 'Name' });
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      const confirm = await screen.findByRole('alertdialog');
      await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
      expect(await screen.findByText(/has templates under it/)).toBeInTheDocument();
      await expect(store.load('report')).resolves.toMatchObject({ ok: true });
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-3.5 shows a saved version read-only and restores it',
    async () => {
      const user = userEvent.setup();
      const store = storeOf(REPORT, { ...REPORT, name: 'Second' });
      render(<TemplateWorkspace store={store} defaultTemplateId="report" />);
      await screen.findByRole('textbox', { name: 'Name' });
      await user.click(screen.getByRole('button', { name: 'History' }));
      const history = await screen.findByRole('grid', { name: 'History' });
      expect(document.querySelector('.de-template-workspace__history')).not.toBeNull();
      const rows = await within(history).findAllByRole('row');
      expect(rows).toHaveLength(2);
      await user.click(rows[1] as HTMLElement);
      expect(await screen.findByText('Version 1, read only')).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Report');
      expect(screen.getByRole('textbox', { name: 'Name' })).toBeDisabled();
      await user.click(screen.getByRole('button', { name: 'Restore this version' }));
      await waitFor(() =>
        expect(screen.queryByText('Version 1, read only')).not.toBeInTheDocument(),
      );
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
          layoutOf={(template) => (template.extensions?.layout === 'web' ? 'web' : 'page')}
          renderPreview={(preview) => {
            previews.push(preview);
            return <p>Preview of {preview.template.name}</p>;
          }}
        />,
      );
      expect(await screen.findByText('Preview of Article')).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Template preview' })).toHaveClass(
        'de-template-workspace__preview',
      );
      expect(root()).toHaveAttribute('data-layout', 'web');
      // The preview's template is resolved: the base template's page size shows through.
      await waitFor(() => expect(previews.at(-1)?.template.page?.size).toBeTruthy());
      const last = previews.at(-1);
      expect(last).toMatchObject({ layout: 'web', scope: null });
      last?.onRegionChange?.({ region: 'header', section: null, content: [] });
      await waitFor(() => expect(root()).toHaveAttribute('data-dirty', 'true'));
      await user.click(screen.getByRole('button', { name: /Template/ }));
      await user.click(await screen.findByRole('option', { name: /Report/ }));
      expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-3.7 asks before opening another template over unsaved changes',
    async () => {
      const user = userEvent.setup();
      render(<TemplateWorkspace store={storeOf(REPORT, LETTER)} defaultTemplateId="report" />);
      await rename(user, 'Unsaved');
      await user.click(screen.getByRole('button', { name: /Template/ }));
      await user.click(await screen.findByRole('option', { name: /Letter/ }));
      const dialog = await screen.findByRole('alertdialog');
      expect(within(dialog).getByText('Changes to Unsaved')).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: /Stay/ }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Unsaved');
      await user.click(screen.getByRole('button', { name: /Template/ }));
      await user.click(await screen.findByRole('option', { name: /Letter/ }));
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: /Discard/ }),
      );
      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Letter'),
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
