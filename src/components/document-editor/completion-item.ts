// The inline completion toggle (`inline-completion`): a toolbar item a host adds where it offers
// completion, pressed while completion is on, and unavailable, with the provider's reason, while
// the provider cannot be asked.

import { SparklesGlyph } from '@flamboyantengineer/ui-components/core';
import { completionStatus, setInlineCompletionEnabled } from '../../engine/inline-completion.js';
import { DEFAULT_EDITOR_LABELS, type DocumentEditorLabels } from './editor-labels.js';
import type { ToolbarButtonItem } from './toolbar-items.js';

/**
 * The inline completion toggle, for the toolbar's `items`: shown while the document runs inline
 * completion (`createInlineCompletion`), it turns completion on and off.
 */
export function inlineCompletionItem(
  labels: DocumentEditorLabels = DEFAULT_EDITOR_LABELS,
  group = 'mode',
): ToolbarButtonItem {
  return {
    kind: 'button',
    id: 'inline-completion',
    group,
    label: labels.inlineCompletion,
    icon: SparklesGlyph,
    isVisible: (context) => completionStatus(context.state) !== null,
    isPressed: (context) => completionStatus(context.state)?.enabled === true,
    isEnabled: (context) => completionStatus(context.state)?.availability.available === true,
    disabledReason: (context) => {
      const availability = completionStatus(context.state)?.availability;
      return availability && !availability.available
        ? availability.reason
        : labels.reasonCompletionUnavailable;
    },
    run: (context) => {
      const enabled = completionStatus(context.state)?.enabled === true;
      context.run(setInlineCompletionEnabled(!enabled));
    },
  };
}
