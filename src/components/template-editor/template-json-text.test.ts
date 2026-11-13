import { describe, expect, it } from 'vitest';
import type { TemplateFile } from '../../model/index.js';
import { LOCKED_TEMPLATE_KEYS, readTemplateText, templateText } from './template-json-text.js';

const HELD: TemplateFile = { formatVersion: 1, id: 'plain', name: 'Plain' };
const NOT_JSON = 'not json';

const read = (text: string, locked: readonly (keyof TemplateFile)[] = LOCKED_TEMPLATE_KEYS) =>
  readTemplateText(text, { held: HELD, locked, notJson: NOT_JSON });

describe('readTemplateText', () => {
  it('DOCE-TEMPLATE-EDITOR-2.7 reads a valid text as a template', () => {
    expect(read(templateText({ ...HELD, name: 'Renamed' }))).toEqual({
      template: { ...HELD, name: 'Renamed' },
    });
  });

  it('DOCE-TEMPLATE-EDITOR-2.7 keeps the locked keys of the template the host holds', () => {
    const text = JSON.stringify({ formatVersion: 1, id: 'other', name: 'Renamed' });
    expect(read(text).template).toEqual({ ...HELD, name: 'Renamed' });
    // A locked key the host's template does not have is taken out of the text's.
    expect(read(JSON.stringify({ ...HELD, parent: 'house' }), ['parent']).template).toEqual(HELD);
    // Without the format and id in the text, the host's are kept.
    expect(read('{"name":"Short"}')).toEqual({ template: { ...HELD, name: 'Short' } });
  });

  it('DOCE-TEMPLATE-EDITOR-2.7 says a text is not JSON only when it cannot be parsed', () => {
    expect(read('{"formatVersion":1,', [])).toEqual({ errors: [NOT_JSON] });
    const invalid = read('{"formatVersion":1,"id":"plain","size":3}', []);
    expect(invalid.errors?.length).toBeGreaterThan(0);
    expect(invalid.errors).not.toContain(NOT_JSON);
    expect(read('[1]').errors?.length).toBe(1);
  });
});
