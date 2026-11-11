// The full editor lab's side panels: the outline and search at the document's start, and at its
// end the properties, then two panes the host adds of its own: the document's comments, and the
// document's record (its title, number and revision), which the host keeps outside the document.

import { ChatBubbleCheckGlyph, FileTextGlyph } from '@flamboyantengineer/ui-components/core';
import {
  PropertyPanel,
  PropertyRow,
  PropertySection,
} from '@flamboyantengineer/ui-components/property-panel';
import { TextField } from '@flamboyantengineer/ui-components/text-field';
import { useState } from 'react';
import {
  DocumentCommentsPanel,
  type DocumentPane,
  DocumentSidePanel,
} from '../../src/components/index.js';
import type { CommentStoreAdapter, IdentityAdapter } from '../../src/host/index.js';
import type { TemplateFile } from '../../src/model/index.js';

// The document's record as the host keeps it, edited in its own pane.
function RecordPane() {
  const [record, setRecord] = useState({
    title: 'Sample document',
    number: 'SD-100',
    revision: 'B',
  });
  const field = (key: keyof typeof record, label: string) => (
    <PropertyRow label={label}>
      <TextField
        label={label}
        labelLayout="control-only"
        size="sm"
        density="compact"
        tracksChanges={false}
        value={record[key]}
        onChange={(value) => setRecord((current) => ({ ...current, [key]: value }))}
      />
    </PropertyRow>
  );
  return (
    <PropertyPanel>
      <PropertySection id="record" title="Record">
        {field('title', 'Title')}
        {field('number', 'Number')}
        {field('revision', 'Revision')}
      </PropertySection>
    </PropertyPanel>
  );
}

/** The lab's two side panels, given what the comments pane lists. */
export function labPanels({
  template,
  comments,
  identity,
}: {
  template: TemplateFile;
  comments: CommentStoreAdapter | undefined;
  identity: IdentityAdapter;
}) {
  const hostPanes: DocumentPane[] = [
    ...(comments
      ? [
          {
            id: 'comments',
            label: 'Comments',
            icon: ChatBubbleCheckGlyph,
            render: () => (
              <DocumentCommentsPanel store={comments} documentId="full" identity={identity} />
            ),
          },
        ]
      : []),
    { id: 'record', label: 'Record', icon: FileTextGlyph, render: () => <RecordPane /> },
  ];
  return {
    start: <DocumentSidePanel position="start" panes={['outline', 'search']} template={template} />,
    end: (
      <DocumentSidePanel position="end" panes={['properties', ...hostPanes]} template={template} />
    ),
  };
}
