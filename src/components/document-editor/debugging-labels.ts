// The text of the layout debugging: its pane beside the pages, the pane's resize handle and the
// words of the tooltip a hovered block shows.

/** The text of the layout debugging. */
export interface DebuggingLabels {
  /** Names the pane beside the pages that shows the pages' markup. */
  readonly debugPane: string;
  /** Names the handle that resizes the debugging pane. */
  readonly debugPaneResize: string;
  /** Heads a hovered block's size with its margins in its tooltip. */
  readonly debugWithMargins: string;
  /** Heads a hovered block's place on its page in its tooltip. */
  readonly debugPosition: string;
}

/** The library's text of the layout debugging. */
export const DEFAULT_DEBUGGING_LABELS: DebuggingLabels = {
  debugPane: 'Layout debugging',
  debugPaneResize: 'Resize the layout debugging',
  debugWithMargins: 'With margins',
  debugPosition: 'At',
};
