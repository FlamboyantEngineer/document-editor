import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { installEditorDom } from '../../../test/editor-dom.js';
import { LOADED, nameField, saveButton, SLOW, storeOf } from '../../../test/template-workspace.js';
import { TemplateWorkspace } from './template-workspace.js';

installEditorDom();

describe('TemplateWorkspace drafts', () => {
  it(
    'DOCE-TEMPLATE-EDITOR-1.13 holds Save while a setting’s draft is not valid, and saves it once corrected',
    async () => {
      const user = userEvent.setup();
      const store = storeOf({ formatVersion: 1, id: 'report', name: 'Report' });
      render(<TemplateWorkspace store={store} defaultTemplateId="report" defaultPanelExpanded />);
      await nameField();
      const settings = screen.getByRole('region', { name: 'Document settings' });
      const top = within(settings).getByRole('textbox', { name: 'Top margin' });
      await user.clear(top);
      await user.type(top, '1x');
      await user.tab();
      expect(saveButton()).toBeDisabled();
      await user.clear(top);
      await user.type(top, '12');
      // Pressing Save commits the field's draft as focus leaves it, then saves it.
      await user.click(saveButton());
      await waitFor(async () => {
        const loaded = await store.load('report');
        expect(loaded.ok && loaded.value.template.page?.margins?.top).toBe('12mm');
      }, LOADED);
    },
    SLOW,
  );
});
