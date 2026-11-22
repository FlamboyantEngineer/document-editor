// @vitest-environment node
import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { readRegressionDocument, readRegressionTemplate } from '../../test/stored-fixtures.js';
import { readDocumentFile } from '../model/index.js';
import { createDocumentSchema } from '../model/schema/document-schema.js';
import { keepsAllNumbers, objectNumbers } from './engine-numbers.js';

const schema = createDocumentSchema();

describe('engine numbers', () => {
  it('DOCE-PAGINATION-11.9 finds each caption label by its object and each equation number in order', () => {
    const file = readRegressionDocument('caption-numbering');
    const template = readRegressionTemplate(file.template?.id ?? 'regression-base');
    const { doc } = readDocumentFile(file, schema);
    const numbers = objectNumbers(doc, template);
    expect([...numbers.captions].slice(0, 5)).toEqual([
      ['ca910007', 'Figure i - '],
      ['ca91000b', 'Figure 1.1 - '],
      ['ca91001b', 'Table 1.1 - '],
      ['ca91001c', 'Code Block 1.1 - '],
      ['ca91001f', 'Figure 1.2 - '],
    ]);
    expect(numbers.equations.slice(0, 3)).toEqual(['(Eq. i)', '(Eq. 1.1)', '(Eq. 1.2)']);
  });

  it('DOCE-PAGINATION-11.9 counts the numbers again only when an edit can change them', () => {
    const doc = schema.node('doc', null, [
      schema.node('heading', { level: 1, dataId: 'h1' }, [schema.text('Title')]),
      schema.node('paragraph', { dataId: 'p1' }, [schema.text('Body')]),
    ]);
    const state = EditorState.create({ doc });
    const strong = schema.mark('strong');
    const body = doc.child(0).nodeSize + 2;
    expect(keepsAllNumbers(state.tr.insertText('x', body))).toBe(true);
    expect(keepsAllNumbers(state.tr.addMark(body, body + 2, strong))).toBe(true);
    expect(keepsAllNumbers(state.tr.insertText('x', 2))).toBe(false);
    const split = state.tr.setSelection(TextSelection.create(doc, body + 1)).split(body + 1);
    expect(keepsAllNumbers(split)).toBe(false);
  });
});
