// The document editor lab's host panel: what the editor tells its host (focus, the selection, the
// writer's changes), a key of the host's own (Ctrl+S saves), and the editor's handle taking the
// reader to a heading.

import type { Command } from 'prosemirror-state';
import { type RefObject, useMemo, useState } from 'react';
import {
  type DocumentEditorHandle,
  type DocumentEditorNotifications,
  EDITOR_MEASURES,
} from '../../src/components/index.js';
import { describeBlocks } from '../../src/engine/index.js';
import type { TelemetryAdapter } from '../../src/host/index.js';

/** The lab's notifications and keys, and what they report. */
export function useHostPanel() {
  const [focused, setFocused] = useState(false);
  const [changes, setChanges] = useState(0);
  const [caret, setCaret] = useState('');
  const [saved, setSaved] = useState(0);
  const [firstLayout, setFirstLayout] = useState<number | null>(null);
  const telemetry = useMemo<TelemetryAdapter>(
    () => ({
      measure: (name, duration) => {
        if (name === EDITOR_MEASURES.firstLayout) setFirstLayout(Math.round(duration));
      },
    }),
    [],
  );
  const notifications = useMemo<DocumentEditorNotifications>(() => {
    const save: Command = () => {
      setSaved((count) => count + 1);
      return true;
    };
    return {
      onFocusChange: setFocused,
      onContentChange: () => setChanges((count) => count + 1),
      onSelectionChange: (selection) => setCaret(selection.$head.parent.type.name),
      keymap: { 'Mod-s': save },
    };
  }, []);
  return { notifications, telemetry, report: { focused, changes, caret, saved, firstLayout } };
}

/** The panel, reading the report and driving the editor through its handle. */
export function HostPanel({
  report,
  handle,
}: {
  report: ReturnType<typeof useHostPanel>['report'];
  handle: RefObject<DocumentEditorHandle | null>;
}) {
  const goTo = (title: string) => {
    const view = handle.current?.view();
    if (!view) return;
    const heading = describeBlocks(view.state.doc).find(
      (block) => block.type === 'heading' && block.text === title,
    );
    if (heading) handle.current?.scrollToElement(heading.elementId);
  };
  return (
    <fieldset className="lab-host">
      <legend>Host</legend>
      <button type="button" onClick={() => goTo('Power')}>
        Go to Power
      </button>
      <output aria-label="Host report">
        {report.focused ? 'Focused' : 'Not focused'} · {report.changes} changes · caret in{' '}
        {report.caret || 'nothing'} · saved {report.saved} times · first layout{' '}
        {report.firstLayout === null ? '…' : `${String(report.firstLayout)} ms`}
      </output>
    </fieldset>
  );
}
