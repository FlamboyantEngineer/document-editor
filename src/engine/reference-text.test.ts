import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  BASE_TEMPLATE,
  readDocumentFile,
  type ReferenceBaseline,
  type StoredNode,
  type TemplateFile,
} from '../model/index.js';
import { citationLabel, citationText } from './reference-text.js';
import {
  createReferences,
  insertReference,
  listReferences,
  referenceTargets,
  refreshReferences,
} from './references.js';

const DOCUMENT: ReferenceBaseline = {
  version: 1,
  documentId: 'doc-7',
  numbering: 'PWR-100',
  title: 'Power interface',
  revision: { majorRevision: 'B', minorRevision: null },
  revisionLabel: 'Rev B',
  target: null,
  defaultLabel: 'PWR-100',
};
const target = (kind: string, numbering: string, title: string) => ({
  id: `${kind}-1`,
  kind,
  stable: true,
  numbering,
  title,
  label: kind === 'heading' ? `${numbering} ${title}` : `${numbering} - ${title}`,
});
const external = 'external-document';

const text = (value: string, marks?: StoredNode['marks']): StoredNode => ({
  type: 'text',
  text: value,
  ...(marks ? { marks } : {}),
});

function stateOf(content: StoredNode[], template: TemplateFile = BASE_TEMPLATE) {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content }] },
    documentSchema,
  ).doc;
  return EditorState.create({ doc, plugins: [createReferences({ template: () => template })] });
}

// Selects the text given, or puts the caret in it.
function select(state: EditorState, value: string, length = 0) {
  let from = -1;
  state.doc.descendants((node, pos) => {
    if (from < 0 && node.isText && node.text?.includes(value))
      from = pos + node.text.indexOf(value);
    return from < 0;
  });
  return state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, from + (length ? 0 : 1), from + length)),
  );
}

const textsOf = (state: EditorState) =>
  listReferences(state.doc).map((each) => state.doc.textBetween(each.from, each.to));

describe('citation text', () => {
  it('DOCE-REFERENCES-1.10 reads a citation as the library writes it without a format', () => {
    expect(citationLabel({ refType: external, baseline: DOCUMENT })).toBe(
      'PWR-100 - Power interface',
    );
    expect(citationLabel({ refType: external, baseline: DOCUMENT, includeRevision: true })).toBe(
      'PWR-100 - Power interface Rev B',
    );
    const of = (kind: string, numbering: string, title = '') =>
      citationLabel({
        refType: external,
        baseline: { ...DOCUMENT, target: target(kind, numbering, title) },
      });
    expect(of('heading', '2.1', 'Rails')).toBe('PWR-100 - Power interface § 2.1 Rails');
    expect(of('table', 'Table 2.1', 'Limits')).toBe('PWR-100 - Power interface Table 2.1');
    expect(of('equation', '(2.1)')).toBe('PWR-100 - Power interface Eq. 2.1');
    // A document without a number reads its id; a host's own type its recorded label.
    expect(citationLabel({ refType: external, baseline: { ...DOCUMENT, numbering: '' } })).toBe(
      'doc-7 - Power interface',
    );
    expect(citationLabel({ refType: 'catalogue-entry', baseline: DOCUMENT })).toBe('PWR-100');
  });

  it('DOCE-REFERENCES-1.10 reads a citation as the template formats its type and target', () => {
    const template: TemplateFile = {
      ...BASE_TEMPLATE,
      references: {
        formats: {
          [external]: '[{{doc.numbering}}]',
          [`${external}-figure`]: '{{doc.numbering}}, {{ref.numbering}} {{ref.revision}}',
        },
      },
    };
    expect(citationText({ refType: external, baseline: DOCUMENT }, template)).toBe('[PWR-100]');
    const figure = { ...DOCUMENT, target: target('figure', 'Figure 3', 'Wiring') };
    expect(
      citationText({ refType: external, baseline: figure, includeRevision: true }, template),
    ).toBe('PWR-100, Figure 3 Rev B');
    const heading = { ...DOCUMENT, target: target('heading', '1.', 'Scope') };
    expect(citationText({ refType: external, baseline: heading }, template)).toBe(
      'PWR-100 - Power interface § 1. Scope',
    );
  });

  it('DOCE-REFERENCES-1.10 renders citations again as the template formats them, rewriting only what changed', () => {
    const cited = {
      type: 'reference',
      attrs: { referenceType: external, baseline: JSON.stringify(DOCUMENT), target: 'doc-7' },
    };
    // The citation reads with its document's number bold, which the rewrite keeps.
    const state = stateOf([
      {
        type: 'paragraph',
        content: [
          text('See '),
          text('PWR-100', [{ type: 'bold' }, cited]),
          text(' - old title', [cited]),
          text('.'),
        ],
      },
    ]);
    const template: TemplateFile = {
      ...BASE_TEMPLATE,
      references: { formats: { [external]: '{{doc.numbering}} - {{doc.title}}' } },
    };
    let next = state;
    expect(refreshReferences(template)(state, (tr) => (next = state.apply(tr)))).toBe(true);
    expect(textsOf(next)).toEqual(['PWR-100 - Power interface']);
    const bold = next.schema.marks.strong;
    let boldText = '';
    next.doc.descendants((node) => {
      if (node.isText && bold && bold.isInSet(node.marks)) boldText += node.text ?? '';
    });
    expect(boldText).toBe('PWR-100');
    // Nothing more changes.
    expect(refreshReferences(template)(next)).toBe(false);
  });

  it('DOCE-REFERENCES-1.10 renders a pasted citation as the template formats it', () => {
    const template: TemplateFile = {
      ...BASE_TEMPLATE,
      references: { formats: { [external]: '<{{doc.numbering}}>' } },
    };
    const state = stateOf([{ type: 'paragraph', content: [text('Pasted: ')] }], template);
    const mark = state.schema.marks.reference?.create({
      refType: external,
      referenceBaseline: JSON.stringify(DOCUMENT),
    });
    const tr = state.tr.insert(
      state.doc.content.size - 1,
      state.schema.text('stale', mark ? [mark] : []),
    );
    const next = state.apply(tr.setMeta('uiEvent', 'paste'));
    expect(textsOf(next)).toEqual(['<PWR-100>']);
    // Text a host writes itself is left as it is.
    const typed = state.apply(
      state.tr.insert(state.doc.content.size - 1, state.schema.text('kept', mark ? [mark] : [])),
    );
    expect(textsOf(typed)).toEqual(['kept']);
  });

  it("DOCE-REFERENCES-1.2 changes a reference wherever it is, and records a host type's attributes", () => {
    const state = stateOf([
      {
        type: 'heading',
        attrs: { id: 'h1', level: 1 },
        content: [text('Old', [{ type: 'reference', attrs: { referenceType: external } }])],
      },
    ]);
    const inHeading = select(state, 'Old');
    const source = {
      kind: 'external' as const,
      refType: 'catalogue-entry',
      baseline: DOCUMENT,
      text: 'STD-12 Rev C',
      attrs: { libraryRevisionId: 'std-12@C', libraryLabel: 'STD-12 Rev C' },
    };
    let next = inHeading;
    expect(insertReference(source)(inHeading, (tr) => (next = inHeading.apply(tr)))).toBe(true);
    const [reference] = listReferences(next.doc);
    expect(reference?.mark.attrs).toMatchObject({
      refType: 'catalogue-entry',
      libraryRevisionId: 'std-12@C',
      libraryLabel: 'STD-12 Rev C',
    });
    // A new reference still goes in body text only.
    const empty = stateOf([
      { type: 'heading', attrs: { id: 'h1', level: 1 }, content: [text('Title')] },
    ]);
    expect(insertReference(source)(select(empty, 'Title', 5))).toBe(false);
  });

  it('DOCE-REFERENCES-1.1 names an equation by its number and linked code by its source', () => {
    const state = stateOf([
      { type: 'math_display', attrs: { id: 'eq1' }, content: [text('E = mc^2')] },
      { type: 'linked_code_block', attrs: { id: 'lc1', url: 'https://example.com/src/power.ts' } },
    ]);
    const targets = referenceTargets(state.doc, BASE_TEMPLATE);
    const equation = targets.find((each) => each.kind === 'equation');
    expect(equation?.title).toBe('');
    expect(equation?.label).toBe(equation?.number);
    const code = targets.find((each) => each.kind === 'codeblock');
    expect(code?.title).toBe('power.ts');
    expect(code?.label).toBe(`${code?.number ?? ''} - power.ts`);
  });
});
