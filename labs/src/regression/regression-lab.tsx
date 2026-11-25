// The regression lab's page: a document of the regression set, picked by the Document picker or
// the page's `document` query parameter, in the document editor with its scrolling frame and
// status bar, laid out on its template's pages; with `hostViews`, quotes drawn by a host view; with
// `compare`, the changes since it opened as change bars; with `zoom`, at that zoom in percent; with
// `markup`, its suggestions shown in that markup; with `debug`, with the layout debugging shown. Its linked code resolves to sample lines.
// The regression scenarios (`e2e/regression.spec.ts`) read the pages it draws and edit them.

import { EditorState } from 'prosemirror-state';
import { useCallback, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DocumentEditor,
  type DocumentEditorHandle,
  type DocumentLayout,
  DocumentViewer,
} from '../../../src/components/index.js';
import type { PagesLayout } from '../../../src/document/index.js';
import {
  assignElementIds,
  createContents,
  createDocumentEditing,
} from '../../../src/engine/index.js';
import type { FontsAdapter } from '../../../src/host/index.js';
import {
  createDocumentSchema,
  type DocumentFile,
  readDocumentFile,
  type TemplateFile,
} from '../../../src/model/index.js';
import { markReadyWhenSettled } from '../lab-ready.js';
import { COUSINE_FONTS, LAB_FONTS, SLOW_LAB_FONTS } from '../served-fonts.js';
import { useStressProbe } from '../stress/stress-probe.js';
import { HOST_VIEWS } from './host-quote-view.js';
import { REGRESSION_CODE } from './regression-code.js';
import {
  REGRESSION_DOCUMENTS,
  regressionDocument,
  type RegressionDocumentName,
  resolveRegressionTemplate,
} from './regression-documents.js';
import { type LabFonts, type ShowViewer, useRegressionProbe } from './regression-probe.js';
import { RELATIVE_SIZES, withRelativeSizes } from './relative-sizes.js';

const NAMES = Object.keys(REGRESSION_DOCUMENTS) as RegressionDocumentName[];

const isName = (value: string | null): value is RegressionDocumentName =>
  NAMES.some((name) => name === value);

// The document shown on load: the one the query names, or the first.
function initialName(): RegressionDocumentName {
  const asked = new URLSearchParams(window.location.search).get('document');
  return isName(asked) ? asked : (NAMES[0] as RegressionDocumentName);
}

// The layout the query names: pages, or the web layout (`layout=web`).
const LAYOUT: DocumentLayout =
  new URLSearchParams(window.location.search).get('layout') === 'web' ? 'web' : 'page';

// `compare` shows the changes since the document opened as change bars, as a reader reviewing
// changes sees it: none until the reader edits; `compare=markup` marks them up in place, the
// deleted words shown where they were.
const COMPARE_QUERY = new URLSearchParams(window.location.search).get('compare');
const COMPARE =
  COMPARE_QUERY === null
    ? undefined
    : ({ previous: 'opened', display: COMPARE_QUERY === 'markup' ? 'markup' : 'bars' } as const);

// The lab serves its font files and HarfBuzz, which the layout engine lays the pages out with
// (DOCE-HOST-1.14.1); with `fonts=none` it serves neither, and the document shows in the web layout
// with an error; with `fonts=cousine` it serves Cousine's files under every family
// (DOCE-PAGINATION-12.7).
const FONTS_QUERY = new URLSearchParams(window.location.search).get('fonts');
const FONTS: LabFonts =
  FONTS_QUERY === 'none' ? 'none' : FONTS_QUERY === 'cousine' ? 'cousine' : 'lab';

const ADAPTERS: Readonly<Record<LabFonts, FontsAdapter | undefined>> = {
  none: undefined,
  lab: LAB_FONTS,
  cousine: COUSINE_FONTS,
  slow: SLOW_LAB_FONTS,
};

// How the pages are painted: as HTML, or each into a canvas (`rendering=html-canvas`,
// DOCE-EDITOR-1.9) where the browser has the HTML-in-Canvas API.
const RENDERING =
  new URLSearchParams(window.location.search).get('rendering') === 'html-canvas'
    ? 'html-canvas'
    : 'dom';

// The document's zoom in percent (`zoom`), 100 when the query names none.
const ZOOM = Number(new URLSearchParams(window.location.search).get('zoom') ?? 100) || 100;

// `debug` shows the layout debugging: each page's room and each block's planned height and top
// (`data-debug-height`, `data-debug-top`), which the block geometry check reads (DOCE-LABS-8.10).
const DEBUG = new URLSearchParams(window.location.search).has('debug')
  ? ({ pages: true, blocks: true } as const)
  : undefined;

// How the editor shows suggestions (`markup`): all their markup by default, or `final`, `simple`
// or `original`.
const MARKUP_QUERY = new URLSearchParams(window.location.search).get('markup');
const MARKUP = (['final', 'simple', 'original'] as const).find((each) => each === MARKUP_QUERY);

// Whether the host draws quotes with a React view of its own (`hostViews`).
const HOST = new URLSearchParams(window.location.search).has('hostViews');

function opened(
  name: RegressionDocumentName,
  stored?: DocumentFile,
  own?: TemplateFile,
): { state: EditorState; template: TemplateFile } {
  const document = regressionDocument(name);
  const file = stored ?? document.file;
  const resolved = own ? resolveRegressionTemplate(own) : document.template;
  const template = RELATIVE_SIZES ? withRelativeSizes(resolved) : resolved;
  const schema = createDocumentSchema();
  const state = EditorState.create({
    doc: readDocumentFile(file, schema).doc,
    plugins: [
      createContents({ template: () => template }),
      ...createDocumentEditing(schema, { template: () => template, author: () => 'lab' }),
    ],
  });
  const tr = state.tr;
  assignElementIds(tr, {});
  // The ids a document opens with are no edit of the writer's to undo.
  return { state: state.apply(tr.setMeta('addToHistory', false)), template };
}

function RegressionLab() {
  const [name, setName] = useState(initialName);
  const [first] = useState(() => opened(name));
  const [template, setTemplate] = useState(first.template);
  const [state, setState] = useState(first.state);
  const [zoom, setZoom] = useState(ZOOM);
  // A stored document opened afresh mounts a new editor, as a page loading it would.
  const [opening, setOpening] = useState(0);
  const handle = useRef<DocumentEditorHandle>(null);
  useStressProbe(handle, null);
  const [fonts, setFonts] = useState<LabFonts>(FONTS);
  const [viewers, setViewers] = useState<readonly { layout: PagesLayout; overscan: number }[]>([]);
  const showViewer = useCallback<ShowViewer>(
    (layout, overscan, more = []) =>
      setViewers([{ layout, overscan }, ...more.map((each) => ({ layout: each, overscan }))]),
    [],
  );
  const load = useCallback(
    (file: DocumentFile, own?: TemplateFile) => {
      const loaded = opened(name, file, own);
      setTemplate(loaded.template);
      setState(loaded.state);
      setViewers([]);
      setOpening((count) => count + 1);
    },
    [name],
  );
  const keepViewers = useCallback(
    (count: number) => setViewers((shown) => shown.slice(0, count)),
    [],
  );
  useRegressionProbe(handle, template, { showViewer, load, setZoom, setFonts, keepViewers });
  const pick = (next: string) => {
    if (!isName(next)) return;
    setName(next);
    const picked = opened(next);
    setTemplate(picked.template);
    setState(picked.state);
    setViewers([]);
    const url = new URL(window.location.href);
    url.searchParams.set('document', next);
    window.history.replaceState(null, '', url);
  };
  return (
    <>
      <fieldset>
        <legend>View</legend>
        <label>
          Document{' '}
          <select
            name="document"
            value={name}
            onChange={(event) => pick(event.currentTarget.value)}
          >
            {NAMES.map((each) => (
              <option key={each} value={each}>
                {each}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            const layout = handle.current?.pagesLayout();
            if (layout) showViewer(layout, 1);
          }}
        >
          Show in the viewer
        </button>
      </fieldset>
      <DocumentEditor
        key={`${name}-${String(opening)}`}
        state={state}
        onStateChange={setState}
        template={template}
        layout={LAYOUT}
        markup={MARKUP}
        zoom={zoom}
        fonts={ADAPTERS[fonts]}
        rendering={RENDERING}
        compare={COMPARE}
        debug={DEBUG}
        nodeViews={HOST ? HOST_VIEWS : undefined}
        codeSource={REGRESSION_CODE}
        scrollable
        statusBar
        className="lab-document-editor"
        aria-label="Regression document"
        handleRef={handle}
      />
      {viewers.map((viewer, index) => (
        <section
          // The viewers are only ever shown or taken away together, in order.
          key={index}
          className="lab-document-viewer"
          aria-label={index ? `Viewer ${String(index + 1)}` : 'Viewer'}
        >
          <DocumentViewer
            layout={viewer.layout}
            template={template}
            overscan={viewer.overscan}
            label={index ? `Viewed document ${String(index + 1)}` : 'Viewed document'}
          />
        </section>
      ))}
    </>
  );
}

/** Mounts the regression lab in `#lab-editor`. */
export function mountRegressionLab(): void {
  const container = document.querySelector('#lab-editor');
  if (!container) return;
  createRoot(container).render(<RegressionLab />);
  markReadyWhenSettled();
}
