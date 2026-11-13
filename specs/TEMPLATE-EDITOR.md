# Template editor

The template editor edits a template's own settings beside the document it styles: its name, page setup, text styles, paragraph numbering, header and footer, lists, tables, figures, code blocks, equations, footnotes, contents, references and change bars, in the base library's filterable property panel.

## DOCE-TEMPLATE-EDITOR-1 - Editing a template

### DOCE-TEMPLATE-EDITOR-1.1 - Settings and inheritance

`TemplateEditor` shall show a template's settings in a `PropertyFilter` (`de-template-editor`, named by `panel`), by section (`TEMPLATE_SECTIONS`), each setting a property row with the base library's field for its kind: text, a length (kept once it reads as one, such as `12pt` or `20mm`), a number, a colour, a yes-or-no that may be unset, a choice from a list, or one of a few as segments (DOCE-TEMPLATE-EDITOR-1.7), a row marked overridden while the template sets its value. A field holds the template's own value and, while it has none, shows the value `resolved` gives it from its parents (`inherited`); an empty text is the template's own empty value (`withSetting` keeps `''`), shown empty rather than with the inherited value, and a row with its own value over an inherited one has the row's reset (the base library's `PropertyRow` `onReset`), which inherits again (`withSetting` given null leaves the setting out, and the objects it leaves empty). After page setup, the Text styles section shall hold a card for each built-in style, in reading order (`TEXT_STYLES`: title, headings 1 to 6, paragraph), named by the style and summing up its font, size and spacing, marked overridden while the scope sets any of it. A card's rows are its font and size (in points); its weight, slant and underline as toggles that go from inherited, shown mixed, to on, off and inherited again, and its alignment as segments drawn as the base library's text alignment glyphs, justified for the paragraph only; its colour; its space before and after (in points); its line height; for the paragraph its indentation; and for a heading its numbering: whether it numbers, the text before the number, its format and the text after. The other sections' cards take the same rows for the parts of a style they hold (`StylePart`). The code block's text is in the Code blocks section.

Implementation: `src/components/template-editor/template-editor.tsx`, `src/components/template-editor/setting-row.tsx`, `src/components/template-editor/template-settings.ts`, `src/components/template-editor/style-sections.tsx`, `src/components/template-editor/style-fields.tsx`, `src/components/template-editor/style-rows.tsx`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/template-editor.test.tsx`, `src/components/template-editor/setting-row.test.tsx`

### DOCE-TEMPLATE-EDITOR-1.2 - Following the document

Each change shall hand the host the changed template (`onChange`); a document editor given the template resolved again restyles the document and lays its pages out again at once, as the template editor lab shows beside it.

Implementation: `src/components/template-editor/template-editor.tsx`, `labs/src/template-editor.lab.tsx`
Verification: `e2e/template-editor.spec.ts`

### DOCE-TEMPLATE-EDITOR-1.3 - Sections and the parent

The editor shall edit the whole document's settings or one template section's (`Settings of`), add a section with a new name and delete the one shown; a section's own rows set its name, committed on Enter or on leaving the field and written in lower case with underscores for other characters (`sectionNameOf`), kept when it is empty or another section has it, its label and whether every document has it, writers may edit it, add and remove it, and it restarts the numbering, and its page, header and footer, list, table, code and footnote settings, which show the document's values while it sets none; footnote numbering is the document's only (`documentOnly`), so a section never shows it. While the template has no list of sections of its own, the editor shall list the sections it inherits (those of `resolved`), and an added section, or the first change to an inherited one, shall write the whole inherited list into the template with it (`withListedSections`): a template's list replaces its parent's whole (DOCE-FORMAT-3.1), so a list of the changed section alone would drop the others. The root publishes `data-scope`. With `parentOptions`, the identity rows pick the template's parent among them, never the template itself.

Implementation: `src/components/template-editor/template-editor.tsx`, `src/components/template-editor/template-scope.tsx`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/template-editor.test.tsx`

### DOCE-TEMPLATE-EDITOR-1.4 - Header and footer content

The header and footer content shall be edited in place, on the pages of the document beside the template editor (DOCE-SECTIONS-5.1), and `withRegionChange` shall write each edit into the template: where the section's pages take the region from (`resolveSectionRegion`): into the section's own region while it has one that does not inherit, and into the document's otherwise. Given the resolved template (`withRegionChange(template, change, resolved)`), a section the template inherits counts as its own, and the template takes the inherited list with the edit (DOCE-TEMPLATE-EDITOR-1.3).

Implementation: `src/components/template-editor/template-editor.tsx`, `labs/src/template-editor.lab.tsx`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/template-editor.test.tsx`

### DOCE-TEMPLATE-EDITOR-1.5 - The template as JSON

`TemplateJsonEditor` shall edit a template as JSON in the base library's code editor, check the text as it is typed (`validateTemplateFile`), show its errors, or that the text is not JSON only when it cannot be parsed, tell them to `onValidityChange`, and hand each valid template to `onChange`; a template changed elsewhere replaces the text, so the text never hands back a template older than the host's.

Implementation: `src/components/template-editor/template-json-editor.tsx`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/template-editor.test.tsx`

### DOCE-TEMPLATE-EDITOR-1.6 - Custom styles

A Custom styles section, after the text styles, shall hold a card for each custom style the scope has or inherits, with the rows of the paragraph's card and its name, which renames the style once committed when it is a letter followed by up to fifteen letters, digits, `_` or `-` and no other style has it (DOCE-TEMPLATE-EDITOR-1.10); its header adds a style with a new name, starting at 11pt, each card's header deletes the style, or, for an inherited one, overrides it in the scope with a copy of the inherited style, and without styles the section says it has none.

Implementation: `src/components/template-editor/style-sections.tsx`
Verification: `e2e/template-editor.spec.ts`

### DOCE-TEMPLATE-EDITOR-1.7 - Fields for sizes, fonts, numbering and pages

A text size shall be a number in points, written as one (`12pt`) and showing a size in another unit in points; a font shall be picked from `fonts` (a default list without it) or typed; a numbering format shall keep only a level's character (`1`, `a`, `A`, `i`, `I`) and the separators `.`, `-`, `)`, `:` and `/`, with what each character numbers with under it, and a heading's text before and after its number; a page size shall show its dimensions, such as `A4 (210 × 297 mm)`; the margins shall be one row of four sides (the base library's `FourSidePropertyStrip`), in millimetres on an A or B size page and in inches otherwise, written in that unit, each side the strip's own small input, which takes digits and a decimal point, so the row fits a narrow settings panel, and named by its side (`Top margin`); a contents list's padding and spacing are such rows in points; a code font shall be picked from `codeFonts`, monospace fonts (`DEFAULT_CODE_FONTS` without it), or typed; orientation, a change bar's side and a caption's placement shall be segments, orientation's with the page portrait and landscape glyphs; a bulleted list's bullet shall be picked from those it may show; change bars shall show or hide each kind, with its colour, the formatting changes' too, and their offset. While a field inherits, its help shall name the value and where it comes from: the parent template, or the document settings for a section. A style's font and its size in points share one row, and a number, such as a line height, is typed without step buttons. A space before or after is typed as a number of points.

Implementation: `src/components/template-editor/setting-controls.tsx`, `src/components/template-editor/setting-row.tsx`, `src/components/template-editor/template-settings.ts`, `src/components/template-editor/margins-row.tsx`, `src/components/template-editor/style-fields.tsx`, `src/components/template-editor/settings-catalog.ts`
Verification: `e2e/template-editor.spec.ts`

### DOCE-TEMPLATE-EDITOR-1.8 - Previewing the template

The template editor lab shall show, on asking, the template's preview document (DOCE-TEMPLATES-8.2) styled by the template as it is edited.

Implementation: `labs/src/template-editor.lab.tsx`
Verification: `e2e/template-editor.spec.ts`

### DOCE-TEMPLATE-EDITOR-1.9 - Every setting as a row

Every setting of the template format (`TEMPLATE_SHAPE`) shall have a row, so a template is written without its JSON, apart from what other parts of the editor edit (its identity, its sections, the content of its regions and sections, and the host's extensions). `TEMPLATE_SECTIONS` holds them as data, each section a list of settings and of cards (`TemplateSettingCard`), and `SettingSections` shows them after the scope, with the text and custom styles after the page setup and a host's rows at the end of a section (`extra`):

- Paragraph numbering: whether paragraphs are numbered, so a template section may switch it on or off, its text before the number, format and text after, and a card for each of its six levels with its format, number indent and text indent.
- Header & footer: whether each takes its parent's (the parent template's, or the document's for a section), its height and its space to the content.
- Lists: the bullet, the text before the number, the numbering format, the text after, the indentation and the space before and after.
- Tables, Figures, Code blocks and Equations: their own settings (a table's borders, padding, header and rows, a figure's default width, a code block's background and its text, an equation's brackets around the number), and for each a card for its numbering (whether it numbers, the text before, format and text after), its caption (placement, alignment and the text after a continued caption) and the font of the caption's label and of its text.
- Footnotes: the numbering, the text after the number, the separator line, its thickness and colour, the space above and between notes, and cards for the marker's font and the note text.
- Contents: the leader and its spacing, the padding and spacing, cards for the title's and the entries' fonts, a card for each of six levels (indentation, spacing and leader), and a card for each kind of list (`DEFAULT_CONTENTS_KINDS`) with its title, its leader and each level's leader.
- References (DOCE-TEMPLATE-EDITOR-1.11) and Change bars.

A setting of a level writes that entry of the list, with `null` for each earlier entry the template does not set, so it inherits its parent's entry at that index; a list whose entries all inherit is left out. A template section shows only what a section may set: not the contents, the references or the footnote numbering.

Implementation: `src/components/template-editor/settings-catalog.ts`, `src/components/template-editor/object-settings.ts`, `src/components/template-editor/template-rows.tsx`, `src/components/template-editor/template-settings.ts`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/settings-catalog.test.ts`, `src/components/template-editor/template-settings.test.ts`

### DOCE-TEMPLATE-EDITOR-1.10 - Renaming and deleting a custom style

Renaming a custom style of the document's settings shall rename it with what refers to it in the template (`withCustomStyleRenamed`): a section's override of the style, and each block of the template's content in the style; deleting it shall take it out of the sections too and take it off those blocks. In a section's settings, renaming or deleting changes the section's own styles. While the name typed may not be taken, the field shall say why (`customStyleNameError`): it is not a letter followed by up to fifteen letters, digits, `_` or `-`, or another style has it.

Implementation: `src/components/template-editor/custom-style-names.ts`, `src/components/template-editor/style-sections.tsx`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/custom-style-names.test.ts`

### DOCE-TEMPLATE-EDITOR-1.11 - References

A References section shall hold a card for each reference format key (`referenceFormatKeys`), named by what it points to, with its format and whether the reference links to its target; a format that is not valid (`referenceFormatError`) shall show why on its field.

Implementation: `src/components/template-editor/settings-catalog.ts`, `src/components/template-editor/setting-controls.tsx`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/setting-row.test.tsx`

## Hooks

| Hook                      | Kind      | Values                | Description                                      |
| ------------------------- | --------- | --------------------- | ------------------------------------------------ |
| `de-template-editor`      | root      |                       | The template editor's settings panel.            |
| `de-template-json-editor` | root      |                       | The template's JSON editor.                      |
| `data-scope`              | attribute | `document`, `section` | On the template editor: whose settings it shows. |
