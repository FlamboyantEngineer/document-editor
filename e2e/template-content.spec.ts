import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const content = (page: Page) => page.locator('.de-document-editor__content');
const json = (page: Page) => page.getByLabel('Template JSON');
// The content region of the first section holding a part of a template section.
const part = (page: Page, name: string, which: 'content' | 'placeholder') =>
  content(page)
    .locator(`.pm-section[data-section-name="${name}"][data-template-part="${which}"]`)
    .locator('.pm-page-content')
    .first();
// The template as the lab shows it.
const template = async (page: Page) =>
  JSON.parse((await json(page).textContent()) ?? '{}') as {
    sections: { name: string; content?: unknown; placeholder?: unknown }[];
    header?: { content?: unknown };
  };
const sectionOf = async (page: Page, name: string) =>
  (await template(page)).sections.find((section) => section.name === name);

test.describe('template content lab', () => {
  test('DOCE-SECTIONS-5.2 DOCE-SECTIONS-5.3 DOCE-LABS-3.7 edits section content and placeholder in place', async ({
    lab,
    page,
  }) => {
    await lab.open('template-content');
    // The summary has no content yet: its content part shows the placeholder.
    await expect(part(page, 'summary', 'content').locator('.de-section-placeholder')).toHaveText(
      'Summarise the document.',
    );
    await part(page, 'summary', 'placeholder').locator('p').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Two lines at most.');
    await expect
      .poll(async () => JSON.stringify((await sectionOf(page, 'summary'))?.placeholder))
      .toContain('Summarise the document. Two lines at most.');
    await expect(part(page, 'summary', 'content').locator('.de-section-placeholder')).toHaveText(
      'Summarise the document. Two lines at most.',
    );

    await part(page, 'summary', 'content').locator('p').first().click();
    await page.keyboard.type('Scope and purpose.');
    await expect
      .poll(async () => JSON.stringify((await sectionOf(page, 'summary'))?.content))
      .toContain('Scope and purpose.');

    // The sample is read-only, and Backspace never joins the parts.
    const sample = content(page).locator('.pm-section[data-template-part="sample"] h2').first();
    const before = await sample.textContent();
    await sample.click();
    await page.keyboard.type('xyz');
    await expect(sample).toHaveText(before ?? '');
    await part(page, 'summary', 'placeholder').locator('p').first().click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Backspace');
    await expect(content(page).locator('.pm-section[data-section-name="summary"]')).toHaveCount(2);
  });

  test('DOCE-SECTIONS-5.1 keeps every key typed fast in a header, on every page that shows it', async ({
    lab,
    page,
  }) => {
    await lab.open('template-content');
    await expect(page.locator('.de-document-editor')).toHaveAttribute(
      'data-layout-state',
      'settled',
    );
    const headers = content(page).locator('.pm-page-header');
    await headers.first().locator('p').last().click();
    await page.keyboard.press('End');
    // Typed at once, each key before the template and the host's state have caught up.
    await page.keyboard.type('abcdefghijklmnop');
    await expect(headers.first()).toHaveText('Lab templateabcdefghijklmnop');
    await expect(headers.last()).toHaveText('Lab templateabcdefghijklmnop');
    await expect
      .poll(async () => JSON.stringify((await template(page)).header?.content))
      .toContain('Lab templateabcdefghijklmnop');
    expect(lab.errors).toEqual([]);
  });

  test('DOCE-TEMPLATES-8.5 DOCE-SECTIONS-5.3 inserts a variable from the menu into template content', async ({
    lab,
    page,
  }) => {
    await lab.open('template-content');
    await part(page, 'approvals', 'content').locator('p').first().click();
    await page.keyboard.press('End');
    await page.getByRole('button', { name: 'Variable' }).click();
    await expect(page.getByRole('menuitem', { name: /^Page number/ })).toBeVisible();
    await page.getByRole('menuitem', { name: /^Document name/ }).click();
    await expect(
      part(page, 'approvals', 'content').locator('[data-template-variable="document.name"]'),
    ).toHaveText('Interface notes');
    await expect
      .poll(async () => JSON.stringify((await sectionOf(page, 'approvals'))?.content))
      .toContain('"key":"document.name"');
  });

  test('DOCE-TEMPLATES-8.9 DOCE-TEMPLATES-8.10 previews a template script beside it and keeps the script alone', async ({
    lab,
    page,
  }) => {
    await lab.open('template-content');
    const approvals = part(page, 'approvals', 'content');
    const preview = approvals.locator('[data-script-preview] .de-script-preview');
    await expect(preview).toHaveText('Signed by the approvers.');
    await expect(approvals.locator('.de-script-message')).toHaveCount(0);
    // An edit beside it hands the part on with the script and none of its preview.
    await approvals.locator('p').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Today.');
    await expect
      .poll(async () => JSON.stringify((await sectionOf(page, 'approvals'))?.content))
      .toContain('Today.');
    const stored = (await sectionOf(page, 'approvals'))?.content as { type: string }[];
    const script = stored.find((node) => node.type === 'script');
    expect(script).toMatchObject({
      attrs: { source: 'render.paragraph("Signed by the approvers.")' },
    });
    expect(script).not.toHaveProperty('content');
    await expect(preview).toHaveText('Signed by the approvers.');
  });

  test('DOCE-SECTIONS-5.4 DOCE-LABS-4.14 shows the cells of a borderless footer table by a dashed guide while editing', async ({
    lab,
    page,
  }) => {
    await lab.open('template-content');
    await expect(
      page.locator('.de-document-editor [data-template-editing="true"]').first(),
    ).toBeAttached();
    const footers = content(page).locator('.pm-page-footer');
    await expect(footers.first()).toHaveAttribute('contenteditable', 'true');
    const cell = footers.first().locator('td', { hasText: 'Issued' });
    // No border, and a dashed guide while the template is edited.
    expect(
      await cell.evaluate((element) => {
        const computed = getComputedStyle(element);
        return [computed.borderTopStyle, computed.outlineStyle];
      }),
    ).toEqual(['none', 'dashed']);
    // DOCE-LABS-4.14: a header or footer table's cells take no padding.
    expect(await cell.evaluate((element) => getComputedStyle(element).paddingTop)).toBe('0px');
  });

  test('DOCE-SECTIONS-5.3 runs the toolbar inside headers and template content', async ({
    lab,
    page,
  }) => {
    await lab.open('template-content');
    // Bold and italic in the header.
    // The headers turn editable once region editing has set them again: until then they may not
    // say whether they are, and setting them again redraws them under the caret.
    const headers = content(page).locator('.pm-page-header');
    await expect(headers.first()).toHaveAttribute('contenteditable', 'true');
    // One gesture selects the line, so the editor's state holds the selection the browser shows:
    // a selection made with keys after a click is the browser's until the editor reads it, and the
    // state the click made can still be drawn back over it.
    await headers.first().locator('p').first().click({ clickCount: 3 });
    await expect
      .poll(() => page.evaluate(() => document.getSelection()?.toString()))
      .toBe('Lab template');
    // The toolbar follows the selection a render later.
    const bold = page.getByRole('button', { name: 'Bold', exact: true });
    await expect(bold).toBeEnabled();
    await bold.click();
    await expect(bold).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Italic', exact: true }).click();
    await expect
      .poll(async () => JSON.stringify((await template(page)).header?.content))
      .toMatch(/"bold".*"italic"|"italic".*"bold"/);

    // A bulleted list and underlined text in a section's starting content.
    const approvals = part(page, 'approvals', 'content');
    await approvals.locator('p').first().click();
    await page.getByRole('button', { name: 'Bulleted list', exact: true }).click();
    await expect
      .poll(async () => JSON.stringify((await sectionOf(page, 'approvals'))?.content))
      .toContain('"bulletList"');
    await approvals.locator('li p').first().click({ clickCount: 3 });
    await page.getByRole('button', { name: 'Underline', exact: true }).click();
    await expect
      .poll(async () => JSON.stringify((await sectionOf(page, 'approvals'))?.content))
      .toContain('"underline"');

    // In the sample, the toolbar offers nothing that edits.
    await content(page)
      .locator('.pm-section[data-template-part="sample"] .pm-page-content p')
      .first()
      .click();
    await expect(page.getByRole('button', { name: 'Bold', exact: true })).toBeDisabled();
  });

  test('DOCE-LABS-4.11 DOCE-TEMPLATES-3.3 DOCE-TEMPLATES-5.4 draws caption and footnote typography from the template, a section overriding it', async ({
    lab,
    page,
  }) => {
    await lab.open('template-content');
    const look = (selector: string) =>
      content(page)
        .locator(selector)
        .evaluateAll((lines) =>
          lines.map((line) => {
            const label = getComputedStyle(line, '::before');
            const text = line.querySelector('.doc-caption-text');
            const style = text ? getComputedStyle(text) : label;
            const section = line.closest<HTMLElement>('.pm-section')?.dataset.sectionName ?? '';
            return {
              section,
              label: [label.fontWeight, label.fontStyle],
              text: [style.fontWeight, style.fontStyle, style.fontFamily],
            };
          }),
        );
    // The document's table captions: a bold label, an italic text, each taking what the other
    // sets and it does not.
    const tables = await look('.doc-table-caption-line');
    const sample = tables.find((line) => line.section === '');
    expect(sample?.label).toEqual(['700', 'italic']);
    expect(sample?.text.slice(0, 2)).toEqual(['700', 'italic']);
    // The appendix sets its own caption text, which its label falls back to in turn.
    const appendix = tables.find((line) => line.section === 'appendix');
    expect(appendix?.label).toEqual(['700', 'normal']);
    expect(appendix?.text.slice(0, 2)).toEqual(['300', 'normal']);
    // A code caption takes the paragraph's font, not the code's.
    const [code] = await look('.doc-code-caption-line');
    const paragraph = await content(page)
      .locator('.pm-section[data-template-part="sample"] .pm-page-content > p')
      .first()
      .evaluate((element) => getComputedStyle(element).fontFamily);
    expect(code?.text[2]).toBe(paragraph);
    // Footnote entries in the document's size, the appendix's in its own; the numbering suffix
    // follows the number in the footnote area only, never the marker in the text.
    const entries = await content(page)
      .locator('.pm-footnote-entry')
      .evaluateAll((all) =>
        all.map((entry) => ({
          section: entry.closest<HTMLElement>('.pm-section')?.dataset.sectionName ?? '',
          size: getComputedStyle(entry).fontSize,
          suffix: getComputedStyle(
            entry.querySelector('.pm-footnote-entry-number') ?? entry,
            '::after',
          ).content,
        })),
      );
    expect(entries.filter((entry) => entry.section === '').map((entry) => entry.size)).toContain(
      '11px',
    );
    expect(entries.find((entry) => entry.section === 'appendix')?.size).toBe('13px');
    expect(new Set(entries.map((entry) => entry.suffix))).toEqual(new Set(['")"']));
    const markers = await content(page)
      .locator('.footnote-reference')
      .evaluateAll((all) => all.map((marker) => marker.textContent));
    expect(markers.every((marker) => /^\d+$/.test(marker ?? ''))).toBe(true);
  });

  test('DOCE-OBJECTS-2.2 DOCE-TEMPLATES-3.3 centres a table caption on exactly its table, laid out or aligned right', async ({
    lab,
    page,
  }) => {
    await lab.open('template-content');
    const tables = content(page).locator(
      '.pm-section[data-section-name="appendix"][data-template-part="content"] .pm-page-content table',
    );
    await expect(tables).toHaveCount(2);
    const boxes = await tables.evaluateAll((all) =>
      all.map((table) => {
        const caption = table.querySelector('caption');
        const body = table.querySelector('tbody')?.getBoundingClientRect();
        const line = caption?.getBoundingClientRect();
        const content = table.closest('.pm-page-content')?.getBoundingClientRect();
        return {
          align: caption ? getComputedStyle(caption).textAlign : '',
          body: body ? [body.left, body.right] : [],
          line: line ? [line.left, line.right] : [],
          page: content ? [content.left, content.right] : [],
        };
      }),
    );
    for (const box of boxes) {
      expect(box.align).toBe('center');
      expect(Math.abs((box.line[0] ?? 0) - (box.body[0] ?? 0))).toBeLessThanOrEqual(1);
      expect(Math.abs((box.line[1] ?? 0) - (box.body[1] ?? 0))).toBeLessThanOrEqual(1);
    }
    const [plain, right] = boxes;
    expect(Math.abs((plain?.body[0] ?? 0) - (plain?.page[0] ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((right?.body[1] ?? 0) - (right?.page[1] ?? 0))).toBeLessThanOrEqual(1);
    expect((right?.body[1] ?? 0) - (right?.body[0] ?? 0)).toBeLessThan(
      (right?.page[1] ?? 0) - (right?.page[0] ?? 0),
    );
  });
});
