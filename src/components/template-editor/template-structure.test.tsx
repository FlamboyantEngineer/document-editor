import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { TemplateFile } from '../../model/index.js';
import { TemplateEditor, type TemplateEditorProps } from './template-editor.js';
import { TemplateJsonEditor } from './template-json-editor.js';
import { templateText } from './template-json-text.js';
import type { TemplateScope } from './template-scope-state.js';

// The whole editor renders in each test, which takes seconds on a shared CI runner.
const SLOW = 45_000;

const TEMPLATE: TemplateFile = {
  formatVersion: 1,
  id: 'plain',
  sections: [{ name: 'cover' }, { name: 'annex', label: 'Annex' }],
};

// The editor beside a host that holds the template and the scope, recording what it is told.
function Host(
  props: Partial<TemplateEditorProps> & {
    log: { templates: TemplateFile[]; scopes: TemplateScope[]; renames: string[][] };
    initial?: TemplateFile;
    initialScope?: TemplateScope;
  },
) {
  const { log, initial, initialScope, ...rest } = props;
  const [template, setTemplate] = useState(initial ?? TEMPLATE);
  const [scope, setScope] = useState<TemplateScope>(initialScope ?? null);
  return (
    <TemplateEditor
      {...rest}
      template={template}
      scope={scope}
      onScopeChange={(next) => {
        log.scopes.push(next);
        setScope(next);
      }}
      onChange={(next) => {
        log.templates.push(next);
        setTemplate(next);
      }}
      onSectionRename={(from, to) => log.renames.push([from, to])}
    />
  );
}

const newLog = () => ({
  templates: [] as TemplateFile[],
  scopes: [] as TemplateScope[],
  renames: [] as string[][],
});
const names = (template: TemplateFile | undefined) =>
  template?.sections?.map((section) => section.name);

describe('the scope', () => {
  it(
    'DOCE-TEMPLATE-EDITOR-2.1 follows the section by name when the list changes around it',
    () => {
      const log = newLog();
      const { rerender } = render(
        <TemplateEditor template={TEMPLATE} scope="annex" onChange={() => {}} />,
      );
      expect(document.querySelector('.de-template-editor')).toHaveAttribute(
        'data-scope',
        'section',
      );
      expect(screen.getByRole('textbox', { name: 'Label' })).toHaveValue('Annex');
      // A section added before it leaves the scope on the same section.
      rerender(
        <TemplateEditor
          template={{ ...TEMPLATE, sections: [{ name: 'intro' }, ...(TEMPLATE.sections ?? [])] }}
          scope="annex"
          onChange={() => {}}
        />,
      );
      expect(screen.getByRole('textbox', { name: 'Label' })).toHaveValue('Annex');
      // A name no section has shows the document's settings.
      rerender(<TemplateEditor template={TEMPLATE} scope="gone" onChange={() => {}} />);
      expect(document.querySelector('.de-template-editor')).toHaveAttribute(
        'data-scope',
        'document',
      );
      expect(log.scopes).toEqual([]);
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-2.1 starts at the default scope while the host holds none',
    () => {
      render(<TemplateEditor template={TEMPLATE} defaultScope="cover" onChange={() => {}} />);
      expect(document.querySelector('.de-template-editor')).toHaveAttribute(
        'data-scope',
        'section',
      );
    },
    SLOW,
  );
});

describe('section names', () => {
  it(
    'DOCE-TEMPLATE-EDITOR-2.3 commits a rename once, sanitised, and tells the host',
    async () => {
      const user = userEvent.setup();
      const log = newLog();
      render(<Host log={log} initialScope="annex" />);
      const name = screen.getByRole('textbox', { name: 'Section name' });
      await user.clear(name);
      await user.type(name, 'Annex B');
      expect(log.templates).toEqual([]);
      await user.keyboard('{Enter}');
      expect(log.templates).toHaveLength(1);
      expect(names(log.templates[0])).toEqual(['cover', 'annex_b']);
      expect(log.renames).toEqual([['annex', 'annex_b']]);
      expect(log.scopes).toEqual(['annex_b']);
      expect(screen.getByRole('textbox', { name: 'Section name' })).toHaveValue('annex_b');
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-2.3 refuses a name another section has, saying why',
    async () => {
      const user = userEvent.setup();
      const log = newLog();
      render(<Host log={log} initialScope="annex" />);
      const name = screen.getByRole('textbox', { name: 'Section name' });
      await user.clear(name);
      await user.type(name, 'Cover{Enter}');
      expect(log.templates).toEqual([]);
      expect(screen.getByText('Another section has this name.')).toBeInTheDocument();
    },
    SLOW,
  );
});

describe('the section list', () => {
  it(
    'DOCE-TEMPLATE-EDITOR-2.4 adds a section after the one shown and moves it',
    async () => {
      const user = userEvent.setup();
      const log = newLog();
      render(<Host log={log} initialScope="cover" />);
      await user.click(screen.getByRole('button', { name: 'Add a section' }));
      expect(names(log.templates.at(-1))).toEqual(['cover', 'section_3', 'annex']);
      expect(log.scopes.at(-1)).toBe('section_3');
      await user.click(screen.getByRole('button', { name: 'Move the section later' }));
      expect(names(log.templates.at(-1))).toEqual(['cover', 'annex', 'section_3']);
      expect(screen.getByRole('button', { name: 'Move the section later' })).toBeDisabled();
      await user.click(screen.getByRole('button', { name: 'Move the section earlier' }));
      expect(names(log.templates.at(-1))).toEqual(['cover', 'section_3', 'annex']);
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-2.4 deletes a section only once confirmed',
    async () => {
      const user = userEvent.setup();
      const log = newLog();
      render(<Host log={log} initialScope="annex" />);
      await user.click(screen.getByRole('button', { name: 'Delete the section' }));
      const dialog = await screen.findByRole('alertdialog', { name: /Annex/ });
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      expect(log.templates).toEqual([]);
      await user.click(screen.getByRole('button', { name: 'Delete the section' }));
      const again = await screen.findByRole('alertdialog', { name: /Annex/ });
      await user.click(within(again).getByRole('button', { name: 'Delete the section' }));
      expect(names(log.templates.at(-1))).toEqual(['cover']);
      expect(log.scopes.at(-1)).not.toBeInTheDocument();
    },
    SLOW,
  );
});

describe('identity', () => {
  it(
    'DOCE-TEMPLATE-EDITOR-2.5 shows a parent that makes a cycle without letting it be picked',
    async () => {
      const user = userEvent.setup();
      render(
        <TemplateEditor
          template={{ formatVersion: 1, id: 'plain', parent: 'gone' }}
          onChange={() => {}}
          parentOptions={[
            { id: 'house', label: 'House' },
            { id: 'child', label: 'Child', cycle: true },
          ]}
        />,
      );
      expect(screen.getByText('The parent template is not available.')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Parent template/ }));
      const child = await screen.findByRole('option', { name: /Child/ });
      expect(child).toHaveAttribute('aria-disabled', 'true');
      expect(child).toHaveTextContent('Inherits from this template');
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-2.5 shows why the parent could not be loaded',
    () => {
      render(
        <TemplateEditor
          template={{ formatVersion: 1, id: 'plain', parent: 'house' }}
          onChange={() => {}}
          parentOptions={[{ id: 'house', label: 'House' }]}
          parentError="The parent template could not be loaded."
        />,
      );
      expect(screen.getByText('The parent template could not be loaded.')).toBeInTheDocument();
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-2.6 edits the id of a template never saved, committed on Enter',
    async () => {
      const user = userEvent.setup();
      const log = newLog();
      const { unmount } = render(<Host log={log} isNew />);
      const id = screen.getByRole('textbox', { name: 'Id' });
      await user.clear(id);
      await user.type(id, 'My template!{Enter}');
      expect(log.templates.at(-1)?.id).toBe('My-template');
      unmount();
      render(<TemplateEditor template={TEMPLATE} onChange={() => {}} />);
      expect(screen.queryByRole('textbox', { name: 'Id' })).not.toBeInTheDocument();
    },
    SLOW,
  );
});

describe('extension slots', () => {
  it(
    'DOCE-TEMPLATE-EDITOR-2.2 edits a host’s own settings under extensions',
    async () => {
      const user = userEvent.setup();
      const log = newLog();
      render(
        <Host
          log={log}
          initial={{ formatVersion: 1, id: 'plain', extensions: { folder: 'Old' } }}
          resolved={{
            formatVersion: 1,
            id: 'plain',
            extensions: { folder: 'Old', review: { owner: 'Lead' } },
          }}
          extensions={{
            rows: {
              identity: [
                { id: 'folder', label: 'Folder', path: ['folder'], kind: { type: 'text' } },
              ],
            },
            sections: [
              {
                id: 'review',
                title: 'Review',
                rows: [
                  {
                    id: 'owner',
                    label: 'Owner',
                    path: ['review', 'owner'],
                    kind: { type: 'text' },
                  },
                ],
              },
            ],
            panes: [
              {
                id: 'fields',
                title: 'Fields',
                path: ['fields'],
                render: (field) => (
                  <button
                    type="button"
                    onClick={() => field.onChange({ stage: { label: 'Stage' } })}
                  >
                    Add a stage field
                  </button>
                ),
              },
            ],
          }}
        />,
      );
      const folder = screen.getByRole('textbox', { name: 'Folder' });
      expect(folder).toHaveValue('Old');
      await user.clear(folder);
      await user.paste('New');
      await user.keyboard('{Enter}');
      expect(log.templates.at(-1)?.extensions).toMatchObject({ folder: 'New' });
      const owner = screen.getByRole('textbox', { name: 'Owner' });
      expect(owner).toHaveAttribute('placeholder', expect.stringContaining('Lead'));
      await user.click(owner);
      await user.paste('Editor');
      await user.keyboard('{Enter}');
      expect(log.templates.at(-1)?.extensions).toMatchObject({ review: { owner: 'Editor' } });
      await user.click(screen.getByRole('button', { name: 'Add a stage field' }));
      expect(log.templates.at(-1)?.extensions).toMatchObject({
        folder: 'New',
        fields: { stage: { label: 'Stage' } },
      });
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-2.2 shows no extension slots in a section’s scope',
    () => {
      render(
        <TemplateEditor
          template={TEMPLATE}
          scope="cover"
          onChange={() => {}}
          extensions={{
            rows: {
              identity: [
                { id: 'folder', label: 'Folder', path: ['folder'], kind: { type: 'text' } },
              ],
            },
            sections: [{ id: 'review', title: 'Review', rows: [] }],
          }}
        />,
      );
      expect(screen.queryByRole('textbox', { name: 'Folder' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Review/ })).not.toBeInTheDocument();
    },
    SLOW,
  );
});

// The JSON editor beside a host that changes the template elsewhere.
function JsonHost({ changes }: { changes: TemplateFile[] }) {
  const [template, setTemplate] = useState<TemplateFile>({ formatVersion: 1, id: 'plain' });
  return (
    <>
      <button type="button" onClick={() => setTemplate({ ...template, name: 'Renamed' })}>
        Rename
      </button>
      <TemplateJsonEditor
        template={template}
        onChange={(next) => {
          changes.push(next);
          setTemplate(next);
        }}
      />
      <button type="button">Elsewhere</button>
    </>
  );
}

describe('TemplateJsonEditor', () => {
  it('DOCE-TEMPLATE-EDITOR-2.7 hands the template over once focus leaves, keeping locked keys', async () => {
    const user = userEvent.setup();
    const changes: TemplateFile[] = [];
    render(<JsonHost changes={changes} />);
    const text = screen.getByRole('textbox');
    await user.clear(text);
    await user.paste('{"formatVersion":1,"id":"other","name":"Typed"}');
    expect(changes).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(changes).toEqual([{ formatVersion: 1, id: 'plain', name: 'Typed' }]);
    expect(text).toHaveValue(templateText({ formatVersion: 1, id: 'plain', name: 'Typed' }));
  });

  it('DOCE-TEMPLATE-EDITOR-2.7 keeps an invalid text and hands nothing over', async () => {
    const user = userEvent.setup();
    const changes: TemplateFile[] = [];
    render(<JsonHost changes={changes} />);
    const text = screen.getByRole('textbox');
    await user.clear(text);
    await user.paste('{"formatVersion":1,');
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(changes).toEqual([]);
    expect(text).toHaveValue('{"formatVersion":1,');
    expect(screen.getByText('The text is not valid JSON.')).toBeInTheDocument();
  });

  it('DOCE-TEMPLATE-EDITOR-2.7 follows a template changed elsewhere while it holds no edit', async () => {
    const user = userEvent.setup();
    const changes: TemplateFile[] = [];
    render(<JsonHost changes={changes} />);
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    expect(screen.getByRole('textbox')).toHaveValue(
      templateText({ formatVersion: 1, id: 'plain', name: 'Renamed' }),
    );
    expect(changes).toEqual([]);
  });
});
