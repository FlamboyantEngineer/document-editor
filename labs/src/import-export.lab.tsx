// Documents in and out of the stored format, as a host's upload and download would run them, all
// in the page: a word processing document (`readDocx`), Markdown (`readMarkdown`) or HTML, pasted
// or from Word (`readHtmlContent`), read and composed into a template's section
// (`composeDocumentFile`), with the reader's warnings; and the open document written as Markdown
// (`writeMarkdown`, with its title, front matter, comments and suggestions), as a word processing
// document (`writeDocx`, with its comment threads), as HTML (`writeHtml`) or in the stored format,
// whole or one part of it (`selectStoredContent`). The reading options and the template tools are
// in `import-export-options.tsx`; File > Export's PDF entry prints through a print service mimicked
// in the page (`lab-print-service.ts`).

import { EditorState } from 'prosemirror-state';
import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DocumentEditor } from '../../src/components/index.js';
import {
  assignElementIds,
  createDocumentEditing,
  createElementId,
} from '../../src/engine/index.js';
import type { CommentThread } from '../../src/host/index.js';
import {
  composeDocumentFile,
  DEFAULT_ZIP_LIMITS,
  type ImportWarning,
  readDocx,
  readMarkdown,
  selectStoredContent,
} from '../../src/import/index.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  createDocumentSchema,
  type DocumentFile,
  findAppendixSection,
  readDocumentFile,
  readHtmlContent,
  resolveTemplateFile,
  type SuggestionsMode,
  type TemplateFile,
  upgradeDocumentFile,
  writeDocumentFile,
  writeDocx,
  writeHtml,
  writeMarkdown,
} from '../../src/model/index.js';
import {
  DEFAULT_READ_OPTIONS,
  ReadOptionControls,
  type ReadOptions,
  TemplateTools,
  UPLOAD_PLACEHOLDER,
} from './import-export-options.js';
import { chapter, heading, text, variable } from './lab-document.js';
import { labPdfExport } from './lab-print-service.js';
import { markReadyWhenSettled } from './lab-ready.js';
import { sampleWordDocument } from './lab-word-sample.js';
import { LAB_FONTS } from './served-fonts.js';

// A template with a locked cover, the body that takes what is read, and an appendix.
const LAB_TEMPLATE: TemplateFile = {
  formatVersion: 1,
  id: 'import-export',
  parent: BASE_TEMPLATE_ID,
  sections: [
    {
      name: 'cover',
      label: 'Cover',
      required: true,
      editable: false,
      content: [
        {
          type: 'paragraph',
          content: [text('Title: '), variable('document.title')],
        },
      ],
    },
    {
      name: 'body',
      label: 'Body',
      required: true,
      // A list of the document's tables, by the host's own list token.
      content: [{ type: 'paragraph', content: [text('{{list_of_limits}}')] }],
    },
    { name: 'appendix', label: 'Appendix', insertable: true },
  ],
};

const TEMPLATE = resolveTemplateFile(LAB_TEMPLATE, {
  loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
  baseTemplateId: BASE_TEMPLATE_ID,
});

const SCHEMA = createDocumentSchema();

const SAMPLE_MARKDOWN = [
  '---',
  'author: Ada Lovelace',
  '---',
  '# Imported notes',
  '',
  'A paragraph with **bold**, *italic*, `code` and a [link](https://example.com "Example").[^limits]',
  '',
  '- First item',
  '- Second item',
  '',
  '| Quantity | Limit |',
  '| --- | --- |',
  '| Voltage | 28 V |',
  '',
  '<div>Raw markup is left out.</div>',
  '',
  '[^limits]: The limits apply at sea level.',
].join('\n');

const SAMPLE_HTML = [
  '<h2>Pasted from a web page</h2>',
  '<p>A <strong>bold</strong> claim, a <em>quiet</em> one and a <a href="https://example.com">link</a>.</p>',
  '<ol><li>One</li><li>Two</li></ol>',
].join('');

// The open document at first: a chapter in the body with a suggestion and a comment, and an appendix.
function sampleFile(): DocumentFile {
  return {
    formatVersion: 1,
    template: { id: TEMPLATE.id, revision: null },
    sections: [
      { name: 'cover', editable: false, content: LAB_TEMPLATE.sections?.[0]?.content ?? [] },
      {
        name: 'body',
        content: [
          ...chapter('Interfaces'),
          {
            type: 'paragraph',
            content: [
              text('The log keeps '),
              {
                ...text('every'),
                marks: [{ type: 'deletion', attrs: { id: 'a1b2c3d4', author: 'grace' } }],
              },
              {
                ...text('each'),
                marks: [{ type: 'insertion', attrs: { id: 'a1b2c3d4', author: 'grace' } }],
              },
              text(' report, '),
              {
                ...text('reviewed weekly'),
                marks: [{ type: 'comment', attrs: { thread: 'c0ffee01', state: 'open' } }],
              },
              text('.'),
            ],
          },
        ],
      },
      { name: 'appendix', content: [heading(1, 'Glossary'), ...chapter('Terms').slice(1)] },
    ],
  };
}

const SAMPLE_THREADS: CommentThread[] = [
  {
    id: 'c0ffee01',
    state: 'open',
    quote: 'reviewed weekly',
    suggestion: null,
    entries: [
      {
        id: 'c0ffee01-1',
        author: 'grace',
        text: 'Weekly or monthly?',
        createdAt: '2026-01-05T09:30:00Z',
      },
    ],
  },
];

const PEOPLE: Record<string, string> = { grace: 'Grace Hopper', ada: 'Ada Lovelace' };

function stateOf(file: DocumentFile): EditorState {
  const state = EditorState.create({
    doc: readDocumentFile(file, SCHEMA, { unknown: 'keep' }).doc,
    plugins: createDocumentEditing(SCHEMA, { template: () => TEMPLATE, author: () => 'ada' }),
  });
  const tr = state.tr;
  assignElementIds(tr, {});
  return state.apply(tr.setMeta('addToHistory', false));
}

interface Opened {
  readonly state: EditorState;
  readonly threads: readonly CommentThread[];
  readonly report: string;
  readonly warnings: readonly ImportWarning[];
  readonly revision: number;
}

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

type Part = 'whole' | 'body' | 'appendix';

// The mimicked print service's frame, and whether the lab has made it fail.
const PRINT_SERVICE: { frame: HTMLIFrameElement | null; failing: boolean } = {
  frame: null,
  failing: false,
};

function Lab() {
  const [opened, setOpened] = useState<Opened>(() => ({
    state: stateOf(sampleFile()),
    threads: SAMPLE_THREADS,
    report: 'The sample document',
    warnings: [],
    revision: 0,
  }));
  const [section, setSection] = useState('body');
  const [smallArchives, setSmallArchives] = useState(false);
  const [html, setHtml] = useState(SAMPLE_HTML);
  const [suggestions, setSuggestions] = useState<SuggestionsMode>('accepted');
  const [title, setTitle] = useState('Interface control document');
  const [frontMatter, setFrontMatter] = useState(true);
  const [listSuggestions, setListSuggestions] = useState(true);
  const [withComments, setWithComments] = useState(true);
  const [part, setPart] = useState<Part>('whole');
  const [written, setWritten] = useState('');
  const [reading, setReading] = useState<ReadOptions>(DEFAULT_READ_OPTIONS);
  const [printFails, setPrintFails] = useState(false);
  const [exported, setExported] = useState('');
  const [notice, setNotice] = useState('');
  const feedback = useMemo(
    () => ({
      notify: ({ tone, text: message }: { tone: string; text: string }) =>
        setNotice(`${tone}: ${message}`),
    }),
    [],
  );
  const [exports] = useState(() => ({
    entries: [
      labPdfExport({
        frame: () => PRINT_SERVICE.frame,
        failing: () => PRINT_SERVICE.failing,
        saved: (file, pages, failedImages) =>
          setExported(
            `Saved ${file.name} (${file.type}, ${String(file.data.length)} bytes, ${String(pages)} pages, ${String(failedImages.length)} images failed)`,
          ),
      }),
    ],
  }));
  const values = useMemo(
    () => ({ variable: (key: string) => (key === 'document.title' ? title : null) }),
    [title],
  );

  // A file read elsewhere, composed into the template's section the lab picks.
  const open = (
    file: DocumentFile,
    report: string,
    warnings: readonly ImportWarning[] = [],
    threads: readonly CommentThread[] = [],
  ) => {
    const composed = composeDocumentFile(file, {
      template: TEMPLATE,
      section,
      newId: createElementId,
      author: 'ada',
      titleVariables: reading.leaveOutTitle ? ['document.title'] : [],
      tableInset: reading.tableInset,
    });
    setOpened((previous) => ({
      state: stateOf(composed),
      threads,
      report,
      warnings,
      revision: previous.revision + 1,
    }));
  };
  const fail = (report: string) => setOpened((previous) => ({ ...previous, report, warnings: [] }));
  // A stored document opened as it is, without composing it into the template again.
  const openAsIs = (file: DocumentFile, report: string) =>
    setOpened((previous) => ({
      state: stateOf(file),
      threads: [],
      report,
      warnings: [],
      revision: previous.revision + 1,
    }));

  const readWord = async (bytes: Uint8Array, name: string) => {
    const read = await readDocx(bytes, {
      template: TEMPLATE,
      limits: smallArchives ? { files: 5 } : DEFAULT_ZIP_LIMITS,
      textCaptions: reading.textCaptions,
      appendixSection: reading.appendices
        ? (findAppendixSection(TEMPLATE, section) ?? undefined)
        : undefined,
      imageSource: reading.hostImages ? () => UPLOAD_PLACEHOLDER : undefined,
      review: reading.keepReview ? 'keep' : 'accept',
    });
    if (!read.ok) {
      fail(`${name} could not be read: ${read.failure} (${read.message})`);
      return;
    }
    const pages = read.pages.filter(Boolean).length;
    open(
      read.file,
      `${name}: ${String(read.comments.length)} comment threads, ${String(read.images.length)} images, ${String(pages)} section pages`,
      read.warnings,
      read.comments,
    );
  };
  const readFile = async (file: File) => {
    const name = file.name.toLowerCase();
    if (name.endsWith('.docx')) {
      await readWord(new Uint8Array(await file.arrayBuffer()), file.name);
    } else if (name.endsWith('.md') || name.endsWith('.markdown')) {
      const read = readMarkdown(await file.text());
      open(read.file, file.name, read.warnings);
    } else if (name.endsWith('.html') || name.endsWith('.htm')) {
      open(
        {
          formatVersion: 1,
          sections: [{ name: null, content: readHtmlContent(await file.text(), SCHEMA, document) }],
        },
        file.name,
      );
    } else if (name.endsWith('.json')) {
      try {
        const stored = upgradeDocumentFile(JSON.parse(await file.text())) as DocumentFile;
        open(stored, file.name);
      } catch {
        fail(`${file.name} is not a stored document`);
      }
    } else {
      fail(`${file.name}: open a .docx, .md, .html or .json file`);
    }
  };

  // The open document in the stored format, whole or the part picked.
  const current = (): DocumentFile => {
    const file = writeDocumentFile(opened.state.doc, { template: TEMPLATE });
    if (part === 'whole') return file;
    const content = selectStoredContent(file, { section: part }) ?? [];
    return { formatVersion: 1, sections: [{ name: null, content }] };
  };
  const markdown = () =>
    writeMarkdown(current(), {
      suggestions,
      values,
      title: title || null,
      frontMatter: frontMatter ? { author: 'Ada Lovelace', status: 'Draft' } : null,
      threads: withComments ? opened.threads : [],
      suggestionList: listSuggestions,
      person: (id) => PEOPLE[id],
    });
  const word = () =>
    writeDocx(current(), {
      template: TEMPLATE,
      suggestions,
      values,
      comments: withComments
        ? { threads: opened.threads, authorName: (id) => PEOPLE[id] ?? null }
        : undefined,
    });

  return (
    <>
      <div className="lab-controls">
        <fieldset>
          <legend>Import</legend>
          <label>
            Open a file{' '}
            <input
              type="file"
              accept=".docx,.md,.markdown,.html,.htm,.json"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void readFile(file);
              }}
            />
          </label>{' '}
          <label>
            Into the section{' '}
            <select value={section} onChange={(event) => setSection(event.currentTarget.value)}>
              <option value="body">Body</option>
              <option value="appendix">Appendix</option>
            </select>
          </label>{' '}
          <label>
            <input
              type="checkbox"
              checked={smallArchives}
              onChange={(event) => setSmallArchives(event.currentTarget.checked)}
            />{' '}
            Allow only 5 files in an archive
          </label>
          <ReadOptionControls options={reading} onChange={setReading} />
          <div>
            <button
              type="button"
              onClick={() => void readWord(sampleWordDocument(), 'The sample Word document')}
            >
              Read the sample Word document
            </button>{' '}
            <button
              type="button"
              onClick={() => {
                const read = readMarkdown(SAMPLE_MARKDOWN);
                open(read.file, 'The sample Markdown', read.warnings);
              }}
            >
              Read the sample Markdown
            </button>{' '}
            <button
              type="button"
              onClick={() => void readWord(word(), 'The document written as Word')}
            >
              Write as Word and read it back
            </button>{' '}
            <button
              type="button"
              onClick={() => open(sampleFile(), 'The sample document', [], SAMPLE_THREADS)}
            >
              Reopen the sample
            </button>
          </div>
          <label>
            HTML to read{' '}
            <textarea
              rows={3}
              cols={60}
              value={html}
              onChange={(event) => setHtml(event.currentTarget.value)}
            />
          </label>{' '}
          <button
            type="button"
            onClick={() =>
              open(
                {
                  formatVersion: 1,
                  sections: [{ name: null, content: readHtmlContent(html, SCHEMA, document) }],
                },
                'The pasted HTML',
              )
            }
          >
            Read the HTML
          </button>
          <output aria-label="Import report">{opened.report}</output>
          <ul aria-label="Import warnings">
            {opened.warnings.map((warning) => (
              <li key={`${warning.code}-${warning.detail}`}>
                {warning.code}
                {warning.detail ? `: ${warning.detail}` : ''} ({warning.count})
              </li>
            ))}
          </ul>
        </fieldset>
        <TemplateTools
          state={opened.state}
          schema={SCHEMA}
          template={TEMPLATE}
          html={html}
          onOpen={openAsIs}
          onState={(state, report) => setOpened((previous) => ({ ...previous, state, report }))}
          onReport={(report) => setOpened((previous) => ({ ...previous, report }))}
        />
        <fieldset>
          <legend>Export</legend>
          <label>
            Part to export{' '}
            <select value={part} onChange={(event) => setPart(event.currentTarget.value as Part)}>
              <option value="whole">The whole document</option>
              <option value="body">The body section</option>
              <option value="appendix">The appendix section</option>
            </select>
          </label>{' '}
          <label>
            Suggestions in the export{' '}
            <select
              value={suggestions}
              onChange={(event) => setSuggestions(event.currentTarget.value as SuggestionsMode)}
            >
              <option value="accepted">As if accepted</option>
              <option value="rejected">As if rejected</option>
            </select>
          </label>{' '}
          <label>
            Title <input value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
          </label>{' '}
          <label>
            <input
              type="checkbox"
              checked={frontMatter}
              onChange={(event) => setFrontMatter(event.currentTarget.checked)}
            />{' '}
            Front matter
          </label>{' '}
          <label>
            <input
              type="checkbox"
              checked={withComments}
              onChange={(event) => setWithComments(event.currentTarget.checked)}
            />{' '}
            Comments
          </label>{' '}
          <label>
            <input
              type="checkbox"
              checked={listSuggestions}
              onChange={(event) => setListSuggestions(event.currentTarget.checked)}
            />{' '}
            List the suggestions
          </label>
          <div>
            <button type="button" onClick={() => setWritten(markdown())}>
              Write Markdown
            </button>{' '}
            <button type="button" onClick={() => setWritten(writeHtml(opened.state.doc, document))}>
              Write HTML
            </button>{' '}
            <button type="button" onClick={() => setWritten(JSON.stringify(current(), null, 2))}>
              Write the stored format
            </button>{' '}
            <button
              type="button"
              onClick={() => download('document.md', markdown(), 'text/markdown')}
            >
              Download Markdown
            </button>{' '}
            <button
              type="button"
              onClick={() => download('document.docx', new Uint8Array(word()), DOCX_TYPE)}
            >
              Download Word document
            </button>
          </div>
          <section aria-label="Written document">
            <pre tabIndex={0}>{written}</pre>
          </section>
        </fieldset>
        <fieldset>
          <legend>Print service</legend>
          <label>
            <input
              type="checkbox"
              checked={printFails}
              onChange={(event) => {
                PRINT_SERVICE.failing = event.currentTarget.checked;
                setPrintFails(event.currentTarget.checked);
              }}
            />{' '}
            The print service fails
          </label>{' '}
          <button
            type="button"
            onClick={() => {
              setExported('');
              setNotice('');
            }}
          >
            Clear the export
          </button>{' '}
          <output aria-label="PDF export">{exported}</output>{' '}
          <output aria-label="Export feedback">{notice}</output>
          <iframe
            ref={(frame) => {
              PRINT_SERVICE.frame = frame;
            }}
            title="Print service page"
          />
        </fieldset>
      </div>
      <DocumentEditor
        fonts={LAB_FONTS}
        key={opened.revision}
        state={opened.state}
        onStateChange={(update) =>
          setOpened((previous) => ({
            ...previous,
            state: typeof update === 'function' ? update(previous.state) : update,
          }))
        }
        template={TEMPLATE}
        author="ada"
        toolbar
        exports={exports}
        feedback={feedback}
        aria-label="Imported document"
      />
    </>
  );
}

const container = document.querySelector('#lab-editor');
if (container) {
  createRoot(container).render(<Lab />);
  markReadyWhenSettled();
}
