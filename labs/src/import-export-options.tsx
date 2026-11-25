// The import and export lab's reading options and template tools: how a word processing document
// is read (`textCaptions`, `appendixSection` from `findAppendixSection`, `imageSource` as a host's
// upload placeholder, `review`) and composed into the template (`titleVariables`, `tableInset`);
// and, on the open document, a new document of the template (`createDocumentFile`, with a host's
// own `contentsTokens`), HTML read as a whole document (`readHtml`), a stored file upgraded and
// read (`upgradeDocumentFile`), the drift from the template (`templateSectionDrift`) and the empty
// appendices taken out (`removeEmptyTemplateSections`).

import type { Schema } from 'prosemirror-model';
import type { Command, EditorState } from 'prosemirror-state';
import { useState } from 'react';
import {
  createElementId,
  insertTemplateSection,
  removeEmptyTemplateSections,
  templateSectionDrift,
} from '../../src/engine/index.js';
import {
  createDocumentFile,
  type DocumentFile,
  readDocumentFile,
  readHtml,
  type TemplateFile,
  upgradeDocumentFile,
  writeDocumentFile,
} from '../../src/model/index.js';

/** How the lab reads a word processing document and composes what it reads. */
export interface ReadOptions {
  readonly textCaptions: boolean;
  readonly appendices: boolean;
  readonly hostImages: boolean;
  readonly keepReview: boolean;
  readonly leaveOutTitle: boolean;
  readonly tableInset: number;
}

export const DEFAULT_READ_OPTIONS: ReadOptions = {
  textCaptions: true,
  appendices: true,
  hostImages: false,
  keepReview: true,
  leaveOutTitle: true,
  tableInset: 0,
};

/** The host's own list token, besides the library's, and the contents kind it stands for. */
export const LAB_CONTENTS_TOKENS: Readonly<Record<string, string>> = {
  table_of_contents: 'toc',
  list_of_limits: 'tables',
};

/** The image a host shows for an image it is still uploading. */
export const UPLOAD_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="48"><rect width="96" height="48" fill="#94a3b8"/></svg>')}`;

const OPTION_LABELS: Readonly<Record<keyof Omit<ReadOptions, 'tableInset'>, string>> = {
  textCaptions: 'Read typed captions',
  appendices: 'Appendices into the appendix section',
  hostImages: 'Images as upload placeholders',
  keepReview: 'Keep tracked changes and comments',
  leaveOutTitle: 'Leave out a title the cover shows',
};

/** The controls of the reading options. */
export function ReadOptionControls({
  options,
  onChange,
}: {
  options: ReadOptions;
  onChange: (options: ReadOptions) => void;
}) {
  return (
    <div>
      {(Object.keys(OPTION_LABELS) as (keyof typeof OPTION_LABELS)[]).map((key) => (
        <label key={key}>
          <input
            type="checkbox"
            checked={options[key]}
            onChange={(event) => onChange({ ...options, [key]: event.currentTarget.checked })}
          />{' '}
          {OPTION_LABELS[key]}{' '}
        </label>
      ))}
      <label>
        Table inset (px){' '}
        <input
          type="number"
          min={0}
          value={options.tableInset}
          onChange={(event) =>
            onChange({ ...options, tableInset: Number(event.currentTarget.value) })
          }
        />
      </label>
    </div>
  );
}

const OLD_FILE = JSON.stringify(
  {
    formatVersion: 1,
    sections: [
      { content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Kept as stored.' }] }] },
    ],
  },
  null,
  2,
);

/** What the template tools work on and how they report. */
export interface TemplateToolsProps {
  readonly state: EditorState;
  readonly schema: Schema;
  readonly template: TemplateFile;
  readonly html: string;
  /** Opens a stored document as it is, replacing the open one. */
  onOpen(file: DocumentFile, report: string): void;
  /** Replaces the open document's state. */
  onState(state: EditorState, report: string): void;
  /** Reports what a tool found. */
  onReport(report: string): void;
}

/** The tools on the open document and the template. */
export function TemplateTools(props: TemplateToolsProps) {
  const { state, schema, template, html, onOpen, onState, onReport } = props;
  const [stored, setStored] = useState(OLD_FILE);
  const readStored = () => {
    try {
      const upgraded = upgradeDocumentFile(JSON.parse(stored));
      const { doc } = readDocumentFile(upgraded, schema);
      onOpen(writeDocumentFile(doc, { template }), 'The stored file, upgraded');
    } catch (error) {
      onReport(
        `The stored file was refused: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  // Runs a section command on the open document, reporting what it did or that it was refused.
  const runCommand = (command: Command, done: string, refused: string) => {
    let next: EditorState | null = null;
    const ran = command(state, (tr) => {
      next = state.apply(tr);
    });
    if (ran && next) onState(next, done);
    else onReport(refused);
  };
  return (
    <fieldset>
      <legend>Template documents</legend>
      <button
        type="button"
        onClick={() =>
          onOpen(
            createDocumentFile({
              template,
              newId: createElementId,
              author: 'ada',
              schema,
              contentsTokens: LAB_CONTENTS_TOKENS,
            }),
            'A new document of the template',
          )
        }
      >
        New document from the template
      </button>{' '}
      <button
        type="button"
        onClick={() =>
          onOpen(
            writeDocumentFile(readHtml(html, schema, document), { template }),
            'The HTML as a document',
          )
        }
      >
        Read as a whole HTML document
      </button>{' '}
      <button
        type="button"
        onClick={() =>
          onReport(
            `Drift: ${JSON.stringify(templateSectionDrift(state.doc, template, { contentsTokens: LAB_CONTENTS_TOKENS }))}`,
          )
        }
      >
        List the drift from the template
      </button>{' '}
      <button
        type="button"
        onClick={() =>
          runCommand(
            insertTemplateSection(template, 'appendix'),
            'Added an empty appendix',
            'The document has its appendix already',
          )
        }
      >
        Add an empty appendix
      </button>{' '}
      <button
        type="button"
        onClick={() =>
          runCommand(
            removeEmptyTemplateSections(template),
            'Took out the empty appendices',
            'No empty appendix to take out',
          )
        }
      >
        Take out empty appendices
      </button>
      <div>
        <label>
          Stored file to upgrade{' '}
          <textarea
            rows={4}
            cols={60}
            value={stored}
            onChange={(event) => setStored(event.currentTarget.value)}
          />
        </label>{' '}
        <button type="button" onClick={readStored}>
          Upgrade and read the stored file
        </button>
      </div>
    </fieldset>
  );
}
