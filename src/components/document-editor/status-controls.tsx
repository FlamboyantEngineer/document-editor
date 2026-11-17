// The status bar's controls: the page status, which opens a field to go to a page by its number,
// and the layout switch between pages and the web layout.

import { Button } from '@flamboyantengineer/ui-components/button';
import { BookOpenGlyph, GlobeGlyph } from '@flamboyantengineer/ui-components/core';
import { NumberField } from '@flamboyantengineer/ui-components/number-field';
import { Popover, PopoverTrigger } from '@flamboyantengineer/ui-components/popover';
import type { EditorView } from 'prosemirror-view';
import { type KeyboardEvent, memo, useRef, useState } from 'react';
import { createHooks } from '../../utils/hooks.js';
import { frameOf, scrollerOf } from '../../utils/scroll-frame.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import type { DocumentLayout } from './use-document-layout.js';

const hooks = createHooks('document-editor', ['layout-toggle']);

/**
 * Scrolls a page of the view to the top of the area scrolling the document, by its number from 1,
 * leaving every area around that one as it is; false when there is no such page.
 */
function scrollToPage(view: EditorView, page: number): boolean {
  const pages = view.dom.querySelectorAll('.pm-page');
  const target = pages[Math.round(page) - 1];
  const scroller = target ? scrollerOf(target) : null;
  if (!target || !scroller) return false;
  const top = scroller.scrollTop + target.getBoundingClientRect().top - frameOf(scroller).top;
  scroller.scrollTo({ top, behavior: 'smooth' });
  return true;
}

/**
 * The page status, which opens a field to go to a page by its number; drawn again only when the
 * page or the count changes (DOCE-EDITOR-1.7).
 */
export const PageJump = memo(function PageJump({
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
  // Escape cancels: the field's commit as it then loses focus goes nowhere.
  const cancelled = useRef(false);
  const open = (next: boolean) => {
    if (next) cancelled.current = false;
    setOpen(next);
  };
  // The field commits the page on Enter, or as it loses focus, which the editor scrolls to.
  const go = (to: number | null) => {
    if (view && to !== null && !cancelled.current) scrollToPage(view, to);
    setOpen(false);
  };
  // Escape stops at the field, so a dialog around the editor stays open.
  const cancel = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    event.preventDefault();
    cancelled.current = true;
    setOpen(false);
  };
  return (
    <PopoverTrigger isOpen={isOpen} onOpenChange={open}>
      <Button size="sm" variant="ghost" tooltip={labels.goToPage}>
        {labels.pageStatus(page, pages)}
      </Button>
      <Popover placement="top start" aria-label={labels.goToPage} isNonModal>
        <span onKeyDownCapture={cancel}>
          <NumberField
            label={labels.goToPage}
            autoFocus
            minValue={1}
            maxValue={pages}
            value={target}
            onChange={setTarget}
            onCommit={go}
          />
        </span>
      </Popover>
    </PopoverTrigger>
  );
});

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
        icon={BookOpenGlyph}
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
