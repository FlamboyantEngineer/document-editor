// The HTML source of the header and the footer, each edited in a dialog with a code editor beside
// the in-place editing: the scope's own content, or the one it inherits while it has none, as the
// markup its blocks write. Applying reads the markup as pasted content is read, through the schema,
// so nothing the schema does not know survives, and sets it as the scope's own content. A region
// that takes its parent's has no source of its own to edit.

import { Button } from '@flamboyantengineer/ui-components/button';
import { CodeGlyph } from '@flamboyantengineer/ui-components/core';
import { PropertyRow } from '@flamboyantengineer/ui-components/property-panel';
import { useState } from 'react';
import type { StoredContent } from '../../model/index.js';
import type { RegionSourceDialog } from './region-source-dialog.js';
import type { Rows } from './template-rows.js';
import { settingAt } from './template-settings.js';

/** The text of the header's and footer's HTML source. */
export interface RegionSourceLabels {
  /** Names a region's source row and its button, by the region's name. */
  readonly regionSource: (region: string) => string;
  readonly regionSourceField: string;
  readonly applyRegionSource: string;
  readonly regionNames: Readonly<Record<RegionKey, string>>;
}

/** The English text of the header's and footer's HTML source. */
export const DEFAULT_REGION_SOURCE_LABELS: RegionSourceLabels = {
  regionSource: (region) => `${region} HTML`,
  regionSourceField: 'HTML',
  applyRegionSource: 'Apply',
  regionNames: { header: 'Header', footer: 'Footer' },
};

type RegionKey = 'header' | 'footer';

// The dialog, loaded on first use. It opens once loaded, drawn at once rather than suspended, so
// opening it waits only for the import.
type Dialog = typeof RegionSourceDialog;
let loadedDialog: Dialog | undefined;
const loadDialog = async (): Promise<Dialog> =>
  (loadedDialog ??= (await import('./region-source-dialog.js')).RegionSourceDialog);

// The content a region shows: the scope's own, else the one it inherits.
function shownContent({ target }: Rows, key: RegionKey): StoredContent {
  const own = settingAt(target.own, [key, 'content']);
  const inherited = target.inherited ? settingAt(target.inherited, [key, 'content']) : undefined;
  return ((own ?? inherited) as StoredContent | undefined) ?? [];
}

function RegionSourceRow({ context, region }: { context: Rows; region: RegionKey }) {
  const { labels, target, props } = context;
  // The document the dialog parses in, while it is open.
  const [owner, setOwner] = useState<Document | null>(null);
  const Dialog = loadedDialog;
  const name = labels.regionSource(labels.regionNames[region]);
  const inherits = settingAt(target.own, [region, 'inherit']) === true;
  return (
    <PropertyRow label={name}>
      <Button
        size="sm"
        variant="ghost"
        icon={CodeGlyph}
        label={name}
        tooltip={name}
        isDisabled={props.isDisabled === true || inherits}
        onPress={(event) => {
          const document = event.target.ownerDocument;
          void loadDialog().then(() => setOwner(document));
        }}
      />
      {owner && Dialog ? (
        <Dialog
          title={name}
          fieldLabel={labels.regionSourceField}
          applyLabel={labels.applyRegionSource}
          content={shownContent(context, region)}
          owner={owner}
          onApply={(content) => target.set([region, 'content'], content)}
          onClose={() => setOwner(null)}
        />
      ) : null}
    </PropertyRow>
  );
}

/** The header's and footer's HTML source rows, at the end of the Header & footer section. */
export function RegionSourceRows({ context }: { context: Rows }) {
  return (
    <>
      <RegionSourceRow context={context} region="header" />
      <RegionSourceRow context={context} region="footer" />
    </>
  );
}
