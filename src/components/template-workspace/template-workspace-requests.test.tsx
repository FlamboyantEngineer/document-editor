import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { HostResult } from '../../host/adapters.js';
import { createMemoryHost } from '../../host/memory-host.js';
import type { TemplateFile } from '../../model/index.js';
import { TemplateWorkspace } from './template-workspace.js';

// The whole template editor renders in each test, which takes seconds on a shared CI runner.
const SLOW = 45_000;
// Opening a template loads it from the store and renders the editor again, which a busy runner
// can take over a second to finish: waits on that use a longer window than the default second.
const LOADED = { timeout: 10_000 };

const REPORT: TemplateFile = { formatVersion: 1, id: 'report', name: 'Report' };
const LETTER: TemplateFile = { formatVersion: 1, id: 'letter', name: 'Letter' };

const storeOf = (...templates: TemplateFile[]) =>
  createMemoryHost({ templates, now: () => new Date('2026-01-02T03:04:05Z') }).templates;

type Store = ReturnType<typeof storeOf>;
type Method = 'save' | 'load';

// Holds back the store's answers to one method until the test lets each go, in any order.
function holdBack(store: Store, method: Method) {
  const held: { args: unknown[]; release: () => void }[] = [];
  const original = store[method].bind(store) as (...args: unknown[]) => Promise<unknown>;
  const holding = (...args: unknown[]) =>
    new Promise((resolve) => {
      held.push({ args, release: () => void original(...args).then(resolve) });
    });
  Object.assign(store, { [method]: holding });
  return {
    held,
    /** Stops holding answers back; those held stay held. */
    stop: () => Object.assign(store, { [method]: original }),
  };
}

const root = () => document.querySelector('.de-template-workspace');
const nameField = () => screen.findByRole('textbox', { name: 'Name' }, LOADED);

// Renames the open template through its Name row.
async function rename(user: ReturnType<typeof userEvent.setup>, name: string) {
  const field = await nameField();
  await user.clear(field);
  await user.paste(name);
  await user.keyboard('{Enter}');
}

async function pick(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(screen.getByRole('button', { name: /Template/ }));
  await user.click(await screen.findByRole('option', { name }, LOADED));
}

describe('TemplateWorkspace requests', () => {
  it(
    'DOCE-TEMPLATE-EDITOR-3.2 keeps changes made while a save is on its way, unsaved',
    async () => {
      const user = userEvent.setup();
      const store = storeOf(REPORT);
      render(<TemplateWorkspace store={store} defaultTemplateId="report" />);
      await rename(user, 'First');
      const saves = holdBack(store, 'save');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(saves.held).toHaveLength(1), LOADED);
      await rename(user, 'Second');
      saves.held[0]?.release();
      await waitFor(
        () =>
          expect(store.load('report')).resolves.toMatchObject({
            value: { revision: 'rev-2', template: { name: 'First' } },
          }),
        LOADED,
      );
      await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
      expect(await nameField()).toHaveValue('Second');
      expect(root()).toHaveAttribute('data-dirty', 'true');
      // The next save stores them on the revision the first one made.
      saves.stop();
      await user.click(screen.getByRole('button', { name: 'Save' }));
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
      render(<TemplateWorkspace store={store} defaultTemplateId="report" />);
      await rename(user, 'Annual report');
      const saves = holdBack(store, 'save');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(saves.held).toHaveLength(1), LOADED);
      await pick(user, /Letter/);
      await user.click(
        within(await screen.findByRole('alertdialog', {}, LOADED)).getByRole('button', {
          name: /Discard/,
        }),
      );
      await waitFor(async () => expect(await nameField()).toHaveValue('Letter'), LOADED);
      saves.held[0]?.release();
      await waitFor(
        () =>
          expect(store.load('report')).resolves.toMatchObject({
            value: { template: { name: 'Annual report' } },
          }),
        LOADED,
      );
      // The saved template's new name reaches the list, while Letter stays open.
      await user.click(screen.getByRole('button', { name: /Template/ }));
      expect(await screen.findByRole('option', { name: /Annual report/ }, LOADED)).toBeVisible();
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
      await pick(user, /Letter/);
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
      render(<TemplateWorkspace store={store} defaultTemplateId="report" />);
      await nameField();
      await store.save('report', {
        template: { ...REPORT, name: 'Theirs' },
        baseRevision: 'rev-1',
      });
      await rename(user, 'Mine');
      await user.click(screen.getByRole('button', { name: 'Save' }));
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
      render(<TemplateWorkspace store={storeOf(REPORT, LETTER)} defaultTemplateId="report" />);
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
      render(<TemplateWorkspace store={store} defaultTemplateId="report" />);
      await rename(user, 'Unsaved');
      await user.click(screen.getByRole('button', { name: 'History' }));
      const history = await screen.findByRole('grid', { name: 'History' }, LOADED);
      const rows = await within(history).findAllByRole('row', {}, LOADED);
      await user.click(rows[1] as HTMLElement);
      await user.click(await screen.findByRole('button', { name: 'Restore this version' }, LOADED));
      const confirm = await screen.findByRole('alertdialog', {}, LOADED);
      expect(within(confirm).getByText('Changes to Unsaved')).toBeVisible();
      await user.click(within(confirm).getByRole('button', { name: /Stay/ }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      await expect(store.load('report')).resolves.toMatchObject({ value: { revision: 'rev-2' } });
      // Saving them first keeps them as a version, then the restore saves on the new revision.
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
      await expect(store.load('report', { revision: 'rev-3' })).resolves.toMatchObject({
        value: { template: { name: 'Unsaved' } },
      });
      await expect(store.load('report')).resolves.toMatchObject({
        value: { revision: 'rev-4', template: { name: 'Report' } },
      });
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-3.9 drops a version that comes back after another was asked for',
    async () => {
      const user = userEvent.setup();
      const store = storeOf(REPORT, { ...REPORT, name: 'Second' });
      render(<TemplateWorkspace store={store} defaultTemplateId="report" />);
      await nameField();
      await user.click(screen.getByRole('button', { name: 'History' }));
      const history = await screen.findByRole('grid', { name: 'History' }, LOADED);
      const rows = await within(history).findAllByRole('row', {}, LOADED);
      const loads = holdBack(store, 'load');
      await user.click(rows[1] as HTMLElement);
      await waitFor(() => expect(loads.held).toHaveLength(1), LOADED);
      // Back to the template before the version arrives: the current version is picked.
      await user.click(rows[0] as HTMLElement);
      loads.stop();
      loads.held[0]?.release();
      await expect(store.load('report')).resolves.toMatchObject({ ok: true });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.queryByText('Version 1, read only')).not.toBeInTheDocument();
      expect(await nameField()).toBeEnabled();
    },
    SLOW,
  );
});
