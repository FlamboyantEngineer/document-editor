// The Tools menu: the next proofing issue, updating every reference, every variable's stored text
// and, with the host's glossary, every abbreviation, and, while the host runs scripts, running them
// all. Updates change the
// document, so they wait, with a reason, while the writer cannot edit it.

import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import type { EditorView } from 'prosemirror-view';
import {
  documentAbbreviations,
  refreshAbbreviations,
  refreshDocumentValues,
  refreshReferences,
  refreshReferenceStatus,
  selectNextProofingIssue,
} from '../../engine/index.js';
import type { GlossaryAdapter, ScriptRunnerAdapter, VariablesAdapter } from '../../host/index.js';
import type { TemplateFile } from '../../model/index.js';
import { type EditorContext, unavailableReason } from './editor-context.js';
import { scriptsWaitReason, startScripts } from './script-entries.js';

/** What the Tools menu acts with. */
export interface ToolsFeatures {
  readonly view: EditorView | null;
  /** The template references are formatted by; without it references are not updated. */
  readonly template?: TemplateFile | undefined;
  readonly glossary?: GlossaryAdapter | undefined;
  /** The host's variables, whose texts, with today's date, the document stores. */
  readonly variables?: VariablesAdapter | undefined;
  readonly scriptRunner?: ScriptRunnerAdapter | undefined;
}

// Brings the document's abbreviations up to date with the glossary's entries now: not once the
// view is gone or read, and not when the glossary fails.
async function updateAbbreviations(view: EditorView, glossary: GlossaryAdapter) {
  const ids = [...new Set(documentAbbreviations(view.state.doc).map((entry) => entry.id))];
  if (ids.length === 0) return;
  const resolved = await glossary.resolve(ids).catch(() => null);
  if (!resolved?.ok || view.isDestroyed || !view.editable) return;
  refreshAbbreviations(resolved.value)(view.state, view.dispatch, view);
}

// An entry that changes the document: disabled with the reason while the writer cannot edit, or,
// for a change that cannot be suggested, while they suggest.
function changing(
  context: EditorContext,
  entry: {
    id: string;
    label: string;
    run: () => void;
    suggestable?: boolean;
    waiting?: string | null;
  },
) {
  const suggestingOnly = context.suggesting && entry.suggestable === false;
  const reason = !context.editable
    ? unavailableReason(context)
    : suggestingOnly
      ? context.labels.reasonSuggesting
      : (entry.waiting ?? undefined);
  return {
    id: entry.id,
    label: entry.label,
    isDisabled: reason !== undefined,
    focusableWhenDisabled: reason !== undefined,
    ...(reason === undefined ? {} : { description: reason }),
    onAction: entry.run,
  };
}

// The entry that stores every variable's text again; it changes nothing when they are up to date.
function variableEntries(context: EditorContext, features: ToolsFeatures): MenuEntry[] {
  const { view, template, variables } = features;
  if (!view) return [];
  const source = { value: (key: string) => variables?.value(key), template };
  return [
    changing(context, {
      id: 'update-variables',
      label: context.labels.updateVariables,
      run: () => context.run(refreshDocumentValues(source)),
    }),
  ];
}

/** The Tools menu's entries. */
export function toolsEntries(context: EditorContext, features: ToolsFeatures): MenuEntry[] {
  const { labels } = context;
  const { view, template, glossary, scriptRunner } = features;
  return [
    {
      id: 'next-issue',
      label: labels.nextIssue,
      onAction: () => context.run(selectNextProofingIssue),
    },
    ...(template
      ? [
          changing(context, {
            id: 'update-references',
            label: labels.updateReferences,
            run: () => {
              context.run(refreshReferences(template));
              context.run(refreshReferenceStatus);
            },
          }),
        ]
      : []),
    ...variableEntries(context, features),
    ...(glossary && view
      ? [
          changing(context, {
            id: 'update-abbreviations',
            label: labels.updateAbbreviations,
            run: () => void updateAbbreviations(view, glossary),
          }),
        ]
      : []),
    ...(scriptRunner && view
      ? [
          changing(context, {
            id: 'run-all-scripts',
            label: labels.runAllScripts,
            // A script's output replaces the block's content outright, which no suggestion tracks.
            suggestable: false,
            // One run at a time.
            waiting: scriptsWaitReason(view, context),
            run: () => startScripts(view, scriptRunner),
          }),
        ]
      : []),
  ];
}
