// The status bar's controls: the page status, which opens a field to go to a page by its number,
// and the layout switch between pages and the web layout.

import { Button } from '@flamboyantengineer/ui-components/button';
import { FileTextGlyph, GlobeGlyph } from '@flamboyantengineer/ui-components/core';
import { NumberField } from '@flamboyantengineer/ui-components/number-field';
import { Popover, PopoverTrigger } from '@flamboyantengineer/ui-components/popover';
import type { EditorView } from 'prosemirror-view';
import { useState } from 'react';
import { createHooks } from '../../utils/hooks.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import type { DocumentLayout } from './use-document-layout.js';

const hooks = createHooks('document-editor', ['layout-toggle']);

/** Scrolls a page of the view into view, by its number from 1; false when there is none. */
export function scrollToPage(view: EditorView, page: number): boolean {
  const pages = view.dom.querySelectorAll('.pm-page');
  const target = pages[Math.round(page) - 1];
  if (!target) return false;
  target.scrollIntoView({ block: 'start', behavior: 'smooth' });
  return true;
}

/** The page status, which opens a field to go to a page by its number. */
export function PageJump({
  view,
  labels,
  page,
  pages,
}: {
  view: EditorView | null;
  labels: DocumentEditorLabels;
  page: number;
  pages: number;
}) {
  const [isOpen, setOpen] = useState(false);
  const [target, setTarget] = useState<number | null>(null);
  // The field commits the page on Enter, which the editor scrolls to.
  const go = (to: number | null) => {
    if (view && to !== null) scrollToPage(view, to);
    setOpen(false);
  };
  return (
    <PopoverTrigger isOpen={isOpen} onOpenChange={setOpen}>
      <Button size="sm" variant="ghost" tooltip={labels.goToPage}>
        {labels.pageStatus(page, pages)}
      </Button>
      <Popover placement="top start" aria-label={labels.goToPage}>
        <NumberField
          label={labels.goToPage}
          autoFocus
          minValue={1}
          maxValue={pages}
          value={target}
          onChange={setTarget}
          onCommit={go}
        />
      </Popover>
    </PopoverTrigger>
  );
}

/** Switches between the pages and the web layout: one button for each, the one shown pressed. */
export function LayoutToggle({
  layout,
  labels,
  onChange,
}: {
  layout: DocumentLayout;
  labels: DocumentEditorLabels;
  onChange: (layout: DocumentLayout) => void;
}) {
  return (
    <span role="group" aria-label={labels.layout} {...hooks.slot('layout-toggle')}>
      <Button
        size="sm"
        variant="ghost"
        icon={FileTextGlyph}
        label={labels.pageLayout}
        tooltip={labels.pageLayout}
        isSelected={layout === 'page'}
        onPress={() => onChange('page')}
      />
      <Button
        size="sm"
        variant="ghost"
        icon={GlobeGlyph}
        label={labels.webLayout}
        tooltip={labels.webLayout}
        isSelected={layout === 'web'}
        onPress={() => onChange('web')}
      />
    </span>
  );
}
