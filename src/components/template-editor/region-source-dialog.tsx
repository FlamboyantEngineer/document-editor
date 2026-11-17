// The dialog of a header's or footer's HTML source, loaded when it first opens: the content as the
// markup its blocks write, in a code editor, read back through the schema when applied.

import { CodeEditor } from '@flamboyantengineer/ui-components/code-editor';
import { Modal } from '@flamboyantengineer/ui-components/modal';
import { useState } from 'react';
import {
  createDocumentSchema,
  readHtmlContent,
  type StoredContent,
  writeHtmlContent,
} from '../../model/index.js';

/** What the dialog shows and where its content goes. */
interface RegionSourceDialogProps {
  readonly title: string;
  readonly fieldLabel: string;
  readonly applyLabel: string;
  readonly content: StoredContent;
  /** The document the button is in, whose implementation parses the markup inertly. */
  readonly owner: Document;
  readonly onApply: (content: StoredContent) => void;
  readonly onClose: () => void;
}

/** The HTML of a region in a code editor, applied as stored content the schema reads. */
export function RegionSourceDialog({
  title,
  fieldLabel,
  applyLabel,
  content,
  owner,
  onApply,
  onClose,
}: RegionSourceDialogProps) {
  const [schema] = useState(createDocumentSchema);
  const [html, setHtml] = useState(() => writeHtmlContent(content, schema, owner));
  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="lg"
      title={title}
      primaryAction={{
        label: applyLabel,
        onPress: (close) => {
          onApply(readHtmlContent(html, schema, owner));
          close();
        },
      }}
    >
      <CodeEditor
        label={fieldLabel}
        language="html"
        autoFocus
        tracksChanges={false}
        size="lg"
        value={html}
        onChange={setHtml}
      />
    </Modal>
  );
}
