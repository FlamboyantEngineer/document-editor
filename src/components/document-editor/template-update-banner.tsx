// The editor's offer to move a document to a newer saved revision of its template: a banner while
// the session names one, whose action moves the document to it and then brings the sections the
// writer cannot edit in line with it, in one step for the reader.

import { Button } from '@flamboyantengineer/ui-components/button';
import type { EditorView } from 'prosemirror-view';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { syncTemplateSections } from '../../engine/template-sync.js';
import type { TemplateFile } from '../../model/index.js';
import type { DocumentBanner } from './banners.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import type { EditorSession, EditorSessionDocument } from './save-status-item.js';
import { runCommand } from './table-actions.js';

const NO_DOCUMENT = {
  subscribe: () => () => undefined,
  get: (): EditorSessionDocument | null => null,
};

interface TemplateUpdateOptions {
  readonly session?: EditorSession | undefined;
  readonly view: EditorView | null;
  readonly template: TemplateFile;
  readonly editable: boolean;
  readonly labels: DocumentEditorLabels;
}

// Once the document has moved, the template it is shown with next is the new one: its sections
// are brought in line with it then.
function useSyncOnNextTemplate(view: EditorView | null, template: TemplateFile) {
  const pending = useRef<TemplateFile | null>(null);
  useEffect(() => {
    const before = pending.current;
    if (!view || !before || before === template) return;
    pending.current = null;
    runCommand(view, syncTemplateSections(template));
  }, [view, template]);
  return (current: TemplateFile) => {
    pending.current = current;
  };
}

/**
 * The banner offering a newer revision of the document's template, while the reader can edit and
 * the session names one (`templateUpdate`); null otherwise.
 */
export function useTemplateUpdateBanner({
  session,
  view,
  template,
  editable,
  labels,
}: TemplateUpdateOptions): DocumentBanner | null {
  const store = session?.document ?? NO_DOCUMENT;
  const document = useSyncExternalStore(store.subscribe, store.get, store.get);
  const [moving, setMoving] = useState(false);
  const syncNext = useSyncOnNextTemplate(view, template);
  const update = document?.templateUpdate;
  const pin = document?.pin;
  const setTemplate = session?.setTemplate;
  if (!editable || !update || !pin || !setTemplate) return null;
  const move = () => {
    setMoving(true);
    syncNext(template);
    setTemplate({ id: pin.id, revision: update.revision })
      .catch(() => false)
      .finally(() => setMoving(false));
  };
  return {
    id: 'template-update',
    tone: 'info',
    title: labels.templateUpdated,
    actions: (
      <Button size="sm" isDisabled={!view || moving} onPress={move}>
        {labels.updateTemplate}
      </Button>
    ),
  };
}
