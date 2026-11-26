// Shows page headers and footers from a template: `setPageRegions` puts the template's regions on
// every page, `createPageVariables` shows each page's number, the page count and the document's name
// in them, and the pagination leaves each page the room its header and footer take.

import { EditorState } from 'prosemirror-state';
import { Transform } from 'prosemirror-transform';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  createDocumentSchema,
  readDocumentFile,
  resolveTemplateFile,
  setPageRegions,
  type StoredNode,
  type TemplateFile,
} from '../../src/model/index.js';
import { createPageVariables } from '../../src/pagination/index.js';
import { applyTemplate, bodyHeight, sampleDocument, text, variable } from './lab-document.js';
import { labMounts, showOnPages } from './lab-pages.js';

const line = (...content: StoredNode[]): StoredNode => ({ type: 'paragraph', content });

// The base template with a header naming the document and a footer numbering the pages; a tall
// header adds a second line.
function regionsTemplate(tall: boolean): TemplateFile {
  const header = [line(variable('document.name'))];
  if (tall) header.push(line(text('Draft for review: not for release')));
  return resolveTemplateFile(
    {
      formatVersion: 1,
      id: tall ? 'regions-tall' : 'regions',
      header: { content: header, spacingToContent: '12pt' },
      footer: {
        content: [
          line(text('Page '), variable('page.current'), text(' of '), variable('page.total')),
        ],
        spacingToContent: '12pt',
      },
    },
    {
      loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
      baseTemplateId: BASE_TEMPLATE_ID,
    },
  );
}

const SAMPLE = sampleDocument(['Scope', 'Interfaces', 'Timing', 'Power', 'Storage']);

function render(): void {
  const mounts = labMounts();
  const name = document.querySelector<HTMLInputElement>('input[name="document-name"]');
  const tall = document.querySelector<HTMLInputElement>('input[name="tall-header"]');
  if (!mounts || !name || !tall) return;
  let template = regionsTemplate(false);
  let applied = applyTemplate(template, []);
  // The variables read the pages, so they run on them, as in the document editor; the name's text
  // is stored in the document, and changed by an edit (DOCE-FORMAT-1.7).
  const variables = createPageVariables();
  const named = () => ({ 'document.name': name.value });
  const doc = readDocumentFile({ ...SAMPLE, values: named() }, createDocumentSchema()).doc;
  const pages = showOnPages(mounts, {
    state: EditorState.create({ doc: setPageRegions(new Transform(doc), template).doc }),
    pageHeight: () => bodyHeight(template),
    plugins: [variables],
    onLayout: () => {
      document.documentElement.dataset.labLaidOut = template.id;
    },
  });
  // A longer name can wrap the header onto another line, which the edit lays out again.
  name.addEventListener('input', () => {
    pages.dispatch(
      pages.state.tr.setDocAttribute('values', named()).setMeta('addToHistory', false),
    );
  });
  tall.addEventListener('change', () => {
    template = regionsTemplate(tall.checked);
    applied = applyTemplate(template, applied);
    pages.dispatch(setPageRegions(pages.state.tr, template).setMeta('addToHistory', false));
  });
}

render();
