// The layout's trace for debugging: one short line per event, key=value pairs with short keys. A
// `render` line tells of something drawn on the pages (a layout, a canonical change mirrored, a
// change refused and drawn again); a `trace` line of scheduling (a layout asked for, an edit left
// to settle, a layout skipped or failed). While nothing reads the trace, nothing is written.

/** One line of the layout's trace. */
export interface LayoutTrace {
  /** `render` for what draws the pages, `trace` for scheduling and bookkeeping. */
  readonly kind: 'render' | 'trace';
  /** The event and its values, such as `layout n=3 pg=24 ms=4.250`. */
  readonly line: string;
}

/** Where the trace goes now, or null while it is off. */
export type LayoutTraceSink = () => ((entry: LayoutTrace) => void) | null;

// The short key each value is written under.
const KEYS = {
  layouts: 'n',
  pages: 'pg',
  duration: 'ms',
  reason: 'why',
  passes: 'ps',
} as const;

type TraceValues = Partial<Record<keyof typeof KEYS, number | string>>;

/** The line of an event and its values, under their short keys. */
export function traceLine(event: string, values: TraceValues = {}): string {
  const pairs = Object.entries(values).map(([key, value]) => {
    const shown = typeof value === 'number' && !Number.isInteger(value) ? value.toFixed(3) : value;
    return `${KEYS[key as keyof typeof KEYS]}=${String(shown)}`;
  });
  return [event, ...pairs].join(' ');
}

/** The events the trace tells of, each with its kind. */
const TRACE_EVENTS = {
  layout: { kind: 'render', name: 'layout' },
  mirror: { kind: 'render', name: 'mirror' },
  refuse: { kind: 'render', name: 'refuse' },
  request: { kind: 'trace', name: 'layout.request' },
  settle: { kind: 'trace', name: 'settle' },
  skip: { kind: 'trace', name: 'layout.skip' },
  fail: { kind: 'trace', name: 'layout.fail' },
} as const satisfies Record<string, { kind: LayoutTrace['kind']; name: string }>;

/**
 * Writes an event to the trace when something reads it; the values are made only then, so an
 * unread trace costs one call.
 */
export function writeTrace(
  sink: LayoutTraceSink | undefined,
  event: keyof typeof TRACE_EVENTS,
  values?: () => TraceValues,
): void {
  const write = sink?.();
  if (!write) return;
  const { kind, name } = TRACE_EVENTS[event];
  write({ kind, line: traceLine(name, values?.()) });
}

/**
 * Starts timing a layout while the trace is read, and gives how to write its line once it is done,
 * with how long it took (`ms`) after its values; nothing while the trace is off.
 */
export function traceLayout(
  sink: LayoutTraceSink | undefined,
  owner: Window | null,
): (values: () => TraceValues) => void {
  if (!sink?.() || !owner) return () => undefined;
  const started = owner.performance.now();
  return (values) =>
    writeTrace(sink, 'layout', () => ({
      ...values(),
      duration: owner.performance.now() - started,
    }));
}
