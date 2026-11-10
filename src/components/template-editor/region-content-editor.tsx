// Editing the content of a template's header or footer as a document: a dialog holding a document
// editor over the region's stored content, written back to the template when applied.

import { Button } from '@flamboyantengineer/ui-components/button';
import { Modal } from '@flamboyantengineer/ui-components/modal';
import { PropertyRow } from '@flamboyantengineer/ui-components/property-panel';
import { EditorState } from 'prosemirror-state';
import { useMemo, useState } from 'react';
import { createDocumentEditing } from '../../engine/index.js';
import {
  createDocumentSchema,
  readDocumentFile,
  type StoredContent,
  type TemplateFile,
  writeDocumentFile,
} from '../../model/index.js';
import { DocumentEditor } from '../document-editor/document-editor.js';

/** The region editor's text. */
export interface RegionContentLabels {
  /** Names the button and the dialog of a region's content. */
  readonly regionContent: (region: 'header' | 'footer') => string;
  readonly apply: string;
}

// An editor state over a region's content, as one section of a document.
function stateOf(content: StoredContent | null | undefined, template: TemplateFile): EditorState {
  const schema = createDocumentSchema();
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content: content ?? [] }] },
    schema,
  );
  return EditorState.create({
    doc,
    plugins: createDocumentEditing(schema, { template: () => template }),
  });
}

function RegionDialog({
  region,
  content,
  template,
  labels,
  onApply,
  onClose,
}: {
  region: 'header' | 'footer';
  content: StoredContent | null | undefined;
  template: TemplateFile;
  labels: RegionContentLabels;
  onApply: (content: StoredContent) => void;
  onClose: () => void;
}) {
  const initial = useMemo(() => stateOf(content, template), [content, template]);
  const [state, setState] = useState(initial);
  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      data-dialog={`${region}-content`}
      size="lg"
      title={labels.regionContent(region)}
      primaryAction={{
        label: labels.apply,
        onPress: (close) => {
          onApply(writeDocumentFile(state.doc).sections[0]?.content ?? []);
          close();
        },
      }}
    >
      <DocumentEditor
        state={state}
        onStateChange={setState}
        template={template}
        layout="web"
        toolbar
        aria-label={labels.regionContent(region)}
      />
    </Modal>
  );
}

/** A row that opens the editor of a header's or footer's content. */
export function RegionContentRow({
  region,
  content,
  template,
  labels,
  onChange,
  isDisabled,
}: {
  region: 'header' | 'footer';
  content: StoredContent | null | undefined;
  template: TemplateFile;
  labels: RegionContentLabels;
  onChange: (content: StoredContent) => void;
  isDisabled?: boolean | undefined;
}) {
  const [isOpen, setOpen] = useState(false);
  return (
    <PropertyRow label={labels.regionContent(region)}>
      <Button size="sm" isDisabled={isDisabled} onPress={() => setOpen(true)}>
        {labels.regionContent(region)}
      </Button>
      {isOpen ? (
        <RegionDialog
          region={region}
          content={content}
          template={template}
          labels={labels}
          onApply={onChange}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </PropertyRow>
  );
}
