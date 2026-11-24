import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
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
import type { HostResult } from '../../host/adapters.js';
import type { TemplateFile } from '../../model/index.js';
import { TemplateWorkspace, type TemplateWorkspaceParts } from './template-workspace.js';

const REPORT: TemplateFile = { formatVersion: 1, id: 'report', name: 'Report' };
const LETTER: TemplateFile = { formatVersion: 1, id: 'letter', name: 'Letter' };
const MEMO: TemplateFile = { formatVersion: 1, id: 'memo', name: 'Memo' };

type Store = ReturnType<typeof storeOf>;
type Method = 'save' | 'load' | 'versions';

// Holds back the store's answers to one method until the test lets each go, in any order.
function holdBack(store: Store, method: Method) {
  const held: { args: unknown[]; release: () => Promise<void> }[] = [];
  const original = store[method]?.bind(store) as
    ((...args: unknown[]) => Promise<unknown>) | undefined;
  if (!original) throw new Error(`No ${method} method to hold.`);
  const holding = (...args: unknown[]) =>
    new Promise((resolve) => {
      held.push({ args, release: () => original(...args).then(resolve) });
    });
  Object.assign(store, { [method]: holding });
  return {
    held,
    /** Stops holding answers back; those held stay held. */
    stop: () => Object.assign(store, { [method]: original }),
  };
}

// The workspace draws its own preview, a document editor, unless a test draws one.
installEditorDom();

describe('TemplateWorkspace requests', () => {
  it(
    'DOCE-TEMPLATE-EDITOR-3.2 keeps changes made while a save is on its way, unsaved',
    async () => {
      const user = userEvent.setup();
      const store = storeOf(REPORT);
      render(<TemplateWorkspace store={store} defaultTemplateId="report" defaultPanelExpanded />);
      await rename(user, 'First');
      const saves = holdBack(store, 'save');
      await user.click(saveButton());
      await waitFor(() => expect(saves.held).toHaveLength(1), LOADED);
      await rename(user, 'Second');
      await act(async () => saves.held[0]?.release());
      await waitFor(
        () =>
          expect(store.load('report')).resolves.toMatchObject({
            value: { revision: 'rev-2', template: { name: 'First' } },
          }),
        LOADED,
      );
      await waitFor(() => expect(saveButton()).toBeEnabled());
      expect(await nameField()).toHaveValue('Second');
      expect(root()).toHaveAttribute('data-dirty', 'true');
      // The next save stores them on the revision the first one made.
      saves.stop();
      await user.click(saveButton());
      await waitFor(() => expect(root()).not.toHaveAttribute('data-dirty'), LOADED);
      await expect(store.load('report')).resolves.toMatchObject({
        value: { revision: 'rev-3', template: { name: 'Second' } },
      });
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-3.9 keeps the template opened after a save on its way returns',
    async () => {
      const user = userEvent.setup();
      const store = storeOf(REPORT, LETTER);
      render(<TemplateWorkspace store={store} defaultTemplateId="report" defaultPanelExpanded />);
      await rename(user, 'Annual report');
      const saves = holdBack(store, 'save');
      await user.click(saveButton());
      await waitFor(() => expect(saves.held).toHaveLength(1), LOADED);
      await openFromDialog(user, /Letter/);
      await user.click(
        within(await screen.findByRole('alertdialog', {}, LOADED)).getByRole('button', {
          name: /Discard/,
        }),
      );
      await waitFor(async () => expect(await nameField()).toHaveValue('Letter'), LOADED);
      await act(async () => saves.held[0]?.release());
      await waitFor(
        () =>
          expect(store.load('report')).resolves.toMatchObject({
            value: { template: { name: 'Annual report' } },
          }),
        LOADED,
      );
      // The saved template's new name reaches the list, while Letter stays open.
      await user.click(screen.getByRole('button', { name: 'Open' }));
      const dialog = await screen.findByRole('dialog', { name: 'Open a template' }, LOADED);
      expect(
        await within(dialog).findByRole('row', { name: /Annual report/ }, LOADED),
      ).toBeVisible();
      await user.keyboard('{Escape}');
      expect(await nameField()).toHaveValue('Letter');
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-3.9 keeps the template open when another fails to load',
    async () => {
      const user = userEvent.setup();
      const store = storeOf(REPORT, LETTER);
      const changes: (string | null)[] = [];
      render(
        <TemplateWorkspace
          store={store}
          defaultTemplateId="report"
          defaultPanelExpanded
          onTemplateIdChange={(id) => changes.push(id)}
        />,
      );
      expect(await nameField()).toHaveValue('Report');
      const load = store.load.bind(store);
      Object.assign(store, {
        load: (id: string, options?: { revision?: string }) =>
          id === 'letter'
            ? Promise.resolve<HostResult<never>>({
                ok: false,
                error: { kind: 'unavailable', message: 'Offline' },
              })
            : load(id, options),
      });
      await openFromDialog(user, /Letter/);
      expect(await screen.findByText('The request failed: Offline', {}, LOADED)).toBeVisible();
      expect(await nameField()).toHaveValue('Report');
      expect(changes).toEqual([]);
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-3.2 shows a failure to read the stored template when keeping changes',
    async () => {
      const user = userEvent.setup();
      const store = storeOf(REPORT);
      render(<TemplateWorkspace store={store} defaultTemplateId="report" defaultPanelExpanded />);
      await nameField();
      await store.save('report', {
        template: { ...REPORT, name: 'Theirs' },
        baseRevision: 'rev-1',
      });
      await rename(user, 'Mine');
      await user.click(saveButton());
      const keep = await screen.findByRole('button', { name: 'Keep my changes' }, LOADED);
      Object.assign(store, {
        load: () =>
          Promise.resolve<HostResult<never>>({
            ok: false,
            error: { kind: 'unavailable', message: 'Offline' },
          }),
      });
      await user.click(keep);
      expect(await screen.findByText('The request failed: Offline', {}, LOADED)).toBeVisible();
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-3.3 says an id is taken only while the id field holds it',
    async () => {
      const user = userEvent.setup();
      render(
        <TemplateWorkspace
          store={storeOf(REPORT, LETTER)}
          defaultTemplateId="report"
          defaultPanelExpanded
        />,
      );
      await nameField();
      await user.click(screen.getByRole('button', { name: 'Save as…' }));
      const dialog = await screen.findByRole('dialog', {}, LOADED);
      const id = within(dialog).getByRole('textbox', { name: 'Id' });
      await user.clear(id);
      await user.paste('letter');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));
      const taken = 'A template with the id letter already exists.';
      expect(await within(dialog).findByText(taken, {}, LOADED)).toBeVisible();
      await user.type(id, '-2');
      expect(within(dialog).queryByText(/already exists/)).not.toBeInTheDocument();
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-3.5 asks before a restore drops unsaved changes',
    async () => {
      const user = userEvent.setup();
      const store = storeOf(REPORT, { ...REPORT, name: 'Second' });
      render(<TemplateWorkspace store={store} defaultTemplateId="report" defaultPanelExpanded />);
      await rename(user, 'Unsaved');
      const history = await showHistory(user);
      const rows = await within(history).findAllByRole('row', {}, LOADED);
      await versionAction(user, rows[1] as HTMLElement, 'View version');
      await user.click(await screen.findByRole('button', { name: 'Restore this version' }, LOADED));
      const confirm = await screen.findByRole('alertdialog', {}, LOADED);
      expect(within(confirm).getByText('Changes to Unsaved')).toBeVisible();
      await user.click(within(confirm).getByRole('button', { name: /Stay/ }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      await expect(store.load('report')).resolves.toMatchObject({ value: { revision: 'rev-2' } });
      // Saving them first keeps them as a version, then the restore stages the old settings.
      await user.click(screen.getByRole('button', { name: 'Restore this version' }));
      await user.click(
        within(await screen.findByRole('alertdialog', {}, LOADED)).getByRole('button', {
          name: /^Save/,
        }),
      );
      await waitFor(
        () => expect(screen.queryByText('Version 1, read only')).not.toBeInTheDocument(),
        LOADED,
      );
      await expect(store.load('report')).resolves.toMatchObject({
        value: { revision: 'rev-3', template: { name: 'Unsaved' } },
      });
      await user.click(screen.getByRole('tab', { name: 'Properties' }));
      expect(await nameField()).toHaveValue('Report');
      expect(root()).toHaveAttribute('data-dirty', 'true');
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-3.9 drops a version that comes back after another was asked for',
    async () => {
      const user = userEvent.setup();
      const store = storeOf(REPORT, { ...REPORT, name: 'Second' });
      render(<TemplateWorkspace store={store} defaultTemplateId="report" defaultPanelExpanded />);
      await waitFor(() => expect(root()).not.toHaveAttribute('data-loading'), LOADED);
      const history = await showHistory(user);
      const rows = await within(history).findAllByRole('row', {}, LOADED);
      const loads = holdBack(store, 'load');
      await versionAction(user, rows[1] as HTMLElement, 'View version');
      await waitFor(() => expect(loads.held).toHaveLength(1), LOADED);
      // Back to the template before the version arrives: the current version is viewed.
      await versionAction(user, rows[0] as HTMLElement, 'View version');
      loads.stop();
      await act(async () => loads.held[0]?.release());
      expect(screen.queryByText('Version 1, read only')).not.toBeInTheDocument();
      await user.click(screen.getByRole('tab', { name: 'Properties' }));
      expect(await nameField()).toBeEnabled();
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-3.9 keeps the latest template request loading until its answer',
    async () => {
      const store = storeOf(REPORT, LETTER, MEMO);
      const changes: (string | null)[] = [];
      const props = {
        store,
        renderPreview: ({ template }: { template: TemplateFile }) => <p>{template.name} preview</p>,
        onTemplateIdChange: (id: string | null) => changes.push(id),
      };
      const { rerender } = render(<TemplateWorkspace {...props} templateId="report" />);
      await screen.findByText('Report preview', {}, LOADED);
      const loads = holdBack(store, 'load');
      rerender(<TemplateWorkspace {...props} templateId="letter" />);
      await waitFor(() => expect(loads.held[0]?.args[0]).toBe('letter'));
      rerender(<TemplateWorkspace {...props} templateId="memo" />);
      await waitFor(() => expect(loads.held[1]?.args[0]).toBe('memo'));

      await act(async () => loads.held[0]?.release());
      expect(root()).toHaveAttribute('aria-busy', 'true');
      expect(screen.queryByText('Letter preview')).not.toBeInTheDocument();
      loads.stop();
      await act(async () => loads.held[1]?.release());
      expect(screen.getByText('Memo preview')).toBeVisible();
      expect(root()).not.toHaveAttribute('aria-busy');
      expect(changes).toEqual(['report', 'memo']);
    },
    SLOW,
  );

  it.each(['lookup', 'load', 'failure'])(
    'DOCE-TEMPLATE-EDITOR-3.9 stays on Current while a historical %s finishes',
    async (phase) => {
      const store = storeOf(REPORT, { ...REPORT, name: 'Current Report' });
      const changes: (string | null)[] = [];
      const props = {
        store,
        templateId: 'report',
        renderPreview: ({ template }: { template: TemplateFile }) => <p>{template.name} preview</p>,
        onRevisionChange: (id: string | null) => changes.push(id),
      };
      const { rerender } = render(<TemplateWorkspace {...props} revision={null} />);
      await screen.findByText('Current Report preview', {}, LOADED);
      if (phase === 'failure') {
        const read = store.load.bind(store);
        store.load = (id, options) =>
          options?.revision
            ? Promise.resolve({
                ok: false,
                error: { kind: 'unavailable', message: 'Historical load failed' },
              })
            : read(id, options);
      }
      const requests = holdBack(store, phase === 'lookup' ? 'versions' : 'load');
      rerender(<TemplateWorkspace {...props} revision="rev-1" />);
      await waitFor(() => expect(requests.held).toHaveLength(1));

      rerender(<TemplateWorkspace {...props} revision={null} />);
      requests.stop();
      await act(async () => requests.held[0]?.release());
      expect(screen.getByText('Current Report preview')).toBeVisible();
      expect(
        screen.queryByText(/Version 1, read only|Historical load failed/),
      ).not.toBeInTheDocument();
      expect(changes).toEqual([]);
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-3.9 closes an obsolete leave confirmation and preserves the draft',
    async () => {
      const user = userEvent.setup();
      const store = storeOf(REPORT, LETTER);
      const props = {
        store,
        renderLayout: ({ tabs, messages, panel, properties }: TemplateWorkspaceParts) => (
          <>
            {tabs}
            {messages}
            {panel(properties)}
          </>
        ),
      };
      const { rerender } = render(<TemplateWorkspace {...props} templateId="report" />);
      await rename(user, 'Unsaved report');
      rerender(<TemplateWorkspace {...props} templateId="letter" />);
      expect(await screen.findByRole('alertdialog', {}, LOADED)).toBeVisible();
      rerender(<TemplateWorkspace {...props} templateId="report" />);
      await waitFor(
        () => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
        LOADED,
      );
      expect(await nameField()).toHaveValue('Unsaved report');
      expect(root()).toHaveAttribute('data-dirty', 'true');
    },
    SLOW,
  );
});
