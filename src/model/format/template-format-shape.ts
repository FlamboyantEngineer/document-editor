// The shape of the stored template format, as data: every setting a template may hold and the kind
// of value it takes. Validation walks it, so the format is described once.

import { PAGE_SIZE_DIMENSIONS } from '../templates/template-css-values.js';

/** The kind of value a setting takes. */
export type SettingShape =
  | 'length'
  | 'color'
  | 'text'
  | 'boolean'
  | 'lineHeight'
  | 'weight'
  | 'content'
  | 'regionContent'
  | 'numbering'
  | 'bullet'
  | 'any'
  | { oneOf: readonly string[] }
  | { object: Readonly<Record<string, SettingShape>> }
  | { list: SettingShape }
  | { record: SettingShape };

const sides = {
  object: { top: 'length', right: 'length', bottom: 'length', left: 'length' },
} as const;

const FONT = {
  font: 'text',
  size: 'length',
  weight: 'weight',
  italic: 'boolean',
  underline: 'boolean',
  color: 'color',
} as const;

const TEXT = {
  ...FONT,
  lineHeight: 'lineHeight',
  alignment: { oneOf: ['left', 'center', 'right', 'justify'] },
  spaceBefore: 'length',
  spaceAfter: 'length',
} as const;

const NUMBERING_FIELDS = {
  enabled: 'boolean',
  format: 'numbering',
  prefix: 'text',
  suffix: 'text',
} as const;
const NUMBERING = { object: NUMBERING_FIELDS } as const;

const LEADER = { object: { character: 'text', spacing: 'length' } } as const;
const LEADER_CHARACTER = { object: { character: 'text' } } as const;

const CONTENTS = {
  object: {
    title: { object: FONT },
    entry: { object: FONT },
    padding: sides,
    spacing: sides,
    leader: LEADER,
    levels: {
      list: {
        object: {
          indentation: 'length',
          spaceBefore: 'length',
          spaceAfter: 'length',
          leader: LEADER,
        },
      },
    },
    kinds: {
      record: {
        object: {
          title: 'text',
          leader: LEADER_CHARACTER,
          levels: { list: { object: { leader: LEADER_CHARACTER } } },
        },
      },
    },
  },
} as const;

const CAPTION = {
  object: {
    placement: { oneOf: ['above', 'below'] },
    alignment: { oneOf: ['left', 'center', 'right'] },
    continuedSuffix: 'text',
    label: { object: FONT },
    text: { object: FONT },
  },
} as const;

const CAPTIONED = { numbering: NUMBERING, caption: CAPTION } as const;
const HEADING = { object: { ...TEXT, numbering: NUMBERING } } as const;
const SWITCH = { object: { enabled: 'boolean', color: 'color' } } as const;

/** The page settings. */
export const PAGE_SHAPE: SettingShape = {
  object: {
    size: { oneOf: Object.keys(PAGE_SIZE_DIMENSIONS) },
    orientation: { oneOf: ['portrait', 'landscape'] },
    margins: sides,
  },
};

/** The styles of a scope. */
export const STYLES_SHAPE: SettingShape = {
  object: {
    paragraph: {
      object: {
        ...TEXT,
        numbering: {
          object: {
            ...NUMBERING_FIELDS,
            levels: {
              list: {
                object: { format: 'numbering', numberIndent: 'length', textIndent: 'length' },
              },
            },
          },
        },
        indentation: 'length',
      },
    },
    title: { object: TEXT },
    heading1: HEADING,
    heading2: HEADING,
    heading3: HEADING,
    heading4: HEADING,
    heading5: HEADING,
    heading6: HEADING,
    list: {
      object: {
        bullet: 'bullet',
        format: 'numbering',
        prefix: 'text',
        suffix: 'text',
        indentation: 'length',
        spaceBefore: 'length',
        spaceAfter: 'length',
      },
    },
    table: {
      object: {
        ...CAPTIONED,
        border: { object: { width: 'length', color: 'color' } },
        cellPadding: 'length',
        header: { object: { background: 'color', color: 'color', weight: 'weight' } },
        rows: { object: { odd: 'color', even: 'color' } },
        repeatHeader: 'boolean',
      },
    },
    figure: { object: { ...CAPTIONED, defaultWidth: 'length' } },
    codeBlock: { object: { ...CAPTIONED, ...TEXT, background: 'color' } },
    equation: { object: { ...CAPTIONED, wrapper: 'text' } },
    contents: CONTENTS,
    custom: { record: { object: TEXT } },
  },
};

// A header or footer holds blocks only, so its content is a kind of its own.
const REGION: SettingShape = {
  object: {
    content: 'regionContent',
    height: 'length',
    spacingToContent: 'length',
    inherit: 'boolean',
  },
};

const FOOTNOTES = {
  suffix: 'text',
  separator: { object: { enabled: 'boolean', thickness: 'length', color: 'color' } },
  spacingToContent: 'length',
  entrySpacing: 'length',
  marker: { object: FONT },
  text: { object: TEXT },
} as const;

// The margin bars that mark changes, for the document or a section.
const CHANGE_BARS: SettingShape = {
  object: {
    insertions: SWITCH,
    deletions: SWITCH,
    modifications: SWITCH,
    formatting: SWITCH,
    side: { oneOf: ['left', 'right'] },
    offset: 'length',
    width: 'length',
  },
};

/** The settings of a template section, beside its name. */
export const SECTION_SHAPE: SettingShape = {
  object: {
    name: 'text',
    label: 'text',
    required: 'boolean',
    editable: 'boolean',
    insertable: 'boolean',
    content: 'content',
    placeholder: 'content',
    restartNumbering: 'boolean',
    changeBars: CHANGE_BARS,
    page: PAGE_SHAPE,
    styles: STYLES_SHAPE,
    header: REGION,
    footer: REGION,
    footnotes: { object: FOOTNOTES },
  },
};

/** Every setting of a stored template, beside its format version. */
export const TEMPLATE_SHAPE: SettingShape = {
  object: {
    id: 'text',
    name: 'text',
    parent: 'text',
    page: PAGE_SHAPE,
    styles: STYLES_SHAPE,
    header: REGION,
    footer: REGION,
    footnotes: { object: { numbering: { oneOf: ['document', 'page'] }, ...FOOTNOTES } },
    references: { object: { formats: { record: 'text' }, links: { record: 'boolean' } } },
    changeBars: CHANGE_BARS,
    sections: { list: SECTION_SHAPE },
    extensions: { record: 'any' },
  },
};
