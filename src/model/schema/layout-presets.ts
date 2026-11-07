// The preset column layouts of a layout block. A layout block stores only its preset id; widths
// come from this table, never from authored sizes. A preset id the client does not know (one added later) still renders
// and edits as equal columns, so new presets need no schema change.

export type DocumentLayoutPresetId =
  'single' | 'halves' | 'third-two-thirds' | 'two-thirds-third' | 'thirds';

export interface DocumentLayoutPreset {
  id: DocumentLayoutPresetId;
  label: string;
  /** Relative column widths, left to right. */
  widths: readonly number[];
}

export const DOCUMENT_LAYOUT_PRESETS: readonly DocumentLayoutPreset[] = Object.freeze(
  [
    { id: 'single', label: 'One column', widths: [1] },
    { id: 'halves', label: 'Two columns (1/2 + 1/2)', widths: [1, 1] },
    { id: 'third-two-thirds', label: 'Two columns (1/3 + 2/3)', widths: [1, 2] },
    { id: 'two-thirds-third', label: 'Two columns (2/3 + 1/3)', widths: [2, 1] },
    { id: 'thirds', label: 'Three columns', widths: [1, 1, 1] },
  ].map((preset) =>
    Object.freeze({ ...preset, widths: Object.freeze(preset.widths) }),
  ) as DocumentLayoutPreset[],
);

export const DEFAULT_DOCUMENT_LAYOUT_PRESET: DocumentLayoutPresetId = 'halves';

export function findDocumentLayoutPreset(id: unknown): DocumentLayoutPreset | null {
  return DOCUMENT_LAYOUT_PRESETS.find((preset) => preset.id === id) ?? null;
}

/** The stored preset id, or the default for a blank or malformed value. */
export function normalizeDocumentLayoutPresetId(value: unknown): string {
  return typeof value === 'string' && /^[a-z0-9-]{1,40}$/.test(value)
    ? value
    : DEFAULT_DOCUMENT_LAYOUT_PRESET;
}
