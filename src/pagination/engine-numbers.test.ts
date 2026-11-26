// @vitest-environment node
import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { node, page, pagesDocument, stubEngine } from '../../test/pages-fixtures.js';
import { readRegressionDocument, readRegressionTemplate } from '../../test/stored-fixtures.js';
import { captionNumbers } from '../layout-engine/blocks/numbers.js';
import { BASE_TEMPLATE, catalogDocument, readDocumentFile } from '../model/index.js';
import { splitTableFigureWith } from '../model/pagination/table-split.js';
import { createDocumentSchema } from '../model/schema/document-schema.js';
import {
  engineNumbers,
  engineNumbersKey,
  keepsAllNumbers,
  objectNumbers,
} from './engine-numbers.js';
import { createProjectionMap } from './projection-map.js';

const schema = createDocumentSchema();

const figureCaption = (id: string, text: string) =>
  node('figure_caption', { dataId: id }, [documentSchema.text(text)]);
const figure = (id: string, text: string) =>
  node('figure', { dataId: id, width: 40, height: 30 }, [figureCaption(`${id}-caption`, text)]);
const equation = (text: string) => node('math_display', null, [documentSchema.text(text)]);
const headerRow = (nested: boolean) => {
  const math = equation('x');
  const block = nested
    ? node('table_figure', null, [
        node('table_caption', null),
        node('table', { captionEnabled: false }, [
          node('table_row', null, [node('table_cell', null, [math])]),
        ]),
      ])
    : math;
  return node('table_row', { dataId: 'header-row' }, [
    node('table_header', null, [block, figure('header-figure', 'In a header')]),
  ]);
};
const bodyRow = () =>
  node('table_row', null, [node('table_cell', null, [node('paragraph', null)])]);

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
    expect([...numbers.equations.values()].slice(0, 3)).toEqual([
      '(Eq. i)',
      '(Eq. 1.1)',
      '(Eq. 1.2)',
    ]);
  });

  it.each([false, true])(
    'DOCE-PAGINATION-11.9 DOCE-CONTENTS-1.2 draws repeated header numbers with a nested equation table %s',
    (nested) => {
      const table = node('table_figure', null, [
        node('table_caption', null),
        node('table', { dataId: 'table' }, [headerRow(nested), bodyRow(), bodyRow()]),
      ]);
      const following = [equation('y'), figure('last-figure', 'After the table')];
      const canonical = pagesDocument([page([table, ...following])]);
      const split = splitTableFigureWith(true)(
        {
          node: table,
          height: 30,
          marginTop: 0,
          marginBottom: 0,
          measurement: { children: [0, 10, 20].map((top) => ({ top, bottom: top + 10 })) },
        },
        20,
      );
      const tail = split?.tail[0]?.node;
      if (!split || !tail) throw new Error('The table did not split.');
      const continuation = tail.child(1);
      const copy = headerRow(nested);
      const tailWithEditedHeader = tail.type.create(tail.attrs, [
        tail.child(0),
        continuation.type.create(continuation.attrs, [copy, continuation.child(1)]),
      ]);
      const projected = pagesDocument([
        page([split.head.node]),
        page([tailWithEditedHeader, ...following]),
      ]);
      canonical.check();
      projected.check();

      const catalog = catalogDocument(projected, BASE_TEMPLATE);
      expect(catalog.figures?.map(({ number }) => number)).toEqual(['Figure 1', 'Figure 2']);
      const equations = [...objectNumbers(canonical, BASE_TEMPLATE).equations.values()];
      expect(equations).toHaveLength(2);
      expect(catalog.equations?.map(({ number }) => number)).toEqual(equations);
      const caption = copy.child(0).child(1).child(0);
      expect(captionNumbers(projected, BASE_TEMPLATE).labelOf(caption)).toBe('Figure 1 - ');

      const engine = { ...stubEngine(), template: BASE_TEMPLATE };
      const map = createProjectionMap(projected);
      const plugin = engineNumbers({ engine: () => engine, map: () => map });
      const drawn = engineNumbersKey.getState(
        EditorState.create({ doc: projected, plugins: [plugin] }),
      );
      const numbers = drawn
        ?.find()
        .filter(({ from }) => projected.nodeAt(from)?.type.name === 'math_display')
        .sort((left, right) => left.from - right.from)
        .map(({ spec }) => (spec as { number: string }).number);
      expect(numbers).toEqual([equations[0], equations[0], equations[1]]);
    },
  );

  it('DOCE-PAGINATION-11.9 uses each equation’s canonical position in continued columns', () => {
    const columns = (part: number, left: string, right: string) =>
      node('layout_section', { dataId: 'columns', layoutPreset: 'halves', splitPartIndex: part }, [
        node('layout_column', null, [equation(left)]),
        node('layout_column', null, [equation(right)]),
      ]);
    const projected = pagesDocument([
      page([columns(0, 'a', 'c')], { header: [equation('header')] }),
      page([columns(1, 'b', 'd')], { footer: [equation('footer')] }),
    ]);
    const map = createProjectionMap(projected);
    const engine = { ...stubEngine(), template: BASE_TEMPLATE };
    const plugin = engineNumbers({ engine: () => engine, map: () => map });
    const drawn = engineNumbersKey.getState(
      EditorState.create({ doc: projected, plugins: [plugin] }),
    );
    const labels = drawn
      ?.find()
      .sort((a, b) => a.from - b.from)
      .map(({ from, spec }) => [
        projected.nodeAt(from)?.textContent,
        (spec as { number: string }).number,
      ]);
    const numbered = [...objectNumbers(map.canonical, BASE_TEMPLATE).equations.values()];
    expect(numbered).toHaveLength(4);
    expect(labels).toEqual([
      ['a', numbered[0]],
      ['c', numbered[2]],
      ['b', numbered[1]],
      ['d', numbered[3]],
    ]);
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
