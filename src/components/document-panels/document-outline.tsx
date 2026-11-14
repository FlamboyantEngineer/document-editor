// The outline panel: the base library's Outline over the document's headings, numbered as the
// template numbers them, the one the selection is under current; choosing one takes the reader to
// it without moving the selection. It sits beside the document, inside the editor or given the
// editor's context.

import { Outline } from '@flamboyantengineer/ui-components/outline';
import { EditorState } from 'prosemirror-state';
import { useMemo } from 'react';
import { documentOutline, type OutlineEntry, revealElement } from '../../engine/index.js';
import type { TemplateFile } from '../../model/index.js';
import { type EditorContext, useDocumentEditor } from '../document-editor/document-editor.js';

/** What the outline shows. */
export interface DocumentOutlineProps {
  /** The editor outlined; the editor holding the outline by default. */
  readonly context?: EditorContext | null | undefined;
  /** The template the headings are numbered by. */
  readonly template?: TemplateFile | undefined;
  /** Whether a heading is in the outline, such as to leave out a title; every one by default. */
  readonly include?: ((entry: OutlineEntry) => boolean) | undefined;
  /** Collapses the headings below this level. */
  readonly collapseBelowLevel?: number | undefined;
  /** Names the outline. */
  readonly 'aria-label'?: string | undefined;
  readonly className?: string | undefined;
}

/** The document's headings, taking the reader to the one chosen. */
export function DocumentOutline(props: DocumentOutlineProps) {
  const held = useDocumentEditor();
  const context = props.context ?? held;
  const { template, include } = props;
  const state = context?.state ?? null;
  // The headings are found again only when the document changes, not as the caret moves.
  const doc = state?.doc ?? null;
  const entries = useMemo(
    () =>
      doc
        ? documentOutline(EditorState.create({ doc }), template).filter(
            (entry) => entry.elementId !== null && (include?.(entry) ?? true),
          )
        : [],
    [doc, template, include],
  );
  const head = state?.selection.head ?? 0;
  if (!context) return null;
  // The heading the caret is under: the last that starts before it.
  const active = entries.findLast((entry) => entry.pos <= head + 1);
  return (
    <Outline
      className={props.className}
      aria-label={props['aria-label'] ?? context.labels.outline}
      headings={entries.map((entry) => ({
        id: entry.elementId ?? '',
        label: [entry.number, entry.text].filter(Boolean).join(' '),
        level: entry.level,
      }))}
      currentKey={active?.elementId ?? null}
      collapseBelowLevel={props.collapseBelowLevel}
      onNavigate={(id) => {
        if (context.view) revealElement(context.view, id);
      }}
    />
  );
}
