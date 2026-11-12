import type { Plugin } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { createDocumentKit, FRAGMENT_RULES, type TemplateFile } from '../model/index.js';
import { createDocumentEditing, createDocumentEditingExtension } from './index.js';

// The registries other code finds by key or by type name (DOCE-FORMAT-7.3): the editing plugins in
// the order they run, and the fragment rules of the splittable types. A change to either changes
// what a host's plugins, commands and stored documents meet, so it changes the spec too.

const TEMPLATE: TemplateFile = { formatVersion: 1, id: 'sample' };

/**
 * A plugin's key name. ProseMirror numbers a key made more than once (`name$2`) and names a plugin
 * made without a key `plugin$`, so the count is left out.
 */
const keysOf = (plugins: readonly Plugin[]) =>
  plugins.map((plugin) => (plugin as unknown as { key: string }).key.replace(/\$\d*$/, ''));

const EDITING_KEYS = [
  'history',
  'element-ids',
  'footnotes',
  'comment-draft',
  'math-views',
  'object-views',
  'word-paste',
  'scripts',
];
// Column resizing, cell selection, the table pointer and the table keys.
const TABLE_KEYS = ['tableColumnResizing', 'selectingCells', 'table-pointer', 'plugin'];
// The gap cursor, the document's keys and the base keymap.
const LAST_KEYS = ['plugin', 'plugin', 'plugin'];

describe('plugin order', () => {
  it('DOCE-FORMAT-7.3 runs the editing plugins in the recorded key order', () => {
    expect(keysOf(createDocumentEditing(documentSchema))).toEqual([
      ...EDITING_KEYS,
      'variable-tokens',
      ...TABLE_KEYS,
      ...LAST_KEYS,
    ]);
  });

  it('DOCE-FORMAT-7.3 places the template plugins before table editing', () => {
    expect(keysOf(createDocumentEditing(documentSchema, { template: () => TEMPLATE }))).toEqual([
      ...EDITING_KEYS,
      'custom-styles',
      'variable-tokens',
      'table-width',
      ...TABLE_KEYS,
      ...LAST_KEYS,
    ]);
  });

  it('DOCE-FORMAT-7.3 builds the same keys in the same order from the editing extension', () => {
    const options = { template: () => TEMPLATE };
    const kit = createDocumentKit({ extensions: [createDocumentEditingExtension(options)] });
    expect(keysOf(kit.buildPlugins(undefined))).toEqual(
      keysOf(createDocumentEditing(kit.schema, options)),
    );
    const shared = createDocumentKit({
      extensions: [createDocumentEditingExtension({ history: false })],
    });
    expect(keysOf(shared.buildPlugins(undefined))).toEqual([
      ...EDITING_KEYS.slice(1),
      'variable-tokens',
      ...TABLE_KEYS,
      ...LAST_KEYS,
    ]);
  });
});

describe('fragment rule registry', () => {
  it('DOCE-FORMAT-7.3 records which types split and what their whole block resets', () => {
    const registry = Object.fromEntries(
      Object.entries(FRAGMENT_RULES).map(([name, rule]) => [
        name,
        { whole: rule.whole, join: Boolean(rule.join), continues: Boolean(rule.continues) },
      ]),
    );
    const part = { splitPartIndex: null };
    const joined = { join: true, continues: false };
    expect(registry).toEqual({
      paragraph: { whole: part, join: false, continues: false },
      code_block: {
        whole: { ...part, codeBlockContinued: false, codeLineStart: 1 },
        ...joined,
      },
      linked_code_block: { whole: { ...part, codeBlockContinued: false }, ...joined },
      table: { whole: part, ...joined },
      blockquote: { whole: part, ...joined },
      script_block: { whole: part, ...joined },
      layout_section: { whole: part, ...joined },
      bullet_list: { whole: part, ...joined },
      ordered_list: { whole: part, ...joined },
      list_item: { whole: { ...part, orphanedListContinuation: false }, ...joined },
      toc_block: {
        whole: { entryStart: 0, entryEnd: null, showTitle: true },
        join: true,
        continues: true,
      },
    });
  });

  it('DOCE-FORMAT-7.3 names only schema types and attributes in the fragment rules', () => {
    for (const [name, rule] of Object.entries(FRAGMENT_RULES)) {
      const type = documentSchema.nodes[name];
      expect(type, name).toBeDefined();
      for (const attr of Object.keys(rule.whole)) {
        expect(type?.spec.attrs, `${name}.${attr}`).toHaveProperty(attr);
      }
    }
  });
});
