import { type RefObject, useEffect, useState } from 'react';
import type { DocumentEditorHandle } from '../../../src/components/index.js';

function readDiagnostics(root: HTMLElement, handle: DocumentEditorHandle | null) {
  const owner = root.ownerDocument;
  const win = owner.defaultView;
  const probe = owner.createElement('canvas');
  probe.setAttribute('content', 'drawable');
  const supported =
    Reflect.get(probe, 'content') === 'drawable' &&
    typeof Reflect.get(probe, 'requestPaint') === 'function' &&
    typeof Reflect.get(probe, 'updateElementGeometry') === 'function' &&
    typeof Reflect.get(win?.CanvasRenderingContext2D?.prototype ?? {}, 'drawElementImage') ===
      'function';
  const pages = root.querySelectorAll('.de-document-editor__content .pm-page');
  const canvases = [...root.querySelectorAll<HTMLCanvasElement>('.de-document-editor__canvas')];
  const allocated = canvases.filter((canvas) => canvas.width > 0 && canvas.height > 0);
  const first = allocated[0];
  const rect = first?.getBoundingClientRect();
  const stats = handle?.layoutStats();
  return {
    supported,
    dpr: win?.devicePixelRatio ?? 1,
    pages: pages.length,
    canvases: canvases.length,
    allocated: allocated.length,
    html: pages.length - canvases.length,
    size:
      first && rect
        ? `${rect.width.toFixed(2)} × ${rect.height.toFixed(2)} CSS px → ${String(first.width)} × ${String(first.height)} bitmap px`
        : 'No allocated page bitmap',
    layouts: stats?.layouts ?? 0,
    blocks: stats?.blocksMeasured ?? 0,
    hits: stats?.cacheHits ?? 0,
    state: root.querySelector<HTMLElement>('.de-document-editor')?.dataset.layoutState ?? 'pending',
  };
}

/** Polls once a second so inspecting bitmap sizes does not add work to every keystroke. */
export function CanvasDiagnostics({
  root,
  handle,
}: {
  readonly root: HTMLElement | null;
  readonly handle: RefObject<DocumentEditorHandle | null>;
}) {
  const [report, setReport] = useState<ReturnType<typeof readDiagnostics> | null>(null);
  useEffect(() => {
    if (!root) return undefined;
    const read = () => setReport(readDiagnostics(root, handle.current));
    const frame = requestAnimationFrame(read);
    const timer = window.setInterval(read, 1000);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, [root, handle]);
  return (
    <output className="lab-canvas-diagnostics" aria-label="Canvas diagnostics" aria-live="off">
      {report ? (
        <>
          <span>
            Native HTML-in-Canvas: {report.supported ? 'available' : 'unavailable; DOM fallback'}
          </span>
          <span>DPR: {report.dpr}</span>
          <span>
            {report.pages} pages · {report.canvases} canvas · {report.html} DOM · {report.allocated}{' '}
            allocated bitmaps
          </span>
          <span>{report.size}</span>
          <span>
            Layout: {report.state} · {report.layouts} passes · {report.blocks} blocks measured ·{' '}
            {report.hits} cache hits
          </span>
        </>
      ) : (
        'Waiting for the editor…'
      )}
    </output>
  );
}
