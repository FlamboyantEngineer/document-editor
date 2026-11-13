import { describe, expect, it } from 'vitest';
import type { TemplateFile } from '../../model/index.js';
import { settingAt, withSetting } from './template-settings.js';

const PLAIN: TemplateFile = { formatVersion: 1, id: 'plain' };

describe('withSetting', () => {
  it('DOCE-TEMPLATE-EDITOR-1.9 sets a level of a list, leaving the earlier ones to inherit', () => {
    const path = ['styles', 'paragraph', 'numbering', 'levels', '1', 'textIndent'];
    const next = withSetting(PLAIN, path, '48pt');
    expect(next.styles?.paragraph?.numbering?.levels).toEqual([null, { textIndent: '48pt' }]);
    expect(settingAt(next, path)).toBe('48pt');
    expect(settingAt(next, ['styles', 'paragraph', 'numbering', 'levels', '0', 'format'])).toBe(
      undefined,
    );
  });

  it('DOCE-TEMPLATE-EDITOR-1.9 inherits a level again, dropping the list once all inherit', () => {
    const path = ['styles', 'contents', 'levels', '2', 'indentation'];
    const one = withSetting(PLAIN, path, '24pt');
    const two = withSetting(one, ['styles', 'contents', 'levels', '0', 'indentation'], '0pt');
    expect(two.styles?.contents?.levels).toEqual([
      { indentation: '0pt' },
      null,
      { indentation: '24pt' },
    ]);
    const back = withSetting(two, path, null);
    expect(back.styles?.contents?.levels).toEqual([{ indentation: '0pt' }]);
    expect(withSetting(back, ['styles', 'contents', 'levels', '0', 'indentation'], null)).toEqual(
      PLAIN,
    );
  });
});
