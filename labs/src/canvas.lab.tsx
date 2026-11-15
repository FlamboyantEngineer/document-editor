import { Button } from '@flamboyantengineer/ui-components/button';
import { Checkbox } from '@flamboyantengineer/ui-components/checkbox';
import { SelectField } from '@flamboyantengineer/ui-components/select-field';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DocumentEditor,
  type DocumentEditorHandle,
  type DocumentRendering,
} from '../../src/components/index.js';
import { CanvasBenchmark } from './canvas/canvas-benchmark.js';
import { CanvasDiagnostics } from './canvas/canvas-diagnostics.js';
import {
  type CanvasSample,
  canvasSamples,
  canvasTemplate,
  createCanvasState,
} from './canvas/canvas-documents.js';
import { markReadyWhenSettled } from './lab-ready.js';

interface CanvasSettings {
  readonly rendering: DocumentRendering;
  readonly scenario: CanvasSample;
  readonly zoom: number;
}

const zoomLevels = [75, 100, 125, 150, 200];

function readSettings(): CanvasSettings {
  const query = new URLSearchParams(window.location.search);
  const zoom = Number(query.get('zoom'));
  return {
    rendering: query.get('rendering') === 'dom' ? 'dom' : 'html-canvas',
    scenario: canvasSamples.find((sample) => sample.id === query.get('scenario'))?.id ?? 'mixed',
    zoom: zoomLevels.includes(zoom) ? zoom : 100,
  };
}

function CanvasControls({
  settings,
  onChange,
  onReset,
  measure,
  onMeasure,
}: {
  readonly settings: CanvasSettings;
  readonly onChange: (settings: CanvasSettings) => void;
  readonly onReset: () => void;
  readonly measure: boolean;
  readonly onMeasure: (show: boolean) => void;
}) {
  return (
    <div className="lab-canvas-controls">
      <SelectField
        label="Renderer"
        className="lab-canvas-choice"
        size="sm"
        tracksChanges={false}
        options={[
          { id: 'html-canvas', label: 'HTML-in-Canvas' },
          { id: 'dom', label: 'DOM' },
        ]}
        value={settings.rendering}
        onChange={(key) =>
          onChange({ ...settings, rendering: key === 'dom' ? 'dom' : 'html-canvas' })
        }
      />
      <SelectField
        label="Sample document"
        className="lab-canvas-choice"
        size="sm"
        tracksChanges={false}
        options={canvasSamples}
        value={settings.scenario}
        onChange={(key) => {
          const scenario = canvasSamples.find((sample) => sample.id === key)?.id;
          if (scenario) onChange({ ...settings, scenario });
        }}
      />
      <SelectField
        label="Editor zoom"
        className="lab-canvas-choice"
        size="sm"
        tracksChanges={false}
        options={zoomLevels.map((value) => ({ id: String(value), label: `${String(value)}%` }))}
        value={String(settings.zoom)}
        onChange={(key) => onChange({ ...settings, zoom: Number(key) })}
      />
      <Checkbox isSelected={measure} onChange={onMeasure}>
        Show measuring view
      </Checkbox>
      <Button size="sm" onPress={onReset}>
        Reset sample
      </Button>
    </div>
  );
}

function CanvasLab() {
  const [settings, setSettings] = useState(readSettings);
  const [state, setState] = useState(() => createCanvasState(settings.scenario));
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [measure, setMeasure] = useState(false);
  const handle = useRef<DocumentEditorHandle>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('rendering', settings.rendering);
    url.searchParams.set('scenario', settings.scenario);
    url.searchParams.set('zoom', String(settings.zoom));
    window.history.replaceState(null, '', url);
  }, [settings]);
  const change = (next: CanvasSettings) => {
    if (next.scenario !== settings.scenario) setState(createCanvasState(next.scenario));
    setSettings(next);
  };
  return (
    <>
      <CanvasControls
        settings={settings}
        onChange={change}
        onReset={() => setState(createCanvasState(settings.scenario))}
        measure={measure}
        onMeasure={setMeasure}
      />
      <CanvasDiagnostics root={root} handle={handle} />
      <CanvasBenchmark />
      <div ref={setRoot} className="lab-canvas-editor">
        <DocumentEditor
          handleRef={handle}
          aria-label="Canvas test document"
          state={state}
          onStateChange={setState}
          template={canvasTemplate}
          rendering={settings.rendering}
          zoom={settings.zoom}
          zoomLevels={zoomLevels}
          onZoomChange={(zoom) => setSettings((current) => ({ ...current, zoom }))}
          debug={{ measure }}
          toolbar
          statusBar
          scrollable
          className="lab-document-editor"
        />
      </div>
    </>
  );
}

const container = document.getElementById('lab-editor');
if (container) createRoot(container).render(<CanvasLab />);
markReadyWhenSettled();
