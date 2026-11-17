// The toolbar's button that places one of the host's images in a template's own content: a
// header, a footer, or a section's content or placeholder edited in place. It opens the host's
// images in a popover and places the one chosen; it is disabled where no image can go.

import { Button } from '@flamboyantengineer/ui-components/button';
import { ImageGlyph } from '@flamboyantengineer/ui-components/core';
import { Popover, PopoverTrigger } from '@flamboyantengineer/ui-components/popover';
import { lazy, Suspense } from 'react';
import { insertTemplateImage } from '../../engine/index.js';
import type { AssetAdapter } from '../../host/index.js';
import { type EditorContext, unavailableReason } from './editor-context.js';
import type { InsertFeatures } from './insert-controls.js';
import { usePopoverCommand } from './popover-command.js';
import type { ToolbarItem } from './toolbar-items.js';

// The picker loads the first time the popover opens (DOCE-ENTRY-2.2).
const TemplateImagePicker = /* @__PURE__ */ lazy(async () => ({
  default: (await import('./template-image-picker.js')).TemplateImagePicker,
}));

// Whether an image can go at the selection: a probe asset stands in for the one to choose.
const PROBE = insertTemplateImage({ id: 'probe', name: '', mediaType: '' });

/** The button and the popover of the host's images it opens. */
function TemplateImageButton({
  context,
  search,
}: {
  context: EditorContext;
  search: NonNullable<AssetAdapter['search']>;
}) {
  const { isOpen, setOpen, choose } = usePopoverCommand(context);
  const { labels } = context;
  const isDisabled = !context.canRun(PROBE);
  const reason = isDisabled ? unavailableReason(context) : undefined;
  const label = labels.insertImageAsset;
  return (
    <PopoverTrigger isOpen={isOpen && !isDisabled} onOpenChange={setOpen}>
      <Button
        data-item="image-asset"
        label={label}
        tooltip={reason === undefined ? label : `${label}: ${reason}`}
        size="sm"
        icon={ImageGlyph}
        isDisabled={isDisabled}
        focusableWhenDisabled={reason !== undefined}
      />
      <Popover placement="bottom start" aria-label={label} isNonModal>
        <Suspense fallback={null}>
          <TemplateImagePicker
            label={label}
            search={search}
            onCancel={() => setOpen(false)}
            onChoose={(asset) => choose(insertTemplateImage(asset))}
          />
        </Suspense>
      </Popover>
    </PopoverTrigger>
  );
}

/** The button that places one of the host's images, while a template's own content is edited. */
export function imageAssetItem({ imageSearch, templateContent }: InsertFeatures): ToolbarItem {
  return {
    kind: 'custom',
    id: 'image-asset',
    isVisible: () => Boolean(templateContent && imageSearch),
    render: (context) =>
      imageSearch ? <TemplateImageButton context={context} search={imageSearch} /> : null,
  };
}
