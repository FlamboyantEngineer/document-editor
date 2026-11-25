// The hooks a node a host's layout rule sized is drawn with (DOCE-PAGINATION-14.2): the box the
// engine laid it out at, which the reference stylesheet gives it exactly, clipping what it draws,
// so a drawing never moves the pages. The editor's pages, a viewer and a print draw the same hooks.

/** A sized node's box: an inline node's width, height and baseline from its top, or a block's. */
interface ObjectBoxSize {
  readonly inline: boolean;
  readonly width: number;
  readonly height: number;
  readonly baseline: number;
}

const px = (value: number) => `${value.toFixed(3)}px`;

/** The hooks a sized node is drawn in its box with: its kind and its box's lengths. */
export function objectBoxHooks(box: ObjectBoxSize): {
  class: string;
  'data-object-box': string;
  style: string;
} {
  const lengths = [`--de-object-height: ${px(box.height)}`];
  if (box.inline)
    lengths.push(
      `--de-object-width: ${px(box.width)}`,
      `--de-object-baseline: ${px(box.baseline)}`,
    );
  return {
    class: 'de-object-box',
    'data-object-box': box.inline ? 'inline' : 'block',
    style: lengths.join('; '),
  };
}
