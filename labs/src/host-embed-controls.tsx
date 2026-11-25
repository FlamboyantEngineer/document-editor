// The host services lab's controls for embeds a host pins and for the linked spreadsheet, and the
// math typesetter that can stop answering: the context menu entries a host offers on an embed
// (`ContextTarget.embed`), taking its update, pinning it to the state it shows, repinning it and
// letting it follow its content again; the spreadsheet service's controls; and the typesetter the
// editing waits for (`math`), within the lab's timeout.

import { renderKatexMath } from '@flamboyantengineer/ui-components/math-preview';
import type { EditorView } from 'prosemirror-view';
import type { DocumentContextMenuOptions } from '../../src/components/index.js';
import {
  type EditingMathOptions,
  insertEmbed,
  setEmbedPinned,
  updateEmbed,
} from '../../src/engine/index.js';
import type { EmbedSourceAdapter } from '../../src/host/index.js';
import type { createSpreadsheetService } from './host-data.js';

/** The context menu entries a host offers on the embed the menu opens on. */
export function embedMenu(source: EmbedSourceAdapter): DocumentContextMenuOptions {
  return {
    providers: [
      {
        id: 'host-embed',
        placement: 'leading',
        entries: (target, context) => {
          const { embed } = target;
          const view = context.view;
          if (!embed || !view || !target.editable) return [];
          const pos = embed.pos;
          const pin = (pinned: boolean) => () => {
            setEmbedPinned(pos, pinned)(view.state, view.dispatch);
          };
          if (embed.node.attrs.pinned === true) {
            return [
              {
                id: 'embed-repin',
                label: "Repin at the host's content",
                onAction: () => void updateEmbed(view, source, { pos }),
              },
              {
                id: 'embed-unpin',
                label: 'Let this embed follow its content',
                onAction: pin(false),
              },
            ];
          }
          return [
            {
              id: 'embed-update',
              label: "Take this embed's update",
              onAction: () => void updateEmbed(view, source, { pos }),
            },
            { id: 'embed-pin', label: 'Pin this embed at its state', onAction: pin(true) },
          ];
        },
      },
    ],
  };
}

type SheetService = ReturnType<typeof createSpreadsheetService>;

/** The linked spreadsheet's controls: insert its range, and change, recalculate or deny it. */
export function SheetControls({
  sheet,
  view,
}: {
  readonly sheet: SheetService;
  readonly view: EditorView | null;
}) {
  const now = sheet.describe();
  const insert = () => {
    const embed = sheet.insertable();
    if (!view || !embed) return;
    insertEmbed(embed)(view.state, view.dispatch);
    view.focus();
  };
  return (
    <fieldset>
      <legend>Linked spreadsheet (host)</legend>
      <span aria-label="Spreadsheet state">
        Budget, Summary A1:B4, revision {now.revision}
        {now.calculating ? ', recalculating' : ''}
        {now.denied ? ', access denied' : ''}
      </span>{' '}
      <button type="button" onClick={insert} disabled={now.calculating}>
        Insert the budget range
      </button>{' '}
      <button type="button" onClick={sheet.changeCost}>
        Change the cabling cost at the host
      </button>{' '}
      <button type="button" onClick={sheet.toggleCalculating}>
        {now.calculating ? 'Finish recalculating' : 'Recalculate at the host'}
      </button>{' '}
      <button type="button" onClick={sheet.toggleDenied}>
        {now.denied ? 'Allow access to the budget' : 'Deny access to the budget'}
      </button>
    </fieldset>
  );
}

// Whether the lab's typesetter answers; read on each typesetting.
const typesetter = { answers: true };

/** The editing's math: the base library's typesetter, unless the lab makes it stop answering. */
export const LAB_MATH: EditingMathOptions = {
  render: (source, options) =>
    typesetter.answers ? renderKatexMath(source, options) : new Promise(() => undefined),
  timeout: 3000,
  timeoutMessage: 'The lab typesetter did not answer',
};

/** Makes the typesetter stop answering, and inserts math for it to typeset. */
export function MathControls({ view }: { readonly view: EditorView | null }) {
  const insertMath = () => {
    const type = view?.state.schema.nodes.math_inline;
    if (!view || !type) return;
    const count = view.state.doc.nodeSize;
    view.dispatch(
      view.state.tr.replaceSelectionWith(
        type.create(null, view.state.schema.text(`x^{${String(count)}}`)),
      ),
    );
    view.focus();
  };
  return (
    <fieldset>
      <legend>Math typesetter (host)</legend>
      <label>
        <input
          type="checkbox"
          defaultChecked
          onChange={(event) => {
            typesetter.answers = event.currentTarget.checked;
          }}
        />{' '}
        The typesetter answers
      </label>{' '}
      <button type="button" onClick={insertMath}>
        Insert math
      </button>
    </fieldset>
  );
}
