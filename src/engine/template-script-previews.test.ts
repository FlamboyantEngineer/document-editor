import { Fragment } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { buildScriptTable } from '../document/index.js';
import type { ScriptRunnerAdapter, ScriptRunRequest } from '../host/index.js';
import {
  createDocumentFile,
  readDocumentFile,
  readStoredContent,
  type TemplateFile,
  templatePreviewDocument,
  writeStoredContent,
} from '../model/index.js';
import { createDocumentEditing } from './document-editing.js';
import { listScriptBlocks } from './script-output.js';
import { runScripts } from './scripts.js';
import { createTemplateScriptPreviews, withoutScriptOutput } from './template-script-previews.js';

const SOURCE = 'render.paragraph("Signed.")';

const TEMPLATE: TemplateFile = {
  formatVersion: 1,
  id: 'preview',
  sections: [
    {
      name: 'approvals',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Approved.' }] },
        { type: 'script', attrs: { source: SOURCE } },
      ],
    },
  ],
};

// A runner that produces one paragraph and records each request.
function runner() {
  const requests: ScriptRunRequest[] = [];
  const host: ScriptRunnerAdapter & { requests: ScriptRunRequest[] } = {
    requests,
    run: (request) => {
      requests.push(request);
      return Promise.resolve({
        ok: true,
        value: { content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Signed.' }] }] },
      });
    },
  };
  return host;
}

function show(host: ScriptRunnerAdapter, enabled = true) {
  const doc = readDocumentFile(
    templatePreviewDocument(TEMPLATE, undefined, { parts: true }),
    documentSchema,
  ).doc;
  const plugins = [createTemplateScriptPreviews({ runner: () => host, enabled: () => enabled })];
  return new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc, plugins }),
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('template script previews', () => {
  it('DOCE-TEMPLATES-8.9 shows what a part script produces beside it, never in the document', async () => {
    const host = runner();
    const view = show(host);
    const before = view.state.doc;
    await settle();
    expect(host.requests).toHaveLength(1);
    expect(host.requests[0]).toMatchObject({ purpose: 'preview', source: SOURCE });
    const preview = view.dom.querySelector('.de-script-preview');
    expect(preview).toHaveTextContent('Signed.');
    expect(preview).toHaveAttribute('contenteditable', 'false');
    expect(view.dom.querySelector('[data-script-preview]')).not.toBeNull();
    expect(view.state.doc).toBe(before);
    view.destroy();
  });

  it('DOCE-TEMPLATES-8.9 runs no script again when the template is shown again', async () => {
    const host = runner();
    show(host).destroy();
    await settle();
    const view = show(host);
    await settle();
    expect(host.requests).toHaveLength(1);
    expect(view.dom.querySelector('.de-script-preview')).toHaveTextContent('Signed.');
    view.destroy();
  });

  it('DOCE-TEMPLATES-8.9 shows nothing and runs nothing while template content is not edited', async () => {
    const host = runner();
    const view = show(host, false);
    await settle();
    expect(host.requests).toHaveLength(0);
    expect(view.dom.querySelector('.de-script-preview')).toBeNull();
    view.destroy();
  });

  it('DOCE-TEMPLATES-8.10 stores a part script without its output or what its run recorded', () => {
    const content = readStoredContent(
      [
        {
          type: 'script',
          attrs: { source: SOURCE, renderedAt: '2026-01-01T00:00:00Z' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Signed.' }] }],
        },
      ],
      documentSchema,
    );
    const [stored] = writeStoredContent(withoutScriptOutput(Fragment.from(content)));
    expect(stored).toMatchObject({ type: 'script', attrs: { source: SOURCE } });
    expect(stored?.content ?? []).toHaveLength(0);
    expect(stored?.attrs?.renderedAt ?? null).toBeNull();
  });

  it('DOCE-TEMPLATES-8.10 makes a document that keeps the template script and runs it itself', async () => {
    const template = {
      ...TEMPLATE,
      sections: TEMPLATE.sections?.map((each) => ({ ...each, required: true })),
    };
    let id = 0;
    const newId = () => (id += 1).toString(16).padStart(8, 'a');
    const file = createDocumentFile({ template, newId, schema: documentSchema });
    const plugins = createDocumentEditing(documentSchema);
    const doc = readDocumentFile(file, documentSchema).doc;
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc, plugins }),
    });
    const [block] = listScriptBlocks(view.state.doc);
    expect(block?.node.attrs.script).toBe(SOURCE);
    expect(block?.node.childCount).toBe(0);
    const table: ScriptRunnerAdapter = {
      run: () =>
        Promise.resolve({
          ok: true,
          value: { content: [buildScriptTable([['Name'], ['Ada']], { header: true })] },
        }),
    };
    expect(await runScripts(view, table)).toEqual([]);
    const [ran] = listScriptBlocks(view.state.doc);
    expect(ran?.node.firstChild?.type.name).toBe('table_figure');
    view.destroy();
  });
});
