// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readRegressionDocument, readRegressionTemplate } from '../../test/stored-fixtures.js';
import type { DocumentFile } from '../model/index.js';
import { documentTargets, replaceTemplate, validateRequiredSections } from './stored-template.js';

const schema = documentSchema;

describe('stored-file readers with a template', () => {
  it('DOCE-FORMAT-9.4 lists the targets a reference may cite, numbered by the template', () => {
    expect(typeof document).toBe('undefined');
    const targets = documentTargets(readRegressionDocument('cross-references'), {
      schema,
      template: readRegressionTemplate('regression-base'),
    });
    expect(targets.map(({ id, kind, label }) => [id, kind, label])).toEqual([
      ['c7265b09', 'heading', '1. Target heading'],
      ['c4265650', 'figure', '1 - Target figure'],
      ['c8265c9c', 'table', '1 - Target table'],
      ['c9265e2f', 'codeblock', '1 - Target code'],
      ['ce26660e', 'equation', '(1) - a^2 + b^2 = c^2'],
    ]);
    expect(targets[0]).toEqual({
      id: 'c7265b09',
      kind: 'heading',
      number: '1.',
      title: 'Target heading',
      label: '1. Target heading',
    });
  });

  it('DOCE-FORMAT-9.5 reports a required section left empty, and none for a full document', () => {
    const template = readRegressionTemplate('regression-locked');
    expect(
      validateRequiredSections(
        readRegressionDocument('locked-sections-optional-left-out'),
        template,
      ),
    ).toEqual([{ name: 'summary', problem: 'empty' }]);
    expect(validateRequiredSections(readRegressionDocument('locked-sections'), template)).toEqual(
      [],
    );
  });

  it('DOCE-FORMAT-9.5 reports missing required sections in the template order', () => {
    const file: DocumentFile = {
      formatVersion: 1,
      sections: [
        { name: 'body', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] },
      ],
    };
    expect(validateRequiredSections(file, readRegressionTemplate('regression-locked'))).toEqual([
      { name: 'notice', problem: 'missing' },
      { name: 'summary', problem: 'missing' },
      { name: 'sign_off', problem: 'missing' },
    ]);
  });

  it('DOCE-FORMAT-9.7 moves a document to a template and pins it at a revision', () => {
    const template = readRegressionTemplate('regression-locked');
    const moved = replaceTemplate(readRegressionDocument('minimal-paragraph'), {
      schema,
      template,
      revision: '7',
    });
    expect(moved.template).toEqual({ id: 'regression-locked', revision: '7' });
    expect(moved.sections.map((section) => section.name)).toEqual([
      'notice',
      'summary',
      'body',
      'sign_off',
    ]);
    const notice = template.sections?.find((section) => section.name === 'notice');
    expect(moved.sections[0]?.content).toEqual(notice?.content);
    expect(validateRequiredSections(moved, template)).toEqual([
      { name: 'summary', problem: 'empty' },
    ]);
  });

  it('DOCE-FORMAT-9.7 restores locked content, frees unknown sections and keeps what it cannot read', () => {
    const template = readRegressionTemplate('regression-locked');
    const file = readRegressionDocument('locked-sections');
    const kept = { type: 'hostWidget', attrs: { size: 2 } };
    const edited: DocumentFile = {
      ...file,
      sections: [
        ...file.sections.map((section) =>
          section.name === 'notice'
            ? {
                ...section,
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Edited' }] }],
              }
            : section,
        ),
        { name: 'retired', content: [kept] },
      ],
    };
    const moved = replaceTemplate(edited, { schema, template });
    expect(moved.template).toEqual({ id: 'regression-locked' });
    expect(moved.sections.slice(0, -1)).toEqual(file.sections);
    expect(moved.sections.at(-1)).toEqual({ name: null, content: [kept] });
  });
});
