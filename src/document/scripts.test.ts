// @vitest-environment node
import { describe, expect, it } from 'vitest';
import stored from '../../test/fixtures/documents/scripts.json' with { type: 'json' };
import type { ScriptRunnerAdapter } from '../host/index.js';
import { createDocumentSchema, type DocumentFile, type StoredContent } from '../model/index.js';
import { buildScriptParagraph } from './script-output.js';
import { findStaleStoredScripts, runStoredScripts } from './scripts.js';

const schema = createDocumentSchema();
const file = stored as DocumentFile;
const now = () => new Date('2026-11-13T12:00:00.000Z');

// A runner that gives each script the content the map names, fails for `fail`, and throws for
// `throw`; it records the requests it was given.
function runnerOf(outputs: Readonly<Record<string, StoredContent>>) {
  const requests: { blockId: string; source: string; signal: AbortSignal | undefined }[] = [];
  const runner: ScriptRunnerAdapter = {
    run: ({ blockId, source }, signal) => {
      requests.push({ blockId, source, signal });
      if (source === 'fail')
        return Promise.resolve({ ok: false, error: { kind: 'unavailable', message: 'Broken' } });
      if (source === 'throw') return Promise.reject(new Error('Thrown'));
      return Promise.resolve({ ok: true, value: { content: outputs[source] ?? [] } });
    },
  };
  return { runner, requests };
}

const blocksOf = (document: DocumentFile) =>
  document.sections.flatMap((section) => section.content).filter((node) => node.type === 'script');

const withSources = (sources: readonly string[]): DocumentFile => ({
  ...file,
  sections: [
    {
      name: 'body',
      content: sources.map((source, index) => ({
        type: 'script',
        attrs: { id: `b000000${String(index)}`, source },
      })),
    },
  ],
});

describe('runStoredScripts', () => {
  it('DOCE-OBJECTS-4.4 runs a stored document’s scripts with no DOM and writes their outputs', async () => {
    expect(typeof document).toBe('undefined');
    const { runner, requests } = runnerOf({
      'return rows();': [buildScriptParagraph('Rows changed')],
      'return [];': [buildScriptParagraph('Now something')],
    });
    const run = await runStoredScripts(file, { schema, runner, now });
    expect(requests.map(({ blockId }) => blockId)).toEqual(['d6840dc0', 'ade680e2', 'aee68275']);
    const [first, second, third] = blocksOf(run.file);
    // The first script gave nothing, so it shows nothing; the others show what they gave.
    expect(first?.content).toBeUndefined();
    expect(second?.content?.[0]?.content?.[0]?.text).toBe('Rows changed');
    expect(second?.attrs?.renderedAt).toBe('2026-11-13T12:00:00.000Z');
    expect(third?.content?.[0]?.attrs?.id).toMatch(/^[0-9a-f]{8}$/);
    expect(run.file.template).toEqual(file.template);
    expect(run.failed.size).toBe(0);
    expect(typeof window).toBe('undefined');
  });

  it('DOCE-OBJECTS-4.4 leaves the document as it was when every output is the same', async () => {
    const { runner } = runnerOf({
      'return [{ type: "paragraph", text: "Generated" }];': [buildScriptParagraph('Generated')],
      'return rows();': blocksOf(file)[1]?.content ?? [],
    });
    const run = await runStoredScripts(file, {
      schema,
      runner,
      now,
      ids: ['d6840dc0', 'ade680e2'],
    });
    expect(run.file).toBe(file);
  });

  it('DOCE-OBJECTS-4.4 runs only the blocks asked for, giving the same ids on every run', async () => {
    const { runner, requests } = runnerOf({ one: [buildScriptParagraph('One')] });
    const source = withSources(['one', 'two']);
    const first = await runStoredScripts(source, { schema, runner, now, ids: ['b0000000'] });
    const again = await runStoredScripts(source, { schema, runner, now, ids: ['b0000000'] });
    expect(requests.map(({ blockId }) => blockId)).toEqual(['b0000000', 'b0000000']);
    expect(blocksOf(first.file)[0]?.content).toEqual(blocksOf(again.file)[0]?.content);
    expect(blocksOf(first.file)[1]?.content).toBeUndefined();
  });

  it('DOCE-OBJECTS-4.4 reports a failing, throwing or unreadable script and keeps its output', async () => {
    const { runner } = runnerOf({
      bad: [{ type: 'nothing-known' }],
      good: [buildScriptParagraph('Good')],
    });
    const run = await runStoredScripts(withSources(['fail', 'throw', 'bad', 'good']), {
      schema,
      runner,
      now,
    });
    expect([...run.failed.keys()]).toEqual(['b0000000', 'b0000001', 'b0000002']);
    expect(run.failed.get('b0000000')).toBe('Broken');
    expect(run.failed.get('b0000001')).toBe('Thrown');
    expect(blocksOf(run.file).map((block) => block.content?.length ?? 0)).toEqual([0, 0, 0, 1]);
  });

  it('DOCE-OBJECTS-4.4 stops when the signal aborts, rejecting with its reason', async () => {
    const controller = new AbortController();
    const reason = new Error('Stopped');
    const requests: (AbortSignal | undefined)[] = [];
    const runner: ScriptRunnerAdapter = {
      run: (_request, signal) => {
        requests.push(signal);
        controller.abort(reason);
        return Promise.resolve({ ok: true, value: { content: [buildScriptParagraph('Late')] } });
      },
    };
    const run = runStoredScripts(withSources(['one', 'two']), {
      schema,
      runner,
      signal: controller.signal,
    });
    await expect(run).rejects.toBe(reason);
    expect(requests).toEqual([controller.signal]);
    await expect(
      runStoredScripts(file, { schema, runner, signal: controller.signal }),
    ).rejects.toBe(reason);
    expect(requests).toHaveLength(1);
  });

  it('DOCE-OBJECTS-4.4 DOCE-OBJECTS-4.6 runs as stored, recording where each output came from', async () => {
    const purposes: string[] = [];
    const runner: ScriptRunnerAdapter = {
      run: ({ purpose }) => {
        purposes.push(purpose);
        const provenance = { inputs: 'k1' };
        return Promise.resolve({ ok: true, value: { content: [], provenance } });
      },
    };
    const run = await runStoredScripts(withSources(['one']), { schema, runner, now });
    expect(purposes).toEqual(['stored']);
    expect(blocksOf(run.file)[0]?.attrs?.provenance).toEqual({ inputs: 'k1' });
  });

  it('DOCE-OBJECTS-4.7 finds a stored document’s stale outputs with no DOM', async () => {
    const source = withSources(['one', 'two']);
    const recorded = blocksOf(source)[0];
    if (recorded?.attrs) recorded.attrs.provenance = { inputs: 'k-one' };
    const runner: ScriptRunnerAdapter = {
      run: () => Promise.resolve({ ok: true, value: { content: [] } }),
      inputsKey: ({ source: script }) => Promise.resolve({ ok: true, value: `k-${script}` }),
    };
    await expect(findStaleStoredScripts(source, { schema, runner })).resolves.toEqual(['b0000001']);
    await expect(
      findStaleStoredScripts(source, { schema, runner: { run: runner.run } }),
    ).resolves.toEqual([]);
    expect(typeof document).toBe('undefined');
  });
});
