// Automation on stored documents, as a host's server runs it for an agent, mimicked in the page
// over the in-memory host's store: the agent reads the stored document (`describeDocument`), sends
// a batch of edits against the revision it read (`applyStoredEdits`, checked by the schemas in
// `AUTOMATION_SCHEMAS`), directly or as suggestions, and the host saves the result and keeps the
// comment threads the batch opened. Another writer saving first makes the batch a conflict. The
// host also runs the document's scripts (`runStoredScripts`), decides its suggestions
// (`decideSuggestions`) and lists what changed since the save before (`compareVersions`). The
// stored-file readers answer a server's questions without an editor: the element with an id, the
// text, citations, reference targets, required sections and thread anchors; and the host moves the
// document to a stricter template or decides one suggestion on the stored file.

import { EditorState } from 'prosemirror-state';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DocumentEditor } from '../../src/components/index.js';
import {
  type Actor,
  applyStoredEdits,
  AUTOMATION_SCHEMAS,
  type AutomationEdit,
  compareVersions,
  decideStoredSuggestions,
  decideSuggestions,
  describeDocument,
  type DocumentDescription,
  documentTargets,
  findStoredElement,
  listSuggestions,
  replaceTemplate,
  runStoredScripts,
  storedCitations,
  storedDocumentText,
  threadAnchors,
  validateRequiredSections,
} from '../../src/document/index.js';
import { assignElementIds, createDocumentEditing } from '../../src/engine/index.js';
import { createMemoryHost, type StoredDocument } from '../../src/host/index.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  createDocumentSchema,
  type DocumentFile,
  readDocumentFile,
  resolveTemplateFile,
  type TemplateFile,
  writeDocumentFile,
} from '../../src/model/index.js';
import { chapter, text } from './lab-document.js';
import { markReadyWhenSettled } from './lab-ready.js';
import { checkLabScript, LAB_SCRIPT_VOCABULARY, runLabScript } from './lab-scripts.js';

const DOCUMENT_ID = 'spec';

// A template whose cover no writer or agent may edit.
const LAB_TEMPLATE: TemplateFile = {
  formatVersion: 1,
  id: 'automation',
  parent: BASE_TEMPLATE_ID,
  sections: [
    {
      name: 'cover',
      label: 'Cover',
      required: true,
      editable: false,
      content: [{ type: 'paragraph', content: [text('Issued by the systems group.')] }],
    },
    { name: 'body', label: 'Body', required: true },
  ],
};

const TEMPLATE = resolveTemplateFile(LAB_TEMPLATE, {
  loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
  baseTemplateId: BASE_TEMPLATE_ID,
});

// A stricter revision of the template, which also requires an appendix.
const STRICT_TEMPLATE = resolveTemplateFile(
  {
    ...LAB_TEMPLATE,
    id: 'automation-strict',
    sections: [
      ...(LAB_TEMPLATE.sections ?? []),
      { name: 'appendix', label: 'Appendix', required: true },
    ],
  },
  {
    loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
    baseTemplateId: BASE_TEMPLATE_ID,
  },
);

const SCHEMA = createDocumentSchema();

const read = (file: DocumentFile) => readDocumentFile(file, SCHEMA, { unknown: 'keep' }).doc;

// The stored document at first, with element ids as the editor gives them.
function initialContent(): DocumentFile {
  const file: DocumentFile = {
    formatVersion: 1,
    template: { id: TEMPLATE.id, revision: null },
    sections: [
      { name: 'cover', editable: false, content: LAB_TEMPLATE.sections?.[0]?.content ?? [] },
      {
        name: 'body',
        content: [
          ...chapter('Scope'),
          ...chapter('Timing'),
          {
            type: 'script',
            attrs: { source: 'render.paragraph(`Status: ${document.blocks} blocks.`)' },
          },
        ],
      },
    ],
  };
  const state = EditorState.create({ doc: read(file) });
  const tr = state.tr;
  assignElementIds(tr, {});
  const stored = writeDocumentFile(tr.doc, { template: TEMPLATE });
  // A citation of the Timing heading, which the readers list.
  const body = stored.sections[1]?.content ?? [];
  const timing = body.find(
    (node) => node.type === 'heading' && node.content?.[0]?.text === 'Timing',
  );
  const target = typeof timing?.attrs?.id === 'string' ? timing.attrs.id : null;
  if (target) {
    body.push({
      type: 'paragraph',
      content: [
        text('See '),
        { type: 'text', text: 'Timing', marks: [{ type: 'reference', attrs: { target } }] },
      ],
    });
  }
  return stored;
}

const HOST = createMemoryHost({
  person: { id: 'ada', name: 'Ada Lovelace' },
  documents: [{ id: DOCUMENT_ID, content: initialContent() }],
  scripts: runLabScript,
  scriptVocabulary: LAB_SCRIPT_VOCABULARY,
  checkScript: checkLabScript,
});

const ACTORS: Record<Actor['kind'], Actor> = {
  agent: { id: 'lab-agent', kind: 'agent', session: 'lab-session' },
  human: { id: 'ada', kind: 'human' },
  system: { id: 'lab-system', kind: 'system' },
};

// The example batches, made from the description the agent read.
const EXAMPLES: Record<string, (description: DocumentDescription) => AutomationEdit[]> = {
  'Reword the first paragraph': ({ blocks }) => {
    const first = blocks.find((block) => block.type === 'paragraph' && block.section === 1);
    return first
      ? [
          {
            op: 'replaceText',
            at: { elementId: first.elementId, from: 0, to: 4, expect: first.text.slice(0, 4) },
            text: 'Every',
          },
        ]
      : [];
  },
  'Add a paragraph after the Timing heading': ({ blocks }) => {
    const timing = blocks.find((block) => block.type === 'heading' && block.text === 'Timing');
    return timing
      ? [
          {
            op: 'insertBlocks',
            after: timing.elementId,
            content: [
              { type: 'paragraph', content: [text('Timing is measured at the connector.')] },
            ],
          },
        ]
      : [];
  },
  'Comment on the Scope heading': ({ blocks }) => {
    const scope = blocks.find((block) => block.type === 'heading' && block.text === 'Scope');
    return scope
      ? [{ op: 'comment', at: { elementId: scope.elementId }, text: 'Is the scope complete?' }]
      : [];
  },
  'Edit the locked cover (refused)': ({ blocks }) => {
    const cover = blocks.find((block) => block.section === 0);
    return cover
      ? [{ op: 'insertText', at: { elementId: cover.elementId, from: 0 }, text: 'Draft: ' }]
      : [];
  },
  'Expect text that is not there (refused)': ({ blocks }) => {
    const first = blocks.find((block) => block.type === 'paragraph' && block.section === 1);
    return first
      ? [{ op: 'deleteText', at: { elementId: first.elementId, from: 0, to: 4, expect: 'Nope' } }]
      : [];
  },
};

type ExampleName = keyof typeof EXAMPLES;

function Lab() {
  const [stored, setStored] = useState<StoredDocument | null>(null);
  const [previous, setPrevious] = useState<DocumentFile | null>(null);
  const [description, setDescription] = useState<DocumentDescription | null>(null);
  const [actor, setActor] = useState<Actor['kind']>('agent');
  const [mode, setMode] = useState<'direct' | 'suggest'>('suggest');
  const [example, setExample] = useState<ExampleName>('Reword the first paragraph');
  const [batch, setBatch] = useState('');
  const [result, setResult] = useState('');
  const [changes, setChanges] = useState<string[]>([]);
  const [threads, setThreads] = useState(0);
  const [counted, setCounted] = useState<'accepted' | 'rejected'>('accepted');
  const [generated, setGenerated] = useState(false);
  const [elementId, setElementId] = useState('');
  const [readerOutput, setReaderOutput] = useState('');

  const reload = useCallback(async () => {
    const loaded = await HOST.documents.load(DOCUMENT_ID);
    if (loaded.ok) setStored(loaded.value);
    return loaded.ok ? loaded.value : null;
  }, []);
  useEffect(() => {
    let live = true;
    void HOST.documents.load(DOCUMENT_ID).then((loaded) => {
      if (live && loaded.ok) setStored(loaded.value);
    });
    return () => {
      live = false;
    };
  }, []);

  // Saves content as the host's server would, keeping the content before for the comparison.
  const save = async (current: StoredDocument, content: DocumentFile, what: string) => {
    const saved = await HOST.documents.save(DOCUMENT_ID, {
      content,
      baseRevision: current.revision,
    });
    if (!saved.ok) {
      setResult(`${what}: the store refused the save (${saved.error.kind})`);
      return;
    }
    setPrevious(current.content);
    setResult(`${what}: saved as revision ${String(saved.value.sequence)}`);
    await reload();
  };

  const describe = () => {
    if (!stored) return;
    const described = describeDocument(stored, { schema: SCHEMA, template: TEMPLATE });
    setDescription(described);
    setBatch(JSON.stringify(EXAMPLES[example]?.(described) ?? [], null, 2));
  };
  const apply = async () => {
    const current = await reload();
    if (!current || !description) return;
    let edits: AutomationEdit[];
    try {
      edits = JSON.parse(batch) as AutomationEdit[];
    } catch {
      setResult('The batch is not JSON');
      return;
    }
    const applied = applyStoredEdits(current, edits, {
      schema: SCHEMA,
      template: TEMPLATE,
      revision: description.revision,
      actor: ACTORS[actor],
      mode,
    });
    if (!applied.ok) {
      setResult(`Refused (${applied.error.kind}): ${applied.error.message}`);
      return;
    }
    for (const thread of applied.threads) {
      await HOST.comments?.create(DOCUMENT_ID, {
        id: thread.id,
        quote: thread.quote,
        text: thread.text,
      });
    }
    const listed = await HOST.comments?.list(DOCUMENT_ID);
    if (listed?.ok) setThreads(listed.value.length);
    await save(current, applied.content, 'The batch');
  };
  const anotherWriterSaves = async () => {
    const current = await reload();
    if (!current) return;
    const content = structuredClone(current.content);
    content.sections.at(-1)?.content.push({
      type: 'paragraph',
      content: [text('A paragraph another writer added.')],
    });
    await save(current, content, 'Another writer');
  };
  const runScripts = async () => {
    const current = await reload();
    if (!current || !HOST.scripts) return;
    const run = await runStoredScripts(current.content, { schema: SCHEMA, runner: HOST.scripts });
    if (run.failed.size > 0) {
      setResult(`Scripts failed: ${[...run.failed.values()].join('; ')}`);
      return;
    }
    await save(current, run.file, 'The scripts');
  };
  const decide = async (decision: 'accept' | 'reject') => {
    const current = await reload();
    if (!current) return;
    const tr = EditorState.create({ doc: read(current.content) }).tr;
    const report = decideSuggestions(tr, decision);
    if (!report || !tr.docChanged) {
      setResult('No suggestions to decide');
      return;
    }
    await save(current, writeDocumentFile(tr.doc, { template: TEMPLATE }), `Decided (${decision})`);
  };
  const compare = () => {
    if (!stored || !previous) {
      setChanges([]);
      return;
    }
    setChanges(
      compareVersions(read(previous), read(stored.content), {
        suggestions: counted,
        generated,
      }).map((change) => `${change.kind}: ${change.text || change.previousText || ''}`),
    );
  };

  // The readers, run on the stored file as a server would, without an editor.
  const readStored = (reader: (file: DocumentFile) => unknown) => {
    if (stored) setReaderOutput(JSON.stringify(reader(stored.content), null, 2));
  };
  const findElement = () =>
    readStored((file) => {
      const found = findStoredElement(file, elementId.trim());
      return found
        ? {
            type: found.node.type,
            path: found.path,
            section: found.section.name,
            parentId: found.parentId,
          }
        : `No element has the id ${elementId}`;
    });
  const moveToStrict = async () => {
    const current = await reload();
    if (!current) return;
    const moved = replaceTemplate(current.content, { schema: SCHEMA, template: STRICT_TEMPLATE });
    await save(current, moved, 'Moved to the strict template');
  };
  const acceptFirst = async () => {
    const current = await reload();
    if (!current) return;
    const first = listSuggestions(read(current.content))[0];
    if (!first) {
      setResult('No suggestions to decide');
      return;
    }
    const decided = decideStoredSuggestions(current.content, {
      schema: SCHEMA,
      decision: 'accept',
      ids: [first.id],
    });
    await save(current, decided.file, `Accepted ${decided.decided.join(', ')}`);
  };

  // The stored document as the reader sees it, read again on each save.
  const view = useMemo(
    () =>
      stored &&
      EditorState.create({
        doc: read(stored.content),
        plugins: createDocumentEditing(SCHEMA, { template: () => TEMPLATE }),
      }),
    [stored],
  );
  const suggestions = view ? listSuggestions(view.doc).length : 0;
  return (
    <>
      <div className="lab-controls">
        <fieldset>
          <legend>Agent</legend>
          <label>
            Actor{' '}
            <select
              value={actor}
              onChange={(event) => setActor(event.currentTarget.value as Actor['kind'])}
            >
              <option value="agent">Agent</option>
              <option value="human">Person</option>
              <option value="system">System</option>
            </select>
          </label>{' '}
          <label>
            Edits{' '}
            <select
              value={mode}
              onChange={(event) => setMode(event.currentTarget.value as 'direct' | 'suggest')}
            >
              <option value="suggest">As suggestions</option>
              <option value="direct">Directly</option>
            </select>
          </label>{' '}
          <label>
            Example batch{' '}
            <select value={example} onChange={(event) => setExample(event.currentTarget.value)}>
              {Object.keys(EXAMPLES).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>{' '}
          <button type="button" onClick={describe}>
            Read the document
          </button>
          <div>
            <label>
              Batch{' '}
              <textarea
                rows={8}
                cols={70}
                value={batch}
                onChange={(event) => setBatch(event.currentTarget.value)}
              />
            </label>
          </div>
          <button type="button" disabled={!description} onClick={() => void apply()}>
            Send the batch
          </button>
          <output aria-label="Read revision">
            {description
              ? `Read revision ${description.revision}: ${String(description.blocks.length)} blocks, ${String(description.sections.filter((section) => !section.editable).length)} locked sections`
              : 'Not read yet'}
          </output>
        </fieldset>
        <fieldset>
          <legend>Host</legend>
          <button type="button" onClick={() => void anotherWriterSaves()}>
            Another writer saves
          </button>{' '}
          <button type="button" onClick={() => void runScripts()}>
            Run the scripts
          </button>{' '}
          <button type="button" onClick={() => void decide('accept')}>
            Accept every suggestion
          </button>{' '}
          <button type="button" onClick={() => void decide('reject')}>
            Reject every suggestion
          </button>{' '}
          <label>
            Suggestions count as{' '}
            <select
              value={counted}
              onChange={(event) => setCounted(event.currentTarget.value as 'accepted' | 'rejected')}
            >
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>{' '}
          <label>
            <input
              type="checkbox"
              checked={generated}
              onChange={(event) => setGenerated(event.currentTarget.checked)}
            />{' '}
            Count generated values as changes
          </label>{' '}
          <button type="button" onClick={compare}>
            Compare with the save before
          </button>
          <output aria-label="Host result">{result}</output>
          <p>
            Stored revision {stored?.sequence ?? '…'} · {suggestions} suggestions · {threads}{' '}
            comment threads
          </p>
          <ul aria-label="Changes since the save before">
            {changes.map((change, index) => (
              <li key={`${String(index)}-${change}`}>{change}</li>
            ))}
          </ul>
          <details>
            <summary>Schemas the host offers an agent</summary>
            <pre tabIndex={0}>{JSON.stringify(AUTOMATION_SCHEMAS, null, 2)}</pre>
          </details>
        </fieldset>
        <fieldset>
          <legend>Stored-file readers</legend>
          <label>
            Element id{' '}
            <input
              value={elementId}
              onChange={(event) => setElementId(event.currentTarget.value)}
            />
          </label>{' '}
          <button type="button" onClick={findElement}>
            Find the element
          </button>{' '}
          <button
            type="button"
            onClick={() => readStored((file) => storedDocumentText(file, SCHEMA))}
          >
            Read the text
          </button>{' '}
          <button type="button" onClick={() => readStored(storedCitations)}>
            List the citations
          </button>{' '}
          <button
            type="button"
            onClick={() =>
              readStored((file) => documentTargets(file, { schema: SCHEMA, template: TEMPLATE }))
            }
          >
            List the reference targets
          </button>{' '}
          <button
            type="button"
            onClick={() => readStored((file) => validateRequiredSections(file, STRICT_TEMPLATE))}
          >
            Check against the strict template
          </button>{' '}
          <button type="button" onClick={() => readStored(threadAnchors)}>
            List the thread anchors
          </button>{' '}
          <button type="button" onClick={() => void moveToStrict()}>
            Move to the strict template
          </button>{' '}
          <button type="button" onClick={() => void acceptFirst()}>
            Accept the first suggestion only
          </button>
          <section aria-label="Reader output">
            <pre tabIndex={0}>{readerOutput}</pre>
          </section>
        </fieldset>
      </div>
      {stored && view ? (
        <DocumentEditor
          key={stored.revision}
          state={view}
          onStateChange={() => undefined}
          template={stored.content.template?.id === STRICT_TEMPLATE.id ? STRICT_TEMPLATE : TEMPLATE}
          editable={false}
          aria-label="Stored document"
        />
      ) : null}
    </>
  );
}

const container = document.querySelector('#lab-editor');
if (container) {
  createRoot(container).render(<Lab />);
  markReadyWhenSettled();
}
