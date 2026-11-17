// What the template workspace's tests share: a memory store of templates, the waits a whole
// editor needs on a busy runner, and the reader's steps through the workspace's controls.

import { screen, within } from '@testing-library/react';
import type { userEvent } from '@testing-library/user-event';
import { createMemoryHost } from '../src/host/memory-host.js';
import type { TemplateFile } from '../src/model/index.js';

/** The whole template editor renders in each test, which takes seconds on a shared CI runner. */
export const SLOW = 45_000;
/**
 * Opening a template loads it from the store and renders the editor again, which a busy runner
 * can take over a second to finish: waits on that use a longer window than the default second.
 */
export const LOADED = { timeout: 10_000 };

export type User = ReturnType<typeof userEvent.setup>;

/** A memory host's template store holding these templates, each saved once. */
export const storeOf = (...templates: TemplateFile[]) =>
  createMemoryHost({ templates, now: () => new Date('2026-01-02T03:04:05Z') }).templates;

/** The workspace's root. */
export const workspaceRoot = () => document.querySelector('.de-template-workspace');

/** The open template's Name field, once it shows. */
export const nameField = () => screen.findByRole('textbox', { name: 'Name' }, LOADED);

/** Renames the open template through its Name row. */
export async function rename(user: User, name: string) {
  const field = await nameField();
  await user.clear(field);
  await user.paste(name);
  await user.keyboard('{Enter}');
}

/** The toolbar's Save button, whatever its name says of the last save. */
export const saveButton = () =>
  within(screen.getByRole('toolbar', { name: 'Template actions' })).getByRole('button', {
    name: /^(Save|Saved|Not saved: .*)$/,
  });

/** Opens a stored template through the Open dialog, picking its row by name. */
export async function openFromDialog(user: User, name: RegExp) {
  await user.click(screen.getByRole('button', { name: 'Open' }));
  const dialog = await screen.findByRole('dialog', { name: 'Open a template' }, LOADED);
  await user.click(await within(dialog).findByRole('row', { name }, LOADED));
  await user.click(within(dialog).getByRole('button', { name: 'Open' }));
}

/** Shows the side panel's History pane and gives its list of versions. */
export async function showHistory(user: User) {
  await user.click(screen.getByRole('tab', { name: 'History' }));
  return screen.findByRole('grid', { name: 'History' }, LOADED);
}

/** Runs a version row's action, such as "View version" or "Restore version". */
export async function versionAction(user: User, row: HTMLElement, action: string) {
  await user.click(within(row).getByRole('button', { name: 'Version actions' }));
  await user.click(await screen.findByRole('menuitem', { name: action }, LOADED));
}
