// Opens the collapsed sections of a property panel, as a person does, so a test reaches their rows.

import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/** Opens every collapsed section, or only those whose titles start with one of `titles`. */
export async function openSections(user: UserEvent, ...titles: string[]): Promise<void> {
  for (const heading of screen.getAllByRole('heading')) {
    const trigger = within(heading).queryByRole('button', { expanded: false });
    const title = trigger?.textContent?.trim() ?? '';
    if (trigger && (titles.length === 0 || titles.some((one) => title.startsWith(one)))) {
      await user.click(trigger);
    }
  }
}
