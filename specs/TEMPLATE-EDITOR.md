# Template editor

The template editor edits a template's own settings beside the document it styles: its name, page setup, text styles, header and footer, lists, tables, code blocks, footnotes, table of contents and change bars, in the base library's filterable property panel.

## DOCE-TEMPLATE-EDITOR-1 - Editing a template

### DOCE-TEMPLATE-EDITOR-1.1 - Settings and inheritance

`TemplateEditor` shall show a template's settings in a `PropertyFilter` (`de-template-editor`, named by `panel`), by section (`TEMPLATE_SECTIONS`), each setting a property row with the base library's field for its kind: text, a length (kept once it reads as one, such as `12pt` or `20mm`), a number, a colour, a yes-or-no that may be unset, a choice from a list, or one of a few as segments (DOCE-TEMPLATE-EDITOR-1.7), a row marked overridden while the template sets its value. A field holds the template's own value and, while it has none, shows the value `resolved` gives it from its parents (`inherited`); an empty text is the template's own empty value (`withSetting` keeps `''`), and a row with its own value over an inherited one has a button that inherits again (`useInherited`; `withSetting` given null leaves the setting out, and the objects it leaves empty). After page setup, the Text styles section shall hold a card for each built-in style, in reading order (`TEXT_STYLES`: title, headings 1 to 6, paragraph), named by the style and summing up its font, size and spacing, marked overridden while the scope sets any of it. A card's rows are its font and size (in points); its weight, slant and underline as toggles that go from inherited, shown mixed, to on, off and inherited again, and its alignment as segments drawn as the base library's text alignment glyphs, justified for the paragraph only; its colour; its space before and after (in points); for the paragraph its line height; and for a heading its numbering: the text before the number, its format and the text after. The code block's font, size and spacing are in the Code blocks section.

Implementation: `src/components/template-editor/template-editor.tsx`, `src/components/template-editor/setting-row.tsx`, `src/components/template-editor/template-settings.ts`, `src/components/template-editor/style-sections.tsx`, `src/components/template-editor/style-fields.tsx`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/template-editor.test.tsx`

### DOCE-TEMPLATE-EDITOR-1.2 - Following the document

Each change shall hand the host the changed template (`onChange`); a document editor given the template resolved again restyles the document and lays its pages out again at once, as the template editor lab shows beside it.

Implementation: `src/components/template-editor/template-editor.tsx`, `labs/src/template-editor.lab.tsx`
Verification: `e2e/template-editor.spec.ts`

### DOCE-TEMPLATE-EDITOR-1.3 - Sections and the parent

The editor shall edit the whole document's settings or one template section's (`Settings of`, DOCE-TEMPLATE-EDITOR-2.1); a section's own rows set its name (DOCE-TEMPLATE-EDITOR-2.3), its label and whether every document has it, writers may edit it, add and remove it, and it restarts the numbering, and its page, header and footer, list, table, code and footnote settings, which show the document's values while it sets none; footnote numbering is the document's only (`documentOnly`), so a section never shows it. While the template has no list of sections of its own, the editor shall list the sections it inherits (those of `resolved`), and an added section, or the first change to an inherited one, shall write the whole inherited list into the template with it (`withListedSections`): a template's list replaces its parent's whole (DOCE-FORMAT-3.1), so a list of the changed section alone would drop the others. The root publishes `data-scope`. With `parentOptions`, the identity rows pick the template's parent among them, never the template itself (DOCE-TEMPLATE-EDITOR-2.5).

Implementation: `src/components/template-editor/template-editor.tsx`, `src/components/template-editor/template-scope.tsx`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/template-editor.test.tsx`

### DOCE-TEMPLATE-EDITOR-1.4 - Header and footer content

The header and footer content shall be edited in place, on the pages of the document beside the template editor (DOCE-SECTIONS-5.1), and `withRegionChange` shall write each edit into the template: where the section's pages take the region from (`resolveSectionRegion`): into the section's own region while it has one that does not inherit, and into the document's otherwise. Given the resolved template (`withRegionChange(template, change, resolved)`), a section the template inherits counts as its own, and the template takes the inherited list with the edit (DOCE-TEMPLATE-EDITOR-1.3).

Implementation: `src/components/template-editor/template-editor.tsx`, `labs/src/template-editor.lab.tsx`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/template-editor.test.tsx`

### DOCE-TEMPLATE-EDITOR-1.5 - The template as JSON

`TemplateJsonEditor` shall edit a template as JSON in the base library's code editor, check the text as it is typed (`validateTemplateFile`), show its errors, or that the text is not JSON only when it cannot be parsed, and tell them to `onValidityChange`, and hand the template to `onChange` once focus leaves the editor (DOCE-TEMPLATE-EDITOR-2.7).

Implementation: `src/components/template-editor/template-json-editor.tsx`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/template-editor.test.tsx`

### DOCE-TEMPLATE-EDITOR-1.6 - Custom styles

A Custom styles section, after the text styles, shall hold a card for each custom style the scope has or inherits, with the rows of the paragraph's card and its name, which renames the style once committed when it is a letter followed by up to fifteen letters, digits, `_` or `-` and no other style has it; its header adds a style with a new name, starting at 11pt, each card's header deletes the style, or, for an inherited one, overrides it in the scope with a copy of the inherited style, and without styles the section says it has none.

Implementation: `src/components/template-editor/style-sections.tsx`
Verification: `e2e/template-editor.spec.ts`

### DOCE-TEMPLATE-EDITOR-1.7 - Fields for sizes, fonts, numbering and pages

A text size shall be a number in points, written as one (`12pt`) and showing a size in another unit in points; a font shall be picked from `fonts` (a default list without it) or typed; a numbering format shall keep only a level's character (`1`, `a`, `A`, `i`, `I`) and the separators `.`, `-`, `)`, `:` and `/`, with what each character numbers with under it, and a heading's text before and after its number; a page size shall show its dimensions, such as `A4 (210 × 297 mm)`; the margins shall be one row of four sides (the base library's `FourSidePropertyStrip`), in millimetres on an A or B size page and in inches otherwise, written in that unit, each side the strip's own small input, which takes digits and a decimal point, so the row fits a narrow settings panel; orientation, a change bar's side and a caption's placement shall be segments, orientation's with the page portrait and landscape glyphs; a bulleted list's bullet shall be picked from those it may show; change bars shall show or hide each kind, with its colour, the formatting changes' too, and their offset. While a field inherits, its help shall name the value and where it comes from: the parent template, or the document settings for a section. A style's font and its size in points share one row, and a number, such as a line height, is typed without step buttons. A space before or after is typed as a number of points.

Implementation: `src/components/template-editor/setting-controls.tsx`, `src/components/template-editor/setting-row.tsx`, `src/components/template-editor/template-settings.ts`, `src/components/template-editor/margins-row.tsx`, `src/components/template-editor/style-fields.tsx`
Verification: `e2e/template-editor.spec.ts`

### DOCE-TEMPLATE-EDITOR-1.8 - Previewing the template

The template editor lab shall show, on asking, the template's preview document (DOCE-TEMPLATES-8.2) styled by the template as it is edited.

Implementation: `labs/src/template-editor.lab.tsx`
Verification: `e2e/template-editor.spec.ts`

## DOCE-TEMPLATE-EDITOR-2 - The template's structure

### DOCE-TEMPLATE-EDITOR-2.1 - The scope, by name

The scope shall be the document's settings (`null`) or a template section's, named by the section's name (`TemplateScope`), so adding, moving or deleting another section leaves it on the same section; a name no section has shows the document's settings. A host may hold it (`scope` with `onScopeChange`), and the editor otherwise holds it, starting at `defaultScope`; the editor asks for each scope it moves to: one picked, a section added or renamed, and the document's settings after a delete.

Implementation: `src/components/template-editor/template-scope-state.ts`, `src/components/template-editor/template-scope.tsx`, `src/components/template-editor/template-editor.tsx`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/template-structure.test.tsx`

### DOCE-TEMPLATE-EDITOR-2.2 - Extension slots

A host's own settings, kept in the template's `extensions` and inherited like the rest (DOCE-TEMPLATES-10.6), shall be edited beside the built-in ones (`extensions`, `TemplateExtensionSlots`): rows after a built-in section's own, by its id, such as `identity` or `page`; sections of rows after the built-in sections; and panes after them that the host draws. A row edits the value at its `path` under `extensions` with the built-in field of its `kind`, inheriting like any setting, or with a field the host draws (`render`); a pane draws the whole value at its path. Each draws with the value, the inherited value, a change that writes it, null taking it away, and whether the editor is disabled (`TemplateExtensionField`). A template section has no `extensions`, so a section's scope shows no slot.

Implementation: `src/components/template-editor/template-extensions.tsx`, `src/components/template-editor/template-editor.tsx`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/template-structure.test.tsx`

### DOCE-TEMPLATE-EDITOR-2.3 - Renaming a section

A section's name shall be committed once, on Enter or on leaving the field, not as it is typed; written in lower case with underscores for other characters (`sectionNameOf`); and refused, saying why under the field, when nothing is left or another section has it (`renameSection`). Escape restores the name. A committed rename hands the template to `onChange`, the old and new names to `onSectionRename`, so the host follows the section in what names it, and moves the scope to the new name.

Implementation: `src/components/template-editor/template-scope.tsx`, `src/components/template-editor/template-section-list.ts`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/template-structure.test.tsx`, `src/components/template-editor/template-section-list.test.ts`

### DOCE-TEMPLATE-EDITOR-2.4 - Adding, moving and deleting sections

The scope picker shall add a section with a new name (`freshSectionName`) after the section shown, or at the end from the document's settings, and show it; move the section shown one place earlier or later, never past either end; and delete it only once a confirming alert dialog says what deleting does, then show the document's settings. The template's list changes by name (`withSectionAt`, `withSectionMoved`, `withNamedSection`, `withoutSection`).

Implementation: `src/components/template-editor/template-scope.tsx`, `src/components/template-editor/template-section-list.ts`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/template-structure.test.tsx`, `src/components/template-editor/template-section-list.test.ts`

### DOCE-TEMPLATE-EDITOR-2.5 - The parent's feedback

A parent option marked `cycle`, one that inherits from the template, shall be listed, disabled, with why; a parent the template names that is not among the options shall be said to be unavailable under the field, and `parentError`, such as a parent the host could not load, shall show there instead.

Implementation: `src/components/template-editor/template-identity.tsx`
Verification: `src/components/template-editor/template-structure.test.tsx`

### DOCE-TEMPLATE-EDITOR-2.6 - The id before the first save

While the host has never saved the template (`isNew`), the identity rows shall start with its id, committed on Enter or on leaving the field and written with letters, digits, underscores and hyphens, other characters becoming hyphens (`templateIdOf`); an id with nothing left is refused, saying why. A saved template's id has no row.

Implementation: `src/components/template-editor/template-identity.tsx`
Verification: `src/components/template-editor/template-structure.test.tsx`

### DOCE-TEMPLATE-EDITOR-2.7 - Committing the JSON

`TemplateJsonEditor` shall hand the template its text reads as to `onChange` once focus leaves the editor, and only when it is valid; an invalid text stays, with its errors. The keys the host locks (`lockedKeys`, by default `formatVersion` and `id`) keep the host's values, or stay out while its template has none, whatever the text says (`readTemplateText`); a text that cannot be parsed says it is not JSON, and one that can shows the template's own errors. The text follows a template changed elsewhere while it holds no edit of its own, and keeps an edit in progress.

Implementation: `src/components/template-editor/template-json-editor.tsx`, `src/components/template-editor/template-json-text.ts`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/template-structure.test.tsx`, `src/components/template-editor/template-json-text.test.ts`

### DOCE-TEMPLATE-EDITOR-2.8 - The preview follows the scope

In the template editor lab, the template's preview document (DOCE-TEMPLATE-EDITOR-1.8) shall open at the section the settings panel shows, and picking a section while it shows scrolls the preview to it.

Implementation: `labs/src/template-editor.lab.tsx`
Verification: `e2e/template-editor.spec.ts`

## Hooks

| Hook                      | Kind      | Values                | Description                                      |
| ------------------------- | --------- | --------------------- | ------------------------------------------------ |
| `de-template-editor`      | root      |                       | The template editor's settings panel.            |
| `de-template-json-editor` | root      |                       | The template's JSON editor.                      |
| `data-scope`              | attribute | `document`, `section` | On the template editor: whose settings it shows. |
