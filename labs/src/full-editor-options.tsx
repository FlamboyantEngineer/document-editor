// The full editor lab's host options: proofing turned off and on, the reader's proofing decisions
// the host keeps and gives back, the first check run when the host says, the host's own way of
// normalising completion answers, the template pin scripts and exports are given, a markup choice
// the host turns off, a host record link inside generated content that keeps the selection, a
// script runner that keys its inputs so saved output goes stale, and abbreviations brought up to
// date on opening. The options read on opening take effect with Open again, which gives the editor
// the document anew. The samples beside them: abbreviations with each issue, and math that does
// not typeset.

import type { EditorView } from 'prosemirror-view';
import { useEffect, useState } from 'react';
import type { DocumentContextMenuOptions, DocumentMarkup } from '../../src/components/index.js';
import {
  normalizeCompletion,
  type ProofingDecision,
  type ProofingOptions,
} from '../../src/engine/index.js';
import type { ExportsAdapter, ScriptRunnerAdapter } from '../../src/host/index.js';
import type { DocumentFile, StoredNode, TemplatePin } from '../../src/model/index.js';
import { text } from './lab-document.js';

/** The options a host sets on the full editor lab. */
export interface HostOptions {
  /** Whether the document is proofed (`isEnabled`), read at once. */
  readonly proofing: boolean;
  /** Who runs the first check: the plugin after its delay, or the host (read on opening). */
  readonly firstCheck: 'delay' | 'host';
  /** Who makes a completion answer into the text offered, read at each answer. */
  readonly normalize: 'library' | 'host';
  /** Whether the document pins a template revision, given to scripts and exports. */
  readonly templatePin: boolean;
  /** Whether the host turns change bars off, saying why. */
  readonly restrictMarkup: boolean;
  /** Whether the script runner keys its inputs, so outputs are checked for staleness on opening. */
  readonly inputsKey: boolean;
  /** Whether opening brings abbreviations up to date with the glossary. */
  readonly refreshAbbreviations: boolean;
  /** Whether a footnote may be cited in a table, as the library lets, or not (read on opening). */
  readonly footnotesInTables: boolean;
  /** Whether the document holds the samples below (read on opening). */
  readonly samples: boolean;
}

export const DEFAULT_OPTIONS: HostOptions = {
  proofing: true,
  firstCheck: 'delay',
  normalize: 'library',
  templatePin: false,
  restrictMarkup: false,
  inputsKey: false,
  refreshAbbreviations: true,
  footnotesInTables: true,
  samples: false,
};

// The options as they are now, which the plugins read when they run.
const LIVE = { current: DEFAULT_OPTIONS };

/** The pin the lab gives scripts and exports while asked. */
export const LAB_PIN: TemplatePin = { id: 'full-editor', revision: 'rev-3' };

/** Why the host turns change bars off. */
export const MARKUP_REASONS: Readonly<Partial<Record<DocumentMarkup, string>>> = {
  simple: 'Change bars are off while the review is open',
};

/** What math that does not typeset shows instead. */
export const INVALID_MATH = { inline: 'Math to fix', display: 'This equation does not typeset' };

// The places this host lets a footnote be cited, while it keeps them out of tables: everywhere the
// library lets, but tables.
const OUT_OF_TABLES = [
  'list_item',
  'bullet_list',
  'ordered_list',
  'figure',
  'code_figure',
  'blockquote',
  'layout_section',
  'layout_column',
];

/** The places a footnote may be cited, as the document opens; the library's by default. */
export const citingPlaces = (): readonly string[] | undefined =>
  LIVE.current.footnotesInTables ? undefined : OUT_OF_TABLES;

// The decisions the host keeps, as it would per reader, and who is told when they change.
const KEPT = {
  decisions: [{ kind: 'ignore', word: 'recieve' }] as ProofingDecision[],
  listeners: new Set<() => void>(),
};

// The first check, while the host holds it.
const FIRST_CHECK = { run: null as (() => void) | null, listeners: new Set<() => void>() };

const tell = (listeners: Set<() => void>) => {
  for (const listener of listeners) listener();
};

/** The proofing options the host gives as the document opens. */
export function proofingOptions(): Pick<
  ProofingOptions,
  'isEnabled' | 'ignored' | 'disabledRules' | 'onDecision' | 'scheduleFirstCheck'
> {
  const decisions = KEPT.decisions;
  return {
    isEnabled: () => LIVE.current.proofing,
    ignored: decisions.flatMap((each) => (each.kind === 'ignore' ? [each.word] : [])),
    disabledRules: decisions.flatMap((each) => (each.kind === 'disable-rule' ? [each.rule] : [])),
    onDecision: (decision) => {
      KEPT.decisions = [...KEPT.decisions, decision];
      tell(KEPT.listeners);
    },
    ...(LIVE.current.firstCheck === 'host'
      ? {
          scheduleFirstCheck: (run: () => void) => {
            FIRST_CHECK.run = () => {
              FIRST_CHECK.run = null;
              tell(FIRST_CHECK.listeners);
              run();
            };
            tell(FIRST_CHECK.listeners);
            return () => {
              FIRST_CHECK.run = null;
              tell(FIRST_CHECK.listeners);
            };
          },
        }
      : {}),
  };
}

/**
 * The host's normalising, while asked: the answer's lines joined into one, where the library keeps
 * only the first line.
 */
export function normalizeAnswer(
  answer: string,
  request: Parameters<typeof normalizeCompletion>[1],
): string {
  if (LIVE.current.normalize === 'library') return normalizeCompletion(answer, request);
  return normalizeCompletion(answer.split(/\r?\n/).join(' '), request);
}

/** A link to one of the host's records, which a secondary click leaves the selection beside. */
export const isRecordLink = (element: Element): boolean =>
  element.closest('a[href^="#record/"]') !== null;

/** The lab's context menu with the host's record links keeping the selection. */
export const withRecordLinks = (menu: DocumentContextMenuOptions): DocumentContextMenuOptions => ({
  ...menu,
  keepSelection: isRecordLink,
});

// How the lab names the template a document is given with.
const pinName = ({ template }: DocumentFile) =>
  template ? `${template.id} ${template.revision ?? 'latest'}` : 'none';

/** The host's exports, telling the lab the template each run was given. */
export const reportingPins = (
  exports: ExportsAdapter,
  onRun: (pin: string) => void,
): ExportsAdapter => ({
  entries: exports.entries.map((entry) => ({
    ...entry,
    run: (request) => {
      onRun(pinName(request.content));
      return entry.run(request);
    },
  })),
});

/**
 * The runner the editor is given: the host's own, telling the lab the template each run was given,
 * without its inputs key unless asked.
 */
export function labRunner(
  runner: ScriptRunnerAdapter,
  keyed: boolean,
  onRun: (pin: string) => void,
): ScriptRunnerAdapter {
  const { inputsKey, ...rest } = runner;
  return {
    ...rest,
    ...(keyed && inputsKey ? { inputsKey } : {}),
    run: (request, signal) => {
      onRun(pinName(request.document));
      return runner.run(request, signal);
    },
  };
}

const abbreviation = (entry: string, short: string, expansion: string): StoredNode => ({
  type: 'abbreviation',
  attrs: { entry, abbreviation: short, expansion },
});

/** The glossary entries beside the lab's first: an archived one and two that read the same. */
export const GLOSSARY_ENTRIES = [
  ['glossary-tlm', 'TLM', 'Telemetry', '2026-01-02T00:00:00Z'],
  ['glossary-psu', 'PSU', 'Power supply unit', null],
  ['glossary-psu-2', 'PSU', 'Programmable supply unit', null],
].map(([id, short, expansion, archivedAt]) => ({
  id: id ?? '',
  abbreviation: short ?? '',
  expansion: expansion ?? '',
  archivedAt: archivedAt ?? null,
  createdBy: 'ada',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}));

/**
 * The samples: abbreviations citing an entry whose expansion changed, one the glossary no longer
 * has, an archived one and two that read the same; math that does not typeset; a word the reader
 * ignores everywhere; and a script whose saved output links to a record of the host's.
 */
export function sampleBlocks(): StoredNode[] {
  if (!LIVE.current.samples) return [];
  return [
    {
      type: 'paragraph',
      content: [
        text('Checked with the '),
        abbreviation('glossary-gse', 'GSE', 'Ground equipment'),
        text(', the '),
        abbreviation('glossary-gone', 'OBS', 'Old bench set'),
        text(', the '),
        abbreviation('glossary-tlm', 'TLM', 'Telemetry'),
        text(', the '),
        abbreviation('glossary-psu', 'PSU', 'Power supply unit'),
        text(' and the '),
        abbreviation('glossary-psu-2', 'PSU', 'Programmable supply unit'),
        text('. The margin is '),
        { type: 'math', attrs: { source: '\\frac{1}{' } },
        text(', and each station must recieve the log.'),
      ],
    },
    {
      type: 'script',
      attrs: { id: '5c41b7e3', source: 'render.paragraph("Raised in record SD-100.")' },
      content: [
        {
          type: 'paragraph',
          content: [
            text('Raised in '),
            {
              ...text('record SD-100'),
              marks: [{ type: 'link', attrs: { href: '#record/SD-100' } }],
            },
            text('.'),
          ],
        },
      ],
    },
  ];
}

// Re-renders when one of the lab's stores tells its listeners.
function useListeners(listeners: Set<() => void>) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((tick) => tick + 1);
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }, [listeners]);
}

const describe = (decision: ProofingDecision) =>
  decision.kind === 'ignore' ? `ignore ${decision.word}` : `rule ${decision.rule} off`;

interface HostOptionsPanelProps {
  readonly options: HostOptions;
  readonly onChange: (options: HostOptions) => void;
  readonly view: EditorView | null;
  readonly onOpenAgain: () => void;
  /** The template the last script run or export was given. */
  readonly templateGiven: string;
}

/** The controls for the host's options. */
export function HostOptionsPanel({
  options,
  onChange,
  view,
  onOpenAgain,
  templateGiven,
}: HostOptionsPanelProps) {
  useListeners(KEPT.listeners);
  useListeners(FIRST_CHECK.listeners);
  useEffect(() => {
    LIVE.current = options;
    // The plugins read whether to proof on the next update.
    if (view && !view.isDestroyed) view.dispatch(view.state.tr.setMeta('addToHistory', false));
  }, [options, view]);
  const check = (key: keyof HostOptions, label: string) => (
    <label>
      <input
        type="checkbox"
        checked={options[key] === true}
        onChange={(event) => onChange({ ...options, [key]: event.currentTarget.checked })}
      />{' '}
      {label}
    </label>
  );
  return (
    <fieldset>
      <legend>Host options</legend>
      {check('proofing', 'Proofing')}
      <label>
        First check{' '}
        <select
          value={options.firstCheck}
          onChange={(event) =>
            onChange({ ...options, firstCheck: event.currentTarget.value as 'delay' | 'host' })
          }
        >
          <option value="delay">After the delay</option>
          <option value="host">When the host runs it (on opening)</option>
        </select>
      </label>
      <button type="button" disabled={!FIRST_CHECK.run} onClick={() => FIRST_CHECK.run?.()}>
        Run the first check
      </button>
      <output aria-label="Kept decisions">{KEPT.decisions.map(describe).join(', ')}</output>
      <label>
        Completion answers{' '}
        <select
          value={options.normalize}
          onChange={(event) =>
            onChange({ ...options, normalize: event.currentTarget.value as 'library' | 'host' })
          }
        >
          <option value="library">The first line</option>
          <option value="host">Every line, joined by the host</option>
        </select>
      </label>
      {check('templatePin', 'Pin template revision')}
      <output aria-label="Template given">{templateGiven}</output>
      {check('restrictMarkup', 'Restrict change bars')}
      {check('inputsKey', 'Runner keys script inputs (on opening)')}
      {check('refreshAbbreviations', 'Refresh abbreviations (on opening)')}
      {check('footnotesInTables', 'Footnotes in tables (on opening)')}
      {check('samples', 'Abbreviation, math and record link samples (on opening)')}
      <button type="button" onClick={onOpenAgain}>
        Open again
      </button>
    </fieldset>
  );
}
