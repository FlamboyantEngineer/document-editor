import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');
const report = (page: Page) => page.getByRole('status', { name: 'Import report' });
const warnings = (page: Page) => page.getByRole('list', { name: 'Import warnings' });
const written = (page: Page) => page.getByRole('region', { name: 'Written document' });

test.describe('import and export', () => {
  test('DOCE-LABS-3.4 reads Markdown into the body with its warnings', async ({ lab, page }) => {
    await lab.open('import-export');
    await page.getByRole('button', { name: 'Read the sample Markdown' }).click();
    await expect(report(page)).toHaveText('The sample Markdown');
    await expect(content(page)).toContainText('Imported notes');
    await expect(content(page).locator('table')).toContainText('28 V');
    await expect(content(page)).toContainText('The limits apply at sea level.');
    await expect(warnings(page)).toContainText('content-left-out');
  });

  test('DOCE-LABS-3.4 writes the document as Word and reads it back, within the archive limits', async ({
    lab,
    page,
  }) => {
    await lab.open('import-export');
    await page.getByRole('button', { name: 'Write as Word and read it back' }).click();
    await expect(report(page)).toContainText('The document written as Word:');
    await expect(content(page)).toContainText('Interfaces');

    await page.getByRole('checkbox', { name: 'Allow only 5 files in an archive' }).check();
    await page.getByRole('button', { name: 'Write as Word and read it back' }).click();
    await expect(report(page)).toContainText('could not be read: too-large');
  });

  test('DOCE-LABS-3.4 reads pasted HTML into the section picked', async ({ lab, page }) => {
    await lab.open('import-export');
    await page.getByLabel('Into the section').selectOption('appendix');
    await page.getByRole('button', { name: 'Read the HTML' }).click();
    await expect(report(page)).toHaveText('The pasted HTML');
    await expect(content(page)).toContainText('Pasted from a web page');
  });

  test('DOCE-LABS-3.4 writes Markdown with front matter, comments and suggestions, whole or in part', async ({
    lab,
    page,
  }) => {
    await lab.open('import-export');
    await page.getByRole('button', { name: 'Write Markdown' }).click();
    await expect(written(page)).toContainText('author: "Ada Lovelace"');
    await expect(written(page)).toContainText('# Interface control document');
    await expect(written(page)).toContainText('Weekly or monthly?');
    await expect(written(page)).toContainText('each report');

    await page.getByLabel('Suggestions in the export').selectOption('rejected');
    await page.getByLabel('Part to export').selectOption('appendix');
    await page.getByRole('checkbox', { name: 'Front matter' }).uncheck();
    await page.getByRole('button', { name: 'Write Markdown' }).click();
    await expect(written(page)).toContainText('Glossary');
    await expect(written(page)).not.toContainText('author: "Ada Lovelace"');
    await expect(written(page)).not.toContainText('Interfaces');

    await page.getByRole('button', { name: 'Write HTML' }).click();
    await expect(written(page)).toContainText('<h1');
  });
});

test.describe('import options and template documents', () => {
  type Stored = {
    sections: {
      name?: string | null;
      content: { type: string; attrs?: Record<string, unknown> }[];
    }[];
  };
  const stored = async (page: Page): Promise<Stored> => {
    await page.getByRole('button', { name: 'Write the stored format' }).click();
    return JSON.parse((await written(page).textContent()) ?? '{}') as Stored;
  };
  const section = (file: Stored, name: string) =>
    file.sections.find((each) => each.name === name)?.content ?? [];
  const readSample = async (page: Page) => {
    await page.getByRole('button', { name: 'Read the sample Word document' }).click();
    await expect(report(page)).toContainText('The sample Word document:');
  };

  test('DOCE-LABS-3.4 DOCE-IMPORT-2.1 DOCE-IMPORT-2.10 DOCE-IMPORT-2.15 DOCE-IMPORT-3.5 DOCE-IMPORT-3.6 reads typed captions and appendices and leaves out a title the cover shows', async ({
    lab,
    page,
  }) => {
    await lab.open('import-export');
    await readSample(page);
    await expect(content(page)).not.toContainText('Pump station notes');
    const file = await stored(page);
    const body = section(file, 'body');
    expect(body.map((node) => node.type)).toEqual(['heading', 'paragraph', 'table', 'figure']);
    expect(JSON.stringify(body)).toContain('Pump flows');
    expect(JSON.stringify(body)).not.toContain('Table 1.');
    expect(JSON.stringify(section(file, 'appendix'))).toContain('Keep two seals for each pump.');

    await page.getByRole('checkbox', { name: 'Read typed captions' }).uncheck();
    await page.getByRole('checkbox', { name: 'Appendices into the appendix section' }).uncheck();
    await page.getByRole('checkbox', { name: 'Leave out a title the cover shows' }).uncheck();
    await readSample(page);
    await expect(content(page)).toContainText('Pump station notes');
    const plain = await stored(page);
    expect(JSON.stringify(section(plain, 'body'))).toContain('Table 1. Pump flows');
    expect(section(plain, 'appendix')).toEqual([]);
    expect(JSON.stringify(section(plain, 'body'))).toContain('Keep two seals for each pump.');
  });

  test('DOCE-LABS-3.4 DOCE-IMPORT-2.8 DOCE-IMPORT-3.3 gives images a host placeholder and fits tables inside an inset', async ({
    lab,
    page,
  }) => {
    await lab.open('import-export');
    await readSample(page);
    await expect(content(page).locator('figure img')).toHaveAttribute('src', /^data:image\/png/);
    const widths = (file: Stored) => {
      const table = section(file, 'body').find((node) => node.type === 'table');
      const row = JSON.stringify(table).match(/"colwidth":\[(\d+)\]/g) ?? [];
      return row.slice(0, 2).reduce((sum, each) => sum + Number(/\d+/.exec(each)?.[0]), 0);
    };
    const fitted = widths(await stored(page));
    expect(fitted).toBeGreaterThan(500);
    expect(fitted).toBeLessThanOrEqual(602);

    await page.getByRole('checkbox', { name: 'Images as upload placeholders' }).check();
    await page.getByLabel('Table inset (px)').fill('100');
    await readSample(page);
    await expect(content(page).locator('figure img')).toHaveAttribute('src', /94a3b8/);
    expect(widths(await stored(page))).toBeLessThanOrEqual(fitted - 99);
  });

  test('DOCE-LABS-3.4 DOCE-FORMAT-5.7 writes the comment threads into the Word document', async ({
    lab,
    page,
  }) => {
    await lab.open('import-export');
    await page.getByRole('button', { name: 'Write as Word and read it back' }).click();
    await expect(report(page)).toContainText('1 comment threads');
    await page.getByRole('button', { name: 'Reopen the sample' }).click();
    await page.getByRole('checkbox', { name: 'Comments', exact: true }).uncheck();
    await page.getByRole('button', { name: 'Write as Word and read it back' }).click();
    await expect(report(page)).toContainText('0 comment threads');
  });

  test('DOCE-LABS-3.4 DOCE-IMPORT-1.1 DOCE-IMPORT-3.1 DOCE-TEMPLATES-8.1 DOCE-SECTIONS-4.1 DOCE-SECTIONS-2.5 makes a new document of the template and manages its appendix', async ({
    lab,
    page,
  }) => {
    await lab.open('import-export');
    await page.getByRole('button', { name: 'New document from the template' }).click();
    await expect(report(page)).toHaveText('A new document of the template');
    const file = await stored(page);
    expect(file.sections.map((each) => each.name)).toEqual(['cover', 'body']);
    expect(section(file, 'body')).toContainEqual(
      expect.objectContaining({
        type: 'contents',
        attrs: expect.objectContaining({ kind: 'tables' }),
      }),
    );
    await page.getByRole('button', { name: 'List the drift from the template' }).click();
    await expect(report(page)).toHaveText('Drift: []');

    await page.getByRole('button', { name: 'Take out empty appendices' }).click();
    await expect(report(page)).toHaveText('No empty appendix to take out');
    await page.getByRole('button', { name: 'Add an empty appendix' }).click();
    await expect(report(page)).toHaveText('Added an empty appendix');
    await expect(content(page).locator('.pm-section[data-section-name="appendix"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Take out empty appendices' }).click();
    await expect(report(page)).toHaveText('Took out the empty appendices');
    await expect(content(page).locator('.pm-section[data-section-name="appendix"]')).toHaveCount(0);
  });

  test('DOCE-LABS-3.4 DOCE-FORMAT-1.5 DOCE-FORMAT-6.1 DOCE-FORMAT-8.1 reads HTML as a whole document and upgrades a stored file', async ({
    lab,
    page,
  }) => {
    await lab.open('import-export');
    await page.getByRole('button', { name: 'Read as a whole HTML document' }).click();
    await expect(report(page)).toHaveText('The HTML as a document');
    await expect(content(page)).toContainText('Pasted from a web page');

    await page.getByRole('button', { name: 'Upgrade and read the stored file' }).click();
    await expect(report(page)).toHaveText('The stored file, upgraded');
    await expect(content(page)).toContainText('Kept as stored.');
    await page.getByLabel('Stored file to upgrade').fill('{"formatVersion": 99, "sections": []}');
    await page.getByRole('button', { name: 'Upgrade and read the stored file' }).click();
    await expect(report(page)).toContainText('The stored file was refused');
  });

  test('DOCE-LABS-3.4 DOCE-HOST-1.26 DOCE-EDITOR-6.26 exports a PDF through the print service', async ({
    lab,
    page,
  }) => {
    await lab.open('import-export');
    const exported = page.getByRole('status', { name: 'PDF export' });
    await page
      .getByRole('toolbar', { name: 'Formatting' })
      .getByRole('button', { name: 'Document menu' })
      .click();
    await page.getByRole('menuitem', { name: 'Export to PDF' }).click();
    await expect(exported).toHaveText(
      /^Saved interface-notes\.pdf \(application\/pdf, \d+ bytes, [1-9]\d* pages, 0 images failed\)$/,
    );
    const frame = page.frameLocator('iframe[title="Print service page"]');
    await expect(frame.locator('.pm-page').first()).toBeAttached();

    const feedback = page.getByRole('status', { name: 'Export feedback' });
    await expect(feedback).toHaveText(/^success: /);
    await page.getByRole('checkbox', { name: 'The print service fails' }).check();
    await page.getByRole('button', { name: 'Clear the export' }).click();
    await page
      .getByRole('toolbar', { name: 'Formatting' })
      .getByRole('button', { name: 'Document menu' })
      .click();
    await page.getByRole('menuitem', { name: 'Export to PDF' }).click();
    await expect(feedback).toHaveText(/^error: /);
    await expect(exported).toHaveText('');
  });
});
