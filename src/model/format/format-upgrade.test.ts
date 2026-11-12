import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_FORMAT_VERSION,
  type SettingShape,
  STORED_MARK_TYPES,
  STORED_NODE_TYPES,
  TEMPLATE_FORMAT_VERSION,
  TEMPLATE_SHAPE,
  upgradeDocumentFile,
  upgradeTemplateFile,
} from '../index.js';

// DOCE-FORMAT-8.2: turned on at the owner's switch, when the format freezes. From then on each
// format version's stored names are recorded in `test/fixtures/format-versions/`, and a change to
// them without a version step fails here.
const FROZEN = false;

/** Every setting path a stored template may hold, such as `page.margins.top`. */
function settingPaths(shape: SettingShape, path: string, paths: string[] = []): string[] {
  if (typeof shape === 'string' || 'oneOf' in shape) paths.push(path);
  else if ('object' in shape) {
    for (const [key, field] of Object.entries(shape.object))
      settingPaths(field, `${path}.${key}`, paths);
  } else settingPaths('list' in shape ? shape.list : shape.record, `${path}[]`, paths);
  return paths;
}

/** The stored names of both formats at their current versions. */
function storedNames() {
  return {
    document: {
      formatVersion: DOCUMENT_FORMAT_VERSION,
      nodes: STORED_NODE_TYPES,
      marks: STORED_MARK_TYPES,
    },
    template: {
      formatVersion: TEMPLATE_FORMAT_VERSION,
      settings: settingPaths(TEMPLATE_SHAPE, 'template'),
    },
  };
}

describe('format versions', () => {
  it('DOCE-FORMAT-8.1 gives back a file at the current version, and leaves one it cannot upgrade', () => {
    const file = { formatVersion: DOCUMENT_FORMAT_VERSION, sections: [] };
    expect(upgradeDocumentFile(file)).toBe(file);
    const template = { formatVersion: TEMPLATE_FORMAT_VERSION, id: 'plain' };
    expect(upgradeTemplateFile(template)).toBe(template);
    const older = { formatVersion: 0, sections: [] };
    expect(upgradeDocumentFile(older)).toBe(older);
    expect(upgradeDocumentFile('not a file')).toBe('not a file');
  });

  it('DOCE-FORMAT-8.2 records every stored node, mark and template setting name', () => {
    const { document, template } = storedNames();
    expect(document.nodes.paragraph?.type).toBe('paragraph');
    expect(template.settings).toContain('template.page.margins.top');
    expect(template.settings).toContain('template.sections[].header.content');
  });

  it.skipIf(!FROZEN)(
    'DOCE-FORMAT-8.2 refuses a change to stored names without a version step',
    async () => {
      const version = `v${String(DOCUMENT_FORMAT_VERSION)}-${String(TEMPLATE_FORMAT_VERSION)}`;
      await expect(JSON.stringify(storedNames(), null, 2)).toMatchFileSnapshot(
        `../../../test/fixtures/format-versions/${version}.json`,
      );
    },
  );
});
