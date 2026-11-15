import { Button } from '@flamboyantengineer/ui-components/button';
import { SelectField } from '@flamboyantengineer/ui-components/select-field';
import { useState } from 'react';
import { type CanvasComparison, compareCanvasText } from './canvas-comparison.js';

/** An explicit comparison separate from the live editor, so its work has a clear timing scope. */
export function CanvasBenchmark() {
  const [length, setLength] = useState('700');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CanvasComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = () => {
    setRunning(true);
    setResult(null);
    setError(null);
    void compareCanvasText(document, Number(length))
      .then(setResult)
      .catch((error: unknown) => {
        setError(error instanceof Error ? error.message : 'The comparison failed.');
      })
      .finally(() => setRunning(false));
  };
  return (
    <details className="lab-canvas-comparison">
      <summary>Text measurement comparison</summary>
      <p>
        A separate plain paragraph at 500 CSS pixels, 16px serif, 24px line height, and 800px pages.
        Times include metric setup and split planning; initial HTML layout and painting are
        excluded. Five alternating trials follow a warmup. Short paragraphs may be slower with
        Canvas.
      </p>
      <div className="lab-canvas-controls">
        <SelectField
          label="Benchmark length"
          className="lab-canvas-choice"
          size="sm"
          options={[
            { id: '60', label: 'Short: 60 sentences' },
            { id: '700', label: 'Long: 700 sentences' },
          ]}
          value={length}
          onChange={(key) => {
            setLength(String(key));
            setResult(null);
          }}
          tracksChanges={false}
          isDisabled={running}
        />
        <Button onPress={run} isDisabled={running} size="sm">
          {running ? 'Comparing…' : 'Compare text splitting'}
        </Button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {result ? (
        <output aria-label="Text comparison result">
          {result.matches ? 'Page breaks match.' : 'Page breaks differ.'} {result.characters}{' '}
          characters, {result.pages} pages. Median DOM: {result.domMs.toFixed(2)} ms; Canvas
          request: {result.canvasMs.toFixed(2)} ms.{' '}
          {result.usedCanvas
            ? 'Canvas text metrics used.'
            : 'DOM fallback: the font or wrapping did not qualify.'}
        </output>
      ) : null}
    </details>
  );
}
