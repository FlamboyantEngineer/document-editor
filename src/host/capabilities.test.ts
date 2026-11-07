import { describe, expect, it } from 'vitest';
import {
  canComment,
  type EditorCapabilities,
  FULL_CAPABILITIES,
  READ_ONLY_CAPABILITIES,
  resolveEditingMode,
} from './capabilities.js';

const SUGGESTER: EditorCapabilities = { edit: false, suggest: true, comment: true };
const COMMENTER: EditorCapabilities = { edit: false, suggest: false, comment: true };

describe('resolveEditingMode', () => {
  it('DOCE-HOST-2.1 DOCE-HOST-2.2 edits with the edit capability, whatever the connection', () => {
    expect(resolveEditingMode(FULL_CAPABILITIES)).toBe('edit');
    expect(resolveEditingMode(FULL_CAPABILITIES, { connection: 'pending' })).toBe('edit');
  });

  it('DOCE-HOST-2.2 reads a historical version even with every capability', () => {
    expect(resolveEditingMode(FULL_CAPABILITIES, { historical: true })).toBe('read');
  });

  it('DOCE-HOST-2.2 suggests or comments once the connection accepts writes', () => {
    expect(resolveEditingMode(SUGGESTER)).toBe('suggest');
    expect(resolveEditingMode(SUGGESTER, { connection: 'read-write' })).toBe('suggest');
    expect(resolveEditingMode(COMMENTER, { connection: 'read-write' })).toBe('comment');
  });

  it('DOCE-HOST-2.2 stays read-only while the connection is pending or read-only', () => {
    expect(resolveEditingMode(SUGGESTER, { connection: 'pending' })).toBe('read');
    expect(resolveEditingMode(COMMENTER, { connection: 'read-only' })).toBe('read');
  });

  it('DOCE-HOST-2.2 reads without capabilities', () => {
    expect(resolveEditingMode(READ_ONLY_CAPABILITIES)).toBe('read');
  });
});

describe('canComment', () => {
  it('DOCE-HOST-2.3 allows comments before the connection resolves', () => {
    expect(canComment(COMMENTER, { connection: 'pending' })).toBe(true);
    expect(canComment(COMMENTER, { historical: true })).toBe(false);
    expect(canComment(READ_ONLY_CAPABILITIES)).toBe(false);
  });
});
