// The resize dialog: the figure selected's width and height in whole pixels, kept in proportion
// while locked. A size below one pixel, or wider than the page's content, is explained under its
// field and keeps Apply disabled; applying a size leaves the fit to the page's width.

import { Checkbox } from '@flamboyantengineer/ui-components/checkbox';
import { NumberField } from '@flamboyantengineer/ui-components/number-field';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { useState } from 'react';
import { laidOutFigureSize, setFigureSize } from '../../engine/index.js';
import { applying, type DialogProps, EditorModal, selectedNode, titleOf } from './dialog-parts.js';
import {
  figureBounds,
  figureSideProblem,
  type FigureSize,
  RESIZE_BOUNDS,
  sizeRatio,
  typeFigureSide,
} from './figure-size.js';

// The size the dialog starts at: the figure's own, else the size it is laid out at.
function startSize(view: DialogProps['view'], node: ProseMirrorNode | null): FigureSize {
  const side = (name: string) => {
    const value: unknown = node?.attrs[name];
    return typeof value === 'number' ? value : null;
  };
  const own = { width: side('width'), height: side('height') };
  if (own.width !== null && own.height !== null) return own;
  const { from } = view.state.selection;
  const drawn = node ? laidOutFigureSize(view, from) : null;
  return drawn ?? own;
}

/** Resizes the figure selected. */
export function FigureResizeDialog({ view, labels, onClose }: DialogProps) {
  const [node] = useState(() => selectedNode(view.state, ['figure']));
  const [bounds] = useState(() => figureBounds(view, RESIZE_BOUNDS));
  const [size, setSize] = useState(() => startSize(view, node));
  const [ratio] = useState(() => sizeRatio(size));
  const [locked, setLocked] = useState(true);
  const problems = {
    width: figureSideProblem('width', size.width, bounds),
    height: figureSideProblem('height', size.height, bounds),
  };
  const type = (side: 'width' | 'height') => (value: number | null) =>
    setSize((current) => typeFigureSide(current, { side, value }, { locked, ratio }));
  const issue = (side: 'width' | 'height') => {
    const problem = problems[side];
    return problem
      ? { severity: 'error' as const, message: labels.figureSizeProblem(problem) }
      : null;
  };
  const complete = size.width !== null && size.height !== null;
  return (
    <EditorModal
      view={view}
      onClose={onClose}
      data-dialog="figure-size"
      title={titleOf(labels.resizeFigureTitle)}
      primaryAction={applying(view, {
        label: labels.applyAction,
        command: setFigureSize({ width: size.width ?? 0, height: size.height ?? 0 }),
        isDisabled: !complete || problems.width !== null || problems.height !== null,
      })}
    >
      <NumberField
        label={labels.width}
        description={
          Number.isFinite(bounds.maxWidth) ? labels.figureMaxWidth(bounds.maxWidth) : undefined
        }
        autoFocus
        tracksChanges={false}
        value={size.width}
        validate={() => issue('width')}
        onChange={type('width')}
      />
      <NumberField
        label={labels.height}
        tracksChanges={false}
        value={size.height}
        validate={() => issue('height')}
        onChange={type('height')}
      />
      <Checkbox isSelected={locked} onChange={setLocked}>
        {labels.keepProportions}
      </Checkbox>
    </EditorModal>
  );
}
