// The full editor lab's side panels: the outline and search at the document's start, and at its
// end the properties (with a row, an action and a section the host adds), the editor's comments,
// the contributors, then a pane the host adds of its own: the document's record (its title, number
// and revision), which the host keeps outside the document. Buttons reveal panes through the
// editor's handle.

import { Button } from '@flamboyantengineer/ui-components/button';
import { FileTextGlyph } from '@flamboyantengineer/ui-components/core';
import {
  PropertyPanel,
  PropertyRow,
  PropertySection,
} from '@flamboyantengineer/ui-components/property-panel';
import { TextField } from '@flamboyantengineer/ui-components/text-field';
import { type RefObject, useState } from 'react';
import {
  type DocumentEditorHandle,
  type DocumentPropertiesProps,
  DocumentSidePanel,
} from '../../src/components/index.js';
import { revealElement } from '../../src/engine/index.js';
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

// What the host adds to the properties pane: the caret block's characters, a button that takes
// the reader to that block, and a section of its own.
const PROPERTIES: Pick<DocumentPropertiesProps, 'sections' | 'extend'> = {
  sections: [
    'document',
    'section',
    'selection',
    {
      id: 'review',
      title: 'Review',
      render: () => <PropertyRow label="Status">Draft</PropertyRow>,
    },
  ],
  extend: {
    selection: {
      renderRows: (context) => (
        <PropertyRow label="Characters">
          {context.state.selection.$head.parent.textContent.length}
        </PropertyRow>
      ),
      renderActions: (context) => (
        <Button
          size="sm"
          variant="ghost"
          onPress={() => {
            const id: unknown = context.state.selection.$head.parent.attrs.dataId;
            if (context.view && typeof id === 'string') revealElement(context.view, id);
          }}
        >
          Show
        </Button>
      ),
    },
  },
};

/** The lab's two side panels; the contributors pane shows and hides authorship. */
export function labPanels({
  template,
  onAuthorshipChange,
}: {
  template: TemplateFile;
  onAuthorshipChange: (shown: boolean) => void;
}) {
  return {
    start: <DocumentSidePanel position="start" panes={['outline', 'search']} template={template} />,
    end: (
      <DocumentSidePanel
        position="end"
        panes={[
          'properties',
          'comments',
          'contributors',
          { id: 'record', label: 'Record', icon: FileTextGlyph, render: () => <RecordPane /> },
        ]}
        template={template}
        properties={PROPERTIES}
        onAuthorshipChange={onAuthorshipChange}
      />
    ),
  };
}

/** Buttons revealing panes through the editor's handle, and whether the last reveal found one. */
export function RevealPanes({ handle }: { handle: RefObject<DocumentEditorHandle | null> }) {
  const [found, setFound] = useState('');
  const reveal = (paneId: string) => {
    setFound(handle.current?.revealPane(paneId) ? `Revealed ${paneId}` : `No ${paneId} pane`);
  };
  return (
    <fieldset>
      <legend>Panes</legend>
      <button type="button" onClick={() => reveal('comments')}>
        Reveal comments
      </button>
      <button type="button" onClick={() => reveal('contributors')}>
        Reveal contributors
      </button>
      <button type="button" onClick={() => reveal('search')}>
        Reveal search
      </button>
      <output aria-label="Pane reveal">{found}</output>
    </fieldset>
  );
}
