import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');
const result = (page: Page) => page.getByRole('status', { name: 'Host result' });

async function send(page: Page, example: string) {
  await page.getByLabel('Example batch').selectOption(example);
  await page.getByRole('button', { name: 'Read the document' }).click();
  await expect(page.getByRole('status', { name: 'Read revision' })).toContainText('Read revision');
  await page.getByRole('button', { name: 'Send the batch' }).click();
}

test.describe('automation on stored documents', () => {
  test('DOCE-LABS-3.5 saves an agent batch as suggestions, then decides them', async ({
    lab,
    page,
  }) => {
    await lab.open('automation');
    await send(page, 'Add a paragraph after the Timing heading');
    await expect(result(page)).toContainText('The batch: saved as revision 2');
    await expect(content(page)).toContainText('Timing is measured at the connector.');
    await expect(page.getByText('1 suggestions')).toBeVisible();

    await page.getByRole('button', { name: 'Compare with the save before' }).click();
    await expect(page.getByRole('list', { name: 'Changes since the save before' })).toContainText(
      'Timing is measured at the connector.',
    );

    await page.getByRole('button', { name: 'Accept every suggestion' }).click();
    await expect(result(page)).toContainText('Decided (accept): saved as revision 3');
    await expect(page.getByText('0 suggestions')).toBeVisible();
  });

  test('DOCE-LABS-3.5 refuses a stale batch, a locked section and text that moved', async ({
    lab,
    page,
  }) => {
    await lab.open('automation');
    await page.getByLabel('Example batch').selectOption('Reword the first paragraph');
    await page.getByRole('button', { name: 'Read the document' }).click();
    await page.getByRole('button', { name: 'Another writer saves' }).click();
    await expect(result(page)).toContainText('Another writer: saved as revision 2');
    await page.getByRole('button', { name: 'Send the batch' }).click();
    await expect(result(page)).toContainText('Refused (conflict)');

    await send(page, 'Edit the locked cover (refused)');
    await expect(result(page)).toContainText('Refused (locked)');

    await send(page, 'Expect text that is not there (refused)');
    await expect(result(page)).toContainText('Refused (stale)');
  });

  test('DOCE-LABS-3.5 stores the comment threads a batch opens and runs the scripts', async ({
    lab,
    page,
  }) => {
    await lab.open('automation');
    await page.getByLabel('Edits').selectOption('direct');
    await send(page, 'Comment on the Scope heading');
    await expect(page.getByText('1 comment threads')).toBeVisible();

    await page.getByRole('button', { name: 'Run the scripts' }).click();
    await expect(result(page)).toContainText('The scripts: saved');
    await expect(content(page)).toContainText(/Status: \d+ blocks\./);
  });
});

test.describe('stored-file readers in the automation lab', () => {
  const output = (page: Page) => page.getByRole('region', { name: 'Reader output' });

  test('DOCE-LABS-3.5 DOCE-FORMAT-9.2 DOCE-FORMAT-9.3 DOCE-FORMAT-9.4 reads the text, citations and targets without an editor', async ({
    lab,
    page,
  }) => {
    await lab.open('automation');
    await page.getByRole('button', { name: 'Read the text' }).click();
    await expect(output(page)).toContainText('Issued by the systems group.');
    await page.getByRole('button', { name: 'List the citations' }).click();
    await expect(output(page)).toContainText('"text": "Timing"');
    await page.getByRole('button', { name: 'List the reference targets' }).click();
    await expect(output(page)).toContainText('"kind": "heading"');
  });

  test('DOCE-LABS-3.5 DOCE-FORMAT-9.1 finds an element by its id', async ({ lab, page }) => {
    await lab.open('automation');
    await page.getByRole('button', { name: 'List the reference targets' }).click();
    const id = /"id": "([^"]+)"/.exec((await output(page).textContent()) ?? '')?.[1] ?? '';
    await page.getByLabel('Element id').fill(id);
    await page.getByRole('button', { name: 'Find the element' }).click();
    await expect(output(page)).toContainText('"section": "body"');
    await page.getByLabel('Element id').fill('nowhere');
    await page.getByRole('button', { name: 'Find the element' }).click();
    await expect(output(page)).toContainText('No element has the id nowhere');
  });

  test('DOCE-LABS-3.5 DOCE-FORMAT-9.5 DOCE-FORMAT-9.7 moves the document to a template that requires more', async ({
    lab,
    page,
  }) => {
    await lab.open('automation');
    await page.getByRole('button', { name: 'Check against the strict template' }).click();
    await expect(output(page)).toContainText('"problem": "missing"');
    await page.getByRole('button', { name: 'Move to the strict template' }).click();
    await expect(result(page)).toContainText('Moved to the strict template: saved as revision 2');
    await page.getByRole('button', { name: 'Check against the strict template' }).click();
    await expect(output(page)).not.toContainText('"missing"');
  });

  test('DOCE-LABS-3.5 DOCE-FORMAT-9.6 DOCE-FORMAT-9.8 lists thread anchors and decides one suggestion', async ({
    lab,
    page,
  }) => {
    await lab.open('automation');
    await send(page, 'Comment on the Scope heading');
    await expect(result(page)).toContainText('saved as revision 2');
    await page.getByRole('button', { name: 'List the thread anchors' }).click();
    await expect(output(page)).toContainText('"comment"');
    await expect(output(page)).toContainText('"text": "Scope"');
    await send(page, 'Add a paragraph after the Timing heading');
    await expect(result(page)).toContainText('saved as revision 3');
    await page.getByRole('button', { name: 'Accept the first suggestion only' }).click();
    await expect(result(page)).toContainText(/Accepted \S+: saved as revision 4/);
    await expect(page.getByText('0 suggestions')).toBeVisible();
  });
});
