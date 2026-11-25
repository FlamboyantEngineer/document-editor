// The automation lab's static render and server helpers, run on the stored document without an
// editor: the document as a standalone page (`renderPrintPage`), its suggestions shown as the
// markup picked and its images from the address a print server reaches (`resolveImage`), shown in
// a frame; its content as HTML text with no DOM (`writeStaticHtml`); the counters in effect at each
// heading (`numberingCountersAt`) and the caption line each table takes (`tableCaptionLineStyle`);
// and the checks a server makes on what it stores: Roman numerals (`parseRoman`), glossary entries
// (`isGlossaryEntryId`, `normalizeGlossaryInput`) and caption lines (`formatCaptionLineText`).

import type { Schema } from 'prosemirror-model';
import { useState } from 'react';
import { renderPrintPage, writeStaticHtml } from '../../src/document/index.js';
import type { StoredDocument } from '../../src/host/index.js';
import {
  type DocumentFile,
  formatCaptionLineText,
  isGlossaryEntryId,
  normalizeGlossaryInput,
  numberingCountersAt,
  parseRoman,
  readDocumentFile,
  tableCaptionLineStyle,
  type TemplateFile,
} from '../../src/model/index.js';

/** What the render and the helpers work on and how they report. */
export interface RenderToolsProps {
  readonly stored: StoredDocument | null;
  readonly schema: Schema;
  readonly template: TemplateFile;
  /** The address a print server reaches for each image the document shows, or null to keep it. */
  readonly printImage: (src: string) => string | null;
  /** Shows what a tool read. */
  show(output: unknown): void;
}

type Markup = 'all' | 'final' | 'original';

// Runs a check that throws on what it refuses, showing the refusal as its result.
function checked(run: () => unknown): unknown {
  try {
    return run();
  } catch (error) {
    return { refused: error instanceof Error ? error.message : String(error) };
  }
}

/** The static render and the server helpers. */
export function RenderTools({ stored, schema, template, printImage, show }: RenderToolsProps) {
  const [markup, setMarkup] = useState<Markup>('all');
  const [serverImages, setServerImages] = useState(true);
  const [page, setPage] = useState('');
  const [roman, setRoman] = useState('xiv');
  const [abbreviation, setAbbreviation] = useState(' PSU ');
  const [expansion, setExpansion] = useState('Power supply unit');
  const [caption, setCaption] = useState('Limits  at   sea level');
  const read = (reader: (file: DocumentFile) => unknown) => {
    if (stored) show(reader(stored.content));
  };
  const docOf = (file: DocumentFile) => readDocumentFile(file, schema, { unknown: 'keep' }).doc;
  const render = () => {
    if (!stored) return;
    setPage(
      renderPrintPage(stored.content, template, {
        title: 'Static render',
        markup,
        resolveImage: serverImages ? printImage : undefined,
      }),
    );
  };
  const counters = (file: DocumentFile) => {
    const doc = docOf(file);
    const at: Record<string, unknown> = {};
    doc.descendants((node, pos) => {
      if (node.type.name === 'heading')
        at[node.textContent] = numberingCountersAt(doc, template, pos);
      return !node.isTextblock;
    });
    return at;
  };
  const captionLines = (file: DocumentFile) => {
    const lines: unknown[] = [];
    docOf(file).descendants((node) => {
      if (node.type.name === 'table') lines.push(tableCaptionLineStyle(node));
      return node.type.name !== 'table';
    });
    return lines;
  };
  return (
    <>
      <fieldset>
        <legend>Static render</legend>
        <label>
          Suggestions shown{' '}
          <select
            value={markup}
            onChange={(event) => setMarkup(event.currentTarget.value as Markup)}
          >
            <option value="all">With their markup</option>
            <option value="final">As if accepted</option>
            <option value="original">As if rejected</option>
          </select>
        </label>{' '}
        <label>
          <input
            type="checkbox"
            checked={serverImages}
            onChange={(event) => setServerImages(event.currentTarget.checked)}
          />{' '}
          Images from the print server
        </label>{' '}
        <button type="button" onClick={render}>
          Render the static page
        </button>{' '}
        <button type="button" onClick={() => read((file) => writeStaticHtml(docOf(file)))}>
          Write static HTML
        </button>{' '}
        <button type="button" onClick={() => read(counters)}>
          Counters at each heading
        </button>{' '}
        <button type="button" onClick={() => read(captionLines)}>
          Caption line of each table
        </button>
        {page ? <iframe title="Static render" srcDoc={page} /> : null}
      </fieldset>
      <fieldset>
        <legend>Server checks</legend>
        <label>
          Roman numeral{' '}
          <input value={roman} onChange={(event) => setRoman(event.currentTarget.value)} />
        </label>{' '}
        <button type="button" onClick={() => show({ value: parseRoman(roman) })}>
          Read the numeral
        </button>
        <div>
          <label>
            Abbreviation{' '}
            <input
              value={abbreviation}
              onChange={(event) => setAbbreviation(event.currentTarget.value)}
            />
          </label>{' '}
          <label>
            Expansion{' '}
            <input
              value={expansion}
              onChange={(event) => setExpansion(event.currentTarget.value)}
            />
          </label>{' '}
          <button
            type="button"
            onClick={() =>
              show({
                isEntryId: isGlossaryEntryId(abbreviation.trim()),
                entry: checked(() => normalizeGlossaryInput({ abbreviation, expansion })),
              })
            }
          >
            Check the glossary entry
          </button>
        </div>
        <div>
          <label>
            Caption text{' '}
            <input value={caption} onChange={(event) => setCaption(event.currentTarget.value)} />
          </label>{' '}
          <button
            type="button"
            onClick={() =>
              show(
                formatCaptionLineText({
                  elementName: 'Table',
                  numbering: '1.1',
                  captionText: caption,
                  continuedSuffix: '(continued)',
                }),
              )
            }
          >
            Write the caption line
          </button>
        </div>
      </fieldset>
    </>
  );
}
