import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Harness, thread } from '../../../test/comment-fixtures.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createMemoryHost, type MentionsAdapter, type MentionTarget } from '../../host/index.js';

installEditorDom();

const TARGETS: readonly MentionTarget[] = [
  { kind: 'group', id: 'reviewers', name: 'Reviewers', count: 3 },
  { kind: 'assistant', id: 'helper', name: 'Helper' },
];

// The host's own token, `<kind:id|Name>`, read back by a pattern.
const TOKEN = /<(\w+):([\w-]+)\|([^>]+)>/g;

const mentions: MentionsAdapter = {
  find: (query) =>
    Promise.resolve(
      TARGETS.filter((each) => each.name.toLowerCase().startsWith(query.toLowerCase())),
    ),
  serialize: (target) => `<${target.kind}:${target.id}|${target.name}>`,
  parse: (text) => {
    const runs: ReturnType<NonNullable<MentionsAdapter['parse']>>[number][] = [];
    let at = 0;
    for (const match of text.matchAll(TOKEN)) {
      const [raw, kind = '', id = '', name = ''] = match;
      if (match.index > at) runs.push({ kind: 'text', text: text.slice(at, match.index) });
      runs.push({ kind: 'mention', text: raw, id, name, mentionKind: kind });
      at = match.index + raw.length;
    }
    if (at < text.length) runs.push({ kind: 'text', text: text.slice(at) });
    return runs;
  },
  includes: (target, person) => target.kind === 'group' && person === 'ada',
};

const store = () =>
  createMemoryHost({
    person: { id: 'ada', name: 'Ada Lovelace' },
    people: [{ id: 'grace', name: 'Grace Hopper' }],
    comments: {
      threads: {
        doc: [
          {
            ...thread('open', 'open', ''),
            entries: [
              {
                id: 'open-1',
                author: 'grace',
                text: 'Over to <group:reviewers|Reviewers>',
                createdAt: '2026-01-02T03:04:05Z',
              },
            ],
          },
        ],
      },
    },
  });

describe('Comment mentions', () => {
  it('DOCE-COMMENTS-4.10 DOCE-HOST-1.21 mentions a group in the host’s token format, shown as its chip', async () => {
    const user = userEvent.setup();
    const host = store();
    render(<Harness host={host} options={{ mentions }} />);
    const margin = screen.getByRole('list', { name: 'Comments' });
    expect(await within(margin).findByText('Reviewers')).toBeInTheDocument();
    expect(within(margin).queryByText(/<group:/)).not.toBeInTheDocument();
    const card = within(margin).getByRole('group', { name: 'Comment thread' });
    await user.click(within(card).getByRole('textbox', { name: 'Reply' }));
    await user.keyboard('Ask @Hel');
    await user.click(await screen.findByRole('option', { name: /Helper/ }));
    await user.click(within(card).getByRole('button', { name: 'Reply' }));
    expect(await within(card).findByText('Helper')).toBeInTheDocument();
    const listed = await host.comments?.list('doc');
    expect(listed?.ok && listed.value[0]?.entries[1]?.text).toBe('Ask <assistant:helper|Helper>');
  });

  it('DOCE-COMMENTS-4.10 counts a thread mentioning a group that includes the reader as theirs', async () => {
    render(<Harness host={store()} options={{ mentions }} panel={{ mentions }} />);
    const panel = screen.getByRole('region', { name: 'All comments' });
    await within(panel).findByText('Reviewers');
    // The thread that mentions the reader's group, and her own suggestion.
    expect(within(panel).getByRole('radio', { name: /Mine.*2/ })).toBeInTheDocument();
  });
});
