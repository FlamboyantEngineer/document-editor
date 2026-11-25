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

test.describe('stored-file tools in the automation lab', () => {
  const output = (page: Page) => page.getByRole('region', { name: 'Reader output' });
  const shown = async (page: Page) => JSON.parse((await output(page).textContent()) ?? 'null');

  test('DOCE-LABS-3.5 DOCE-AUTOMATION-1.4 DOCE-TABLES-4.1 replaces, deletes and re-levels blocks and adds a table of rows', async ({
    lab,
    page,
  }) => {
    await lab.open('automation');
    await page.getByLabel('Edits').selectOption('direct');
    await send(page, 'Replace the Scope paragraph');
    await expect(result(page)).toContainText('The batch: saved as revision 2');
    await expect(content(page)).toContainText('The scope covers every connector.');

    await send(page, 'Make the Timing heading level 2');
    await expect(result(page)).toContainText('saved as revision 3');
    await expect(
      content(page)
        .locator('h2')
        .filter({ hasText: /^Timing$/ }),
    ).toBeVisible();

    await page.getByLabel('Example batch').selectOption('Delete the paragraph after Timing');
    await page.getByRole('button', { name: 'Read the document' }).click();
    const batch = JSON.parse(
      await page.getByRole('textbox', { name: 'Batch', exact: true }).inputValue(),
    ) as { elementId: string }[];
    const deleted = content(page).locator(`[data-id="${batch[0]?.elementId ?? ''}"]`);
    await expect(deleted).toHaveCount(1);
    await page.getByRole('button', { name: 'Send the batch' }).click();
    await expect(result(page)).toContainText('saved as revision 4');
    await expect(deleted).toHaveCount(0);

    await send(page, 'Add a table of rows after Scope');
    await expect(result(page)).toContainText('saved as revision 5');
    const table = content(page).locator('table').first();
    await expect(table).toContainText('Both carry the same shield.');
    await expect(table.locator('td[colspan="2"]')).toHaveCount(1);
  });

  test('DOCE-LABS-3.5 DOCE-EDITING-1.6 checks, repairs and copies the stored ids', async ({
    lab,
    page,
  }) => {
    await lab.open('automation');
    await page.getByRole('button', { name: 'Check the stored ids' }).click();
    expect(await shown(page)).toEqual([]);
    await page.getByRole('button', { name: 'Paste a copy with a repeated id' }).click();
    await expect(result(page)).toContainText('A pasted copy: saved as revision 2');
    await page.getByRole('button', { name: 'Check the stored ids' }).click();
    await expect(output(page)).toContainText('"problem": "repeated"');

    await page.getByRole('button', { name: 'Repair the stored ids' }).click();
    await expect(result(page)).toContainText('Repaired the ids: saved as revision 3');
    await page.getByRole('button', { name: 'Check the stored ids' }).click();
    expect(await shown(page)).toEqual([]);
    await page.getByRole('button', { name: 'Repair the stored ids' }).click();
    await expect(result(page)).toContainText('Repaired the ids: nothing to change');

    await page.getByRole('button', { name: 'Copy the document' }).click();
    const copy = await shown(page);
    expect(copy.copied).toBeGreaterThan(3);
    expect(copy.keptIds).toBe(0);
    expect(copy.writers).toEqual(['ada']);
  });

  test('DOCE-LABS-3.5 DOCE-FORMAT-9.11 DOCE-FORMAT-9.10 DOCE-SUGGESTIONS-2.5 changes a thread and credits a suggestion to its thread', async ({
    lab,
    page,
  }) => {
    await lab.open('automation');
    await page.getByLabel('Edits').selectOption('direct');
    await send(page, 'Comment on the Scope heading');
    await expect(result(page)).toContainText('saved as revision 2');
    await page.getByRole('button', { name: 'Change the first thread' }).click();
    await expect(result(page)).toContainText('Thread resolved: saved as revision 3');
    await page.getByRole('button', { name: 'List the thread anchors' }).click();
    await expect(output(page)).toContainText('"state": "resolved"');
    await page.getByLabel('Thread change').selectOption('removed');
    await page.getByRole('button', { name: 'Change the first thread' }).click();
    await expect(result(page)).toContainText('Thread removed: saved as revision 4');
    await page.getByRole('button', { name: 'List the thread anchors' }).click();
    expect(await shown(page)).toEqual([]);

    await page.getByRole('button', { name: 'Add a suggestion without its writer' }).click();
    await expect(result(page)).toContainText('saved as revision 5');
    await page.getByRole('button', { name: 'Accept the first suggestion, credited' }).click();
    await expect(result(page)).toContainText('Accepted the first suggestion: saved as revision 6');
    expect((await shown(page)).writers).toContain('grace');
    await page.getByRole('button', { name: 'List the writers' }).click();
    expect(await shown(page)).toContain('grace');
    await page.getByRole('checkbox', { name: 'Only since the save before' }).check();
    await page.getByRole('button', { name: 'List the writers' }).click();
    expect(await shown(page)).toEqual(['grace']);
  });

  test('DOCE-LABS-3.5 DOCE-FORMAT-9.9 DOCE-FORMAT-9.12 DOCE-FORMAT-9.13 reads the embeds, the outline and the authored content', async ({
    lab,
    page,
  }) => {
    await lab.open('automation');
    await page.getByRole('button', { name: 'List the embeds' }).click();
    const [embed] = await shown(page);
    expect(embed).toMatchObject({ kind: 'data-set', source: 'tides-7', label: 'Tide table' });

    await page.getByRole('button', { name: 'Read the outline' }).click();
    type Entry = { level: number; text: string; number: string; elementId: string; span: string[] };
    const outline = ((await shown(page)) as Entry[]).filter((entry) => entry.level === 1);
    expect(outline.map((entry) => entry.text)).toEqual(['Scope', 'Timing']);
    expect(outline[1]?.number).toBe('2.');
    expect(outline[1]?.span.length).toBeGreaterThan(5);

    await page.getByLabel('Heading id').fill(outline[0]?.elementId ?? '');
    await page.getByRole('button', { name: 'Read the authored content' }).click();
    const scope = await shown(page);
    expect(scope.missing).toEqual([]);
    expect(JSON.stringify(scope.content)).toContain('Scope');
    expect(JSON.stringify(scope.content)).not.toContain('Timing');
    await page.getByLabel('Heading id').fill('nowhere1');
    await page.getByRole('button', { name: 'Read the authored content' }).click();
    expect((await shown(page)).missing).toEqual(['nowhere1']);
  });

  test('DOCE-LABS-3.5 DOCE-OBJECTS-4.5 DOCE-OBJECTS-4.7 builds script output and finds it stale once the document changes', async ({
    lab,
    page,
  }) => {
    await lab.open('automation');
    await page.getByRole('button', { name: 'Run the scripts' }).click();
    await expect(result(page)).toContainText('The scripts: saved');
    await expect(content(page).locator('table', { hasText: '28 V' })).toBeVisible();
    await page.getByRole('button', { name: 'Find stale scripts' }).click();
    expect((await shown(page)).stale).toEqual([]);
    await page.getByRole('button', { name: 'Another writer saves' }).click();
    await expect(result(page)).toContainText('Another writer: saved');
    await page.getByRole('button', { name: 'Find stale scripts' }).click();
    expect((await shown(page)).stale).toHaveLength(2);
  });

  test('DOCE-LABS-3.5 DOCE-EDITOR-6.27 DOCE-EDITOR-6.25 DOCE-FORMAT-6.4 renders the stored document as a static page with server images', async ({
    lab,
    page,
  }) => {
    await lab.open('automation');
    await page.getByRole('button', { name: 'Render the static page' }).click();
    const frame = page.frameLocator('iframe[title="Static render"]');
    await expect(frame.locator('.de-document-editor[data-print="true"]')).toContainText('Timing');
    await expect(frame.locator('img')).toHaveAttribute('src', /16a34a/);
    await expect(frame.locator('img')).toHaveAttribute('loading', 'eager');
    await page.getByRole('checkbox', { name: 'Images from the print server' }).uncheck();
    await page.getByRole('button', { name: 'Render the static page' }).click();
    await expect(frame.locator('img')).toHaveAttribute('src', /3b82f6/);

    await page.getByRole('button', { name: 'Write static HTML' }).click();
    await expect(output(page)).toContainText('<h1');
    await expect(output(page)).toContainText('Issued by the systems group.');
  });

  test('DOCE-LABS-3.5 DOCE-CONTENTS-1.7 DOCE-OBJECTS-2.4 DOCE-NUMBERING-1.3 DOCE-REFERENCES-2.4 runs the server checks', async ({
    lab,
    page,
  }) => {
    await lab.open('automation');
    await page.getByRole('button', { name: 'Counters at each heading' }).click();
    const counters = await shown(page);
    expect(counters.Scope.headings[0]).toBe(0);
    expect(counters.Timing.headings[0]).toBe(1);

    await page.getByRole('button', { name: 'Run the scripts' }).click();
    await expect(result(page)).toContainText('The scripts: saved');
    await page.getByRole('button', { name: 'Caption line of each table' }).click();
    expect(await shown(page)).toContainEqual(expect.objectContaining({ width: '100%' }));

    await page.getByRole('button', { name: 'Read the numeral' }).click();
    expect(await shown(page)).toEqual({ value: 14 });
    await page.getByLabel('Roman numeral').fill('xiiv');
    await page.getByRole('button', { name: 'Read the numeral' }).click();
    expect(await shown(page)).toEqual({ value: null });

    await page.getByRole('button', { name: 'Check the glossary entry' }).click();
    expect(await shown(page)).toEqual({
      isEntryId: true,
      entry: { abbreviation: 'PSU', expansion: 'Power supply unit' },
    });
    await page.getByLabel('Expansion').fill('');
    await page.getByRole('button', { name: 'Check the glossary entry' }).click();
    expect((await shown(page)).entry.refused).toBeTruthy();

    await page.getByRole('button', { name: 'Write the caption line' }).click();
    await expect(output(page)).toHaveText('Table 1.1 - Limits at sea level (continued)');
  });
});
