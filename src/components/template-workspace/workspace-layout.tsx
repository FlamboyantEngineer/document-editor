// The workspace's own layout: a band of the scope tabs with the template actions at its end, the
// messages, then, in the tabs' panel, the preview of the tab shown beside a side panel at the end
// edge, whose Properties and History tabs stay mounted. The panel starts collapsed to its rail,
// remembers the tab last shown in the provider's storage, and opens as a drawer in a narrow frame.

import { AdjustmentsGlyph, HistoryGlyph, type Key } from '@flamboyantengineer/ui-components/core';
import { DockPanel, DockPanelPane } from '@flamboyantengineer/ui-components/dock-panel';
import { workspaceHooks } from './template-workspace-hooks.js';
import type { TemplateWorkspaceParts } from './template-workspace-types.js';
import type { TemplateWorkspaceLabels } from './workspace-labels.js';

/** The side panel's panes. */
export type WorkspacePane = 'properties' | 'history';

/** The side panel's state, which the workspace holds. */
export interface WorkspacePanelState {
  readonly pane: WorkspacePane;
  readonly onPaneChange: (pane: WorkspacePane) => void;
  readonly isExpanded: boolean;
  readonly onExpandedChange: (isExpanded: boolean) => void;
}

/** Below this frame width the panel's pane opens as a drawer. */
const DRAWER_BELOW = 760;

const paneOf = (key: Key): WorkspacePane => (key === 'history' ? 'history' : 'properties');

/** The workspace's own layout of its parts. */
export function WorkspaceLayout({
  parts,
  panel,
  labels,
}: {
  parts: TemplateWorkspaceParts;
  panel: WorkspacePanelState;
  labels: TemplateWorkspaceLabels;
}) {
  return (
    <>
      <div {...workspaceHooks.slot('band')} role="group" aria-label={labels.band}>
        {parts.tabs}
        {parts.toolbar}
      </div>
      {parts.messages}
      {parts.panel(
        <div {...workspaceHooks.slot('body')}>
          {parts.preview}
          <DockPanel
            {...workspaceHooks.slot('panel')}
            label={labels.panel}
            position="end"
            selectedKey={panel.pane}
            onSelectionChange={(key) => panel.onPaneChange(paneOf(key))}
            isExpanded={panel.isExpanded}
            onExpandedChange={panel.onExpandedChange}
            defaultSize={320}
            minSize={260}
            maxSize={520}
            overlayBelow={DRAWER_BELOW}
          >
            <DockPanelPane id="properties" label={labels.properties} icon={AdjustmentsGlyph}>
              {parts.properties}
            </DockPanelPane>
            <DockPanelPane id="history" label={labels.history} icon={HistoryGlyph}>
              {parts.history}
            </DockPanelPane>
          </DockPanel>
        </div>,
      )}
    </>
  );
}
