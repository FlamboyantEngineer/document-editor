// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readDocx } from '../../import/index.js';
import type { DocumentFile, StoredNode } from './document-format.js';
import { writeDocx } from './docx.js';
import { writeMarkdown } from './markdown.js';
import { readMarkdown } from './markdown-read.js';
import type { TemplateFile } from './template-format.js';

const paragraph = (value: string): StoredNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text: value }],
});

const item = (value: string, checked?: boolean): StoredNode => ({
  type: 'listItem',
  ...(checked === undefined ? {} : { attrs: { checked } }),
  content: [paragraph(value)],
});

const CHECKLIST: StoredNode = {
  type: 'bulletList',
  content: [item('Pack the tent', true), item('Fill the bottles', false), item('Notes')],
};

const fileOf = (...content: StoredNode[]): DocumentFile => ({
  formatVersion: 1,
  sections: [{ name: null, content }],
});

const TEMPLATE: TemplateFile = { formatVersion: 1, id: 'plain' };

describe('checklists in Markdown', () => {
  it('DOCE-FORMAT-4.1 writes checklist items as task list items', () => {
    expect(writeMarkdown(fileOf(CHECKLIST)).trim()).toBe(
      '- [x] Pack the tent\n- [ ] Fill the bottles\n- Notes',
    );
  });

  it('DOCE-IMPORT-4.1 reads task list items as checklist items', () => {
    const { file } = readMarkdown('- [x] Pack the tent\n- [ ] Fill the bottles\n- Notes\n');
    expect(file.sections[0]?.content).toEqual([CHECKLIST]);
  });

  it('DOCE-IMPORT-4.1 reads a box in a numbered item, or one escaped, as text', () => {
    const { file } = readMarkdown('1. [ ] First\n\n- \\[ ] Plain\n');
    expect(file.sections[0]?.content).toEqual([
      { type: 'orderedList', content: [item('[ ] First')] },
      { type: 'bulletList', content: [item('[ ] Plain')] },
    ]);
    expect(writeMarkdown(fileOf({ type: 'bulletList', content: [item('[ ] Plain')] }))).toContain(
      '- \\[ \\] Plain',
    );
  });
});

describe('checklists in Word', () => {
  it('DOCE-FORMAT-5.5 writes a checklist item led by its box, and DOCE-IMPORT-2.3 reads it back', async () => {
    const written = writeDocx(fileOf(CHECKLIST), { template: TEMPLATE });
    const read = await readDocx(written, { template: TEMPLATE });
    if (!read.ok) throw new Error(read.message);
    expect(read.file.sections[0]?.content).toEqual([CHECKLIST]);
  });
});
