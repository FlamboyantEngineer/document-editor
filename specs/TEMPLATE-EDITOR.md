# Template editor

The template editor edits a template's own settings beside the document it styles: its name, page setup, text styles, paragraph numbering, header and footer, lists, tables, figures, code blocks, equations, footnotes, contents, references and change bars, in the base library's filterable property panel.

## DOCE-TEMPLATE-EDITOR-1 - Editing a template

### DOCE-TEMPLATE-EDITOR-1.1 - Settings and inheritance

`TemplateEditor` shall show a template's settings in a searchable `PropertyPanel` (`de-template-editor`, named by `panel`), by section (`TEMPLATE_SECTIONS`), each setting a property row with the base library's field for its kind: text, a length (kept once it reads as one, such as `12pt` or `20mm`), a number, a colour, a yes-or-no that may be unset, a choice from a list, or one of a few as segments (DOCE-TEMPLATE-EDITOR-1.7), a row marked overridden while the template sets its value. A field holds the template's own value and, while it has none, shows the value `resolved` gives it from its parents (`inherited`); an empty text is the template's own empty value (`withSetting` keeps `''`), shown empty rather than with the inherited value, and a row with its own value over an inherited one has the row's reset (the base library's `PropertyRow` `onReset`), which inherits again (`withSetting` given null leaves the setting out, and the objects it leaves empty). After page setup, the Text styles section shall hold a card for each built-in style, in reading order (`TEXT_STYLES`: title, headings 1 to 6, paragraph), named by the style and summing up its font, size and spacing, marked overridden while the scope sets any of it. A card's rows are its font and size (in points); its weight, slant and underline as toggles that go from inherited, shown mixed, to on, off and inherited again, and its alignment as segments drawn as the base library's text alignment glyphs, justified for the paragraph only; its colour; its space before and after (in points); its line height; for the paragraph its indentation; and for a heading its numbering: whether it numbers, the text before the number, its format and the text after. The other sections' cards take the same rows for the parts of a style they hold (`StylePart`). The code block's text is in the Code blocks section.

Implementation: `src/components/template-editor/template-editor.tsx`, `src/components/template-editor/setting-row.tsx`, `src/components/template-editor/template-settings.ts`, `src/components/template-editor/style-sections.tsx`, `src/components/template-editor/style-fields.tsx`, `src/components/template-editor/style-rows.tsx`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/template-editor.test.tsx`, `src/components/template-editor/setting-row.test.tsx`, `e2e/template-workspace.spec.ts`

### DOCE-TEMPLATE-EDITOR-1.2 - Following the document

Each change shall hand the host the changed template (`onChange`); a document editor given the template resolved again restyles the document and lays its pages out again at once, as the template editor lab shows beside it.

Implementation: `src/components/template-editor/template-editor.tsx`, `labs/src/template-editor.lab.tsx`
Verification: `e2e/template-editor.spec.ts`

### DOCE-TEMPLATE-EDITOR-1.3 - Sections and the parent

The editor shall edit the whole document's settings or one template section's (`Settings of`, DOCE-TEMPLATE-EDITOR-2.1); a section's own rows set its name (DOCE-TEMPLATE-EDITOR-2.3), its label and whether every document has it, writers may edit it, add and remove it, and it restarts the numbering, an unset restart showing the restart the section's own heading or paragraph styles imply (`sectionRestartsNumbering`) and a change saving the explicit flag, and its page, header and footer, list, table, code and footnote settings, which show the document's values while it sets none; footnote numbering is the document's only (`documentOnly`), so a section never shows it. While the template has no list of sections of its own, the editor shall list the sections it inherits (those of `resolved`), and an added section, or the first change to an inherited one, shall write the whole inherited list into the template with it (`withListedSections`): a template's list replaces its parent's whole (DOCE-FORMAT-3.1), so a list of the changed section alone would drop the others. The root publishes `data-scope`. With `parentOptions`, the identity rows pick the template's parent among them, never the template itself (DOCE-TEMPLATE-EDITOR-2.5).

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

A Custom styles section, after the text styles, shall hold a card for each custom style the scope has or inherits, with the rows of the paragraph's card and its name, which renames the style once committed when it is a letter followed by up to fifteen letters, digits, `_` or `-` and no other style has it (DOCE-TEMPLATE-EDITOR-1.10); its header adds a style with a new name, starting at 11pt, each card's header deletes the style, or, for an inherited one, overrides it in the scope with a copy of the inherited style, and without styles the section says it has none.

Implementation: `src/components/template-editor/style-sections.tsx`
Verification: `e2e/template-editor.spec.ts`

### DOCE-TEMPLATE-EDITOR-1.7 - Fields for sizes, fonts, numbering and pages

A text size shall be a number in points, written as one (`12pt`) and showing a size in another absolute unit in points, and one in a relative unit (such as `1.5em`) as written, in a length field, as a style's summary shows it too; a font shall be picked from `fonts` (a default list without it) or typed; a numbering format shall be typed or picked from the formats offered (`NUMBERING_PRESETS`), each listed with the first three numbers it gives by the formatter the document numbers with (`numberingExample`: `I.` as `I., II., III.`, `I.1.i` as `I.1.i, I.1.ii, I.1.iii`), and shall keep only a level's character (`1`, `a`, `A`, `i`, `I`) and the separators `.`, `-`, `)`, `:` and `/`, with what each character numbers with under it, and a heading's text before and after its number; a page size shall show its dimensions, such as `A4 (210 × 297 mm)`; the margins shall be one row of four sides (the base library's `FourSidePropertyStrip`), in millimetres on an A or B size page and in inches otherwise, written in that unit, each side the strip's own small input, which takes digits and a decimal point, so the row fits a narrow settings panel, and named by its side (`Top margin`); a contents list's padding and spacing are such rows in points; a code font shall be picked from `codeFonts`, monospace fonts (`DEFAULT_CODE_FONTS` without it), or typed; orientation, a change bar's side and a caption's placement shall be segments, orientation's with the page portrait and landscape glyphs; a bulleted list's bullet shall be picked from those it may show; change bars shall show or hide each kind, with its colour, the formatting changes' too, and their offset. While a field inherits, its help shall name the value and where it comes from: the parent template, or the document settings for a section. A style's font and its size in points share one row, and a number, such as a line height, is typed without step buttons. A space before or after is typed as a number of points.

Implementation: `src/components/template-editor/setting-controls.tsx`, `src/components/template-editor/setting-row.tsx`, `src/components/template-editor/template-settings.ts`, `src/components/template-editor/margins-row.tsx`, `src/components/template-editor/style-fields.tsx`, `src/components/template-editor/settings-catalog.ts`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/template-editor.test.tsx`

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
- Contents: the leader, its spacing and the space before and after it, the padding and spacing, cards for the title's and the entries' fonts, a card for each of six levels (indentation, spacing and leader), and a card for each kind of list (`DEFAULT_CONTENTS_KINDS`) with its title, its leader and each level's leader.
- References (DOCE-TEMPLATE-EDITOR-1.11) and Change bars.

A setting of a level writes that entry of the list, with `null` for each earlier entry the template does not set, so it inherits its parent's entry at that index; a list whose entries all inherit is left out. A template section shows only what a section may set: not the contents, the references or the footnote numbering.

Implementation: `src/components/template-editor/settings-catalog.ts`, `src/components/template-editor/object-settings.ts`, `src/components/template-editor/template-rows.tsx`, `src/components/template-editor/template-settings.ts`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/settings-catalog.test.ts`, `src/components/template-editor/template-settings.test.ts`, `e2e/template-workspace.spec.ts`

### DOCE-TEMPLATE-EDITOR-1.10 - Renaming and deleting a custom style

Renaming a custom style of the document's settings shall rename it with what refers to it in the template (`withCustomStyleRenamed`): a section's override of the style, and each block of the template's content in the style; deleting it shall take it out of the sections too and take it off those blocks. In a section's settings, renaming or deleting changes the section's own styles. While the name typed may not be taken, the field shall say why (`customStyleNameError`): it is not a letter followed by up to fifteen letters, digits, `_` or `-`, or another style has it.

Implementation: `src/components/template-editor/custom-style-names.ts`, `src/components/template-editor/style-sections.tsx`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/custom-style-names.test.ts`, `e2e/template-workspace.spec.ts`

### DOCE-TEMPLATE-EDITOR-1.11 - References

A References section shall hold a Format card, with the format of each reference format key (`referenceFormatKeys`), named by what it points to, then a card (`Links to the target`) with whether each links to its target. The host's reference types besides other documents (`referenceTypes`, each with what its targets are in) add their keys. The first format says which tokens a format may use and that an empty one inherits; a format that is not valid (`referenceFormatError`) shall show why on its field.

Implementation: `src/components/template-editor/settings-catalog.ts`, `src/components/template-editor/setting-controls.tsx`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/setting-row.test.tsx`, `src/components/template-editor/template-editor.test.tsx`, `e2e/template-workspace.spec.ts`

### DOCE-TEMPLATE-EDITOR-1.12 - Lists of contents

The Contents section shall pick the list type it edits: all lists, or one of the seven kinds (`contentsSettings`, in the order the insert menu offers them). Each shall show its title's and entries' font, size, bold, italic and colour, its padding and spacing, and its leader (character, bold and italic, spacing, and the space before and after it, in points); a kind's own settings are written under its key in `kinds`, with a custom title, over every list's. Lists that show no page numbers, references and abbreviations, shall show no leader. For all lists and the table of contents, a heading level picker shall show one level's size, bold and italic, indentation, spacing and leader; an All levels row shall set every level's indentation, each one step past the level above it, or its space before or after, in points, only when edited, keeping what each level sets otherwise (`withAllLevels`). Bold and italic cycle inherited, on, off (an explicit normal, over what is inherited) and inherited again, and an emptied field inherits again.

Implementation: `src/components/template-editor/contents-catalog.ts`, `src/components/template-editor/contents-section.tsx`, `src/components/template-editor/style-rows.tsx`
Verification: `src/components/template-editor/contents-section.test.tsx`, `src/components/template-editor/settings-catalog.test.ts`

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

While the host has never saved the template (`isNew`), the identity rows shall start with its id, committed on Enter or on leaving the field and written as a letter and then up to 63 letters, digits and underscores, other characters becoming underscores and what comes before the first letter left out (`templateIdOf`); an id with nothing left is refused, saying why, and empties the template's id, so a host cannot save it until it has one. `idError` says under the field why the id cannot be saved, and `idInputRef` reaches its input, so a host can focus it. A saved template's id has no row.

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

## DOCE-TEMPLATE-EDITOR-3 - The template workspace

### DOCE-TEMPLATE-EDITOR-3.1 - Opening templates

`TemplateWorkspace` (`de-template-workspace`) shall edit the templates of a host's template store (`store`, DOCE-HOST-1.24) one at a time: Open in the toolbar (`toolbar`) picks a stored template in a dialog (DOCE-TEMPLATE-EDITOR-3.14), opening it at its latest revision in the template editor (`settings`, DOCE-TEMPLATE-EDITOR-1) with the other stored templates as its parents, and tells the host which template is open (`onTemplateIdChange`) once it has loaded; a template that fails to load leaves the one open as it was and shows the store's message. `defaultTemplateId` opens one at first. What the template inherits is loaded through the store, the base template from the library when the store has none, and the editor shows it as the inherited values. The root publishes `data-dirty` while the open template has changes it has not saved, and `data-loading` with `aria-busy` while a template it asked for is loading, during which the scope tabs are disabled.

Implementation: `src/components/template-workspace/template-workspace.tsx`, `src/components/template-workspace/use-template-workspace.ts`, `src/components/template-workspace/template-requests.ts`, `labs/src/template-workspace.lab.tsx`, `labs/template-workspace.html`
Verification: `src/components/template-workspace/template-workspace.test.tsx`, `e2e/template-workspace.spec.ts`

### DOCE-TEMPLATE-EDITOR-3.2 - Saving with a revision guard

Save shall store the open template's changes on the revision it was opened or last saved at, and say for a moment (`SAVE_FEEDBACK_MS`) through its icon, its name and its tooltip that it saved (`saved`) or why it did not (`saveFailed`); a store that refuses the save as a conflict, because another save came between, leaves the changes and asks the reader to reload the template as stored now, dropping them, or to keep them, saving them over the stored revision. Another failure, including one to read the template as stored now, shows the store's message. Changes made while a save is on its way stay in the draft once it returns, unsaved, and the next save stores them on the revision it made.

Implementation: `src/components/template-workspace/template-workspace.tsx`, `src/components/template-workspace/use-template-workspace.ts`
Verification: `src/components/template-workspace/template-workspace.test.tsx`, `src/components/template-workspace/template-workspace-requests.test.tsx`, `e2e/template-workspace.spec.ts`

### DOCE-TEMPLATE-EDITOR-3.3 - New templates and copies

New template shall open a blank, unsaved template (`blankTemplate`): no id or name yet and one editable section of its own, which takes the document's header and footer. Its id is a row until its first save (DOCE-TEMPLATE-EDITOR-2.6), which creates it in the store; Save while it has no id saves nothing, shows the Properties pane, focuses the id field and says there that it needs one (`idNeeded`), and Save while its parent inherits from it says so under the parent field (`parentCycle`). Save as, on a saved template, shall create a copy of the open template's settings, changes included, under an id and name the reader gives in a dialog, with the host's own fields (`saveAsFields`), which draw and change the copy, such as its folder under `extensions`, and open the copy; an id the store already has is refused, saying so while the id field holds that id. The dialog cannot be dismissed while the copy is on its way.

Implementation: `src/components/template-workspace/template-workspace.tsx`, `src/components/template-workspace/use-template-workspace.ts`, `src/components/template-workspace/template-dialogs.tsx`
Verification: `src/components/template-workspace/template-workspace.test.tsx`, `src/components/template-workspace/template-workspace-requests.test.tsx`, `e2e/template-workspace.spec.ts`

### DOCE-TEMPLATE-EDITOR-3.4 - Deleting a template

Delete, which the toolbar offers after Save only when the host asks (`canDelete`), shall remove the open template from the store once the reader confirms in an alert dialog, leaving no template open; a store that refuses, such as for a template another inherits, shows why.

Implementation: `src/components/template-workspace/template-dialogs.tsx`, `src/components/template-workspace/use-template-workspace.ts`
Verification: `src/components/template-workspace/template-workspace.test.tsx`

### DOCE-TEMPLATE-EDITOR-3.5 - History and restoring

With a store that lists versions, the History pane shall show the open template's saved versions (`history`) on the editor's `RevisionList` composition, newest first and the current one marked, each with who saved it (`personOf`, from the version's author id, the id as a name by default); before the first save it says the template has none yet (`noHistory`). A version row's View action shows its settings read-only in the editor and the preview, with a banner naming it, which returns to the template or restores the version, and tells the host the revision shown (`onRevisionChange`, null on the way back). Restoring, from the banner or the history after its confirmation, stages the version's settings as the open template's unsaved changes, and Save stores them as its newest revision. While the template has unsaved changes, which the restore would drop, restoring first asks the reader to save, discard or stay (DOCE-TEMPLATE-EDITOR-3.7).

Implementation: `src/components/template-workspace/template-history.tsx`, `src/components/template-workspace/template-workspace.tsx`, `src/components/template-workspace/use-template-workspace.ts`
Verification: `src/components/template-workspace/template-workspace.test.tsx`, `src/components/template-workspace/template-workspace-requests.test.tsx`, `e2e/template-workspace.spec.ts`

### DOCE-TEMPLATE-EDITOR-3.6 - The preview and web-layout templates

`renderPreview` shall draw the template shown, resolved with what it inherits, beside the side panel (`preview`, a region named by `preview`), with the scope of the tab shown and, while the template is editable, `onRegionChange`, which writes a header or footer edited on the preview's pages into the open template (`withRegionChange`), and `onTemplatePartChange`, which writes a section's starting content or placeholder edited in place (DOCE-SECTIONS-5.2) into it (`withTemplatePart`). Without `renderPreview` the workspace draws its own preview (DOCE-TEMPLATE-EDITOR-3.16). Whether a template is for pages or the web layout is the host's to say (`layoutOf`, pages by default), since the stored format does not hold it; the preview is told the layout and the root publishes it as `data-layout`, so a web-layout template previews as the web layout shows a document, and the template editor, given the layout (`layout`), shows no page size, orientation, header or footer rows for it (`pagesOnly`, DOCE-TEMPLATE-EDITOR-3.18), keeping its margins, which inset the web layout's content.

Implementation: `src/components/template-workspace/template-workspace.tsx`, `src/components/template-editor/template-editor.tsx`, `src/components/template-editor/template-rows.tsx`, `src/components/template-editor/settings-catalog.ts`
Verification: `src/components/template-workspace/template-workspace.test.tsx`, `e2e/template-workspace.spec.ts`

### DOCE-TEMPLATE-EDITOR-3.7 - Guarding unsaved changes

The workspace shall register its unsaved changes with the base library's `UnsavedChangesGuard`, named by the template: opening another template or a new one while the open one has changes first asks the reader to save, discard or stay, and leaving the page asks the browser to confirm. Discarding drops the changes of a saved template and closes an unsaved one.

Implementation: `src/components/template-workspace/template-workspace.tsx`, `src/components/template-workspace/use-template-workspace.ts`
Verification: `src/components/template-workspace/template-workspace.test.tsx`, `e2e/template-workspace.spec.ts`

### DOCE-TEMPLATE-EDITOR-3.8 - The template picker

`TemplatePicker` (`de-template-picker`) shall offer the templates given, as a template store lists them, in a select field, by name in alphabetical order with the id under it, or by id alone for one without a name, and hand the id of the one picked to `onSelectionChange`.

Implementation: `src/components/template-workspace/template-picker.tsx`
Verification: `src/components/template-workspace/template-workspace.test.tsx`

### DOCE-TEMPLATE-EDITOR-3.9 - Answers that come back late

The workspace shall apply a store's answer only to the template it was asked for: each request is tagged with the template open when it was made, and an answer that comes back after another template, a new one or none was opened is dropped, apart from listing the templates again after a save. Of the requests to show a saved version, only the latest one's answer applies, so a version asked for before the reader went back to the template, or picked another, is not shown. Each request reads the open template as it is when it is made, so a restore or a keep after the guard saved the changes saves on the revision that save made.

Implementation: `src/components/template-workspace/use-open-template.ts`, `src/components/template-workspace/use-template-workspace.ts`
Verification: `src/components/template-workspace/template-workspace-requests.test.tsx`

### DOCE-TEMPLATE-EDITOR-3.10 - Scope tabs

The workspace shall show the template's scopes as tabs (`tabs`, named by `scopes`) in a band (`band`, a group named by `band`) with the toolbar at its end: the document's settings first (`documentTab`), which no action removes, then one tab per template section, inherited ones included, by its label, or its name without one. Selecting a tab shows that scope's properties and preview. The add button after the last tab appends a section with a new name (`freshSectionName`) and selects it, keeping focus, so it can add another. A section tab's menu renames it in place (its label when it has one, otherwise its name, as DOCE-TEMPLATE-EDITOR-2.3 writes one, a refused name saying why in the field), inserts a new section before or after it and selects it, and deletes it once a confirming alert dialog says what deleting does, then selects the document's tab. The template editor beside them shows no scope picker of its own (`showsScopePicker={false}`).

Implementation: `src/components/template-workspace/template-section-tabs.tsx`, `src/components/template-workspace/template-workspace.tsx`, `src/components/template-editor/template-editor.tsx`
Verification: `src/components/template-workspace/template-workspace-layout.test.tsx`, `src/components/template-workspace/template-workspace.test.tsx`, `e2e/template-workspace.spec.ts`

### DOCE-TEMPLATE-EDITOR-3.11 - Toolbar and side panel

The toolbar shall hold icon buttons, each named and with a tooltip, in this order: New template, Open, Save as and Save, then Delete when the host offers it. Below the band, in the tabs' panel (`main`), the preview of the tab shown sits beside a side panel at the end edge (`panel`, the base library's `DockPanel` named by `panel`) with a Properties pane and a History pane in that order, which stay mounted while hidden. Properties shows the scope's settings in a region named Document settings (`documentSettings`) for the document's tab and Section settings (`sectionSettings`) for a section's. The panel starts collapsed to its rail unless `defaultPanelExpanded`; it does not remember whether it was expanded, but remembers the pane last shown in the provider's storage under `panelPersistKey` (`de-template-workspace:pane` by default). It resizes between 260 and 520 pixels and shows its pane in a drawer in a frame narrower than 760 pixels.

Implementation: `src/components/template-workspace/workspace-toolbar.tsx`, `src/components/template-workspace/workspace-layout.tsx`, `src/components/template-workspace/workspace-parts.tsx`, `src/components/template-workspace/template-workspace.tsx`
Verification: `src/components/template-workspace/template-workspace-layout.test.tsx`, `e2e/template-workspace.spec.ts`

### DOCE-TEMPLATE-EDITOR-3.12 - The template and version a host names

A host may hold the template open (`templateId`) and the version shown (`revision`), such as from its route, the workspace starting from them: a change of `templateId` opens that template, at `revision` when given, once unsaved changes are saved or discarded (DOCE-TEMPLATE-EDITOR-3.7), and staying calls `onTemplateIdChange` with the open template's id, so the host can put it back; a change of `revision` alone shows that version, or the template with null. New template tells the host that no stored template is open (null). `defaultRevision` shows a version at first.

Implementation: `src/components/template-workspace/template-workspace.tsx`, `src/components/template-workspace/use-template-workspace.ts`
Verification: `src/components/template-workspace/template-workspace-layout.test.tsx`

### DOCE-TEMPLATE-EDITOR-3.13 - The JSON view

With `debug`, Control+Alt+B in the workspace shall show the open template's JSON editor (`json`, a region named by `json`, DOCE-TEMPLATE-EDITOR-2.7) in place of the preview, and the preview again on the next press; the root publishes `data-view="json"` while it shows. Save is disabled while the text is not a valid template. A held key's repeats and a key pressed during a text composition do nothing, and without `debug` the keys do nothing.

Implementation: `src/components/template-workspace/template-workspace.tsx`, `src/components/template-workspace/workspace-parts.tsx`, `src/components/template-workspace/workspace-json.tsx`
Verification: `src/components/template-workspace/template-workspace-layout.test.tsx`, `e2e/template-workspace.spec.ts`

### DOCE-TEMPLATE-EDITOR-3.14 - The open dialog

Open shall show a dialog (`open-dialog`, titled by `openTitle`) listing the stored templates on the base library's `Tree` (named by `templates`): the templates the host pins first (`catalog.pinned`, in its order), then each template in the folders the host places it in (`catalog.pathOf`, outermost first), folders before templates and each by name, with the icon the host gives a template (`catalog.iconOf`). A search field (`searchTemplates`) keeps the templates whose name, id or folder path holds every word typed, with their folders. Open is enabled once a template is selected and opens it; a double click or Enter on a template's row opens it too.

Implementation: `src/components/template-workspace/template-open-dialog.tsx`, `src/components/template-workspace/template-open-list.tsx`, `src/components/template-workspace/workspace-toolbar.tsx`
Verification: `src/components/template-workspace/template-workspace-layout.test.tsx`, `e2e/template-workspace.spec.ts`

### DOCE-TEMPLATE-EDITOR-3.15 - A host's own layout

`renderLayout` shall receive the workspace's parts (`TemplateWorkspaceParts`): the scope tabs, the toolbar, the messages, the preview, the properties and the history, and the tabs' panel (`panel`), which wraps what a layout shows below the tabs, so a host can place them in its own frame, such as its own side panel and header, in place of the workspace's layout.

Implementation: `src/components/template-workspace/template-workspace-types.ts`, `src/components/template-workspace/template-workspace.tsx`
Verification: `src/components/template-workspace/template-workspace-layout.test.tsx`

### DOCE-TEMPLATE-EDITOR-3.16 - The workspace's own preview

Without `renderPreview`, the workspace shall preview the tab shown with `TemplatePreviewEditor`: a document editor over the template's preview document shown in parts (DOCE-TEMPLATES-8.6), on a section's tab only that section, its content and placeholder followed by the sample in the section's own settings (`scope`), on the document's tab the sample and then every section, drawn afresh for another template, tab, layout or version. Its headers, footers and the sections' content and placeholders shall be edited in place into the draft, with `templatePreviewLockOf({ template, scope })` as its editing lock: what `templatePreviewLock` locks, on the document's tab each header and footer a section sets itself rather than taking the document's, which that section's tab edits, and a table in a section's content or placeholder, whose cells and size stay as they are; a header's or footer's table stays editable (DOCE-SECTIONS-5.4). It previews the template's layout at 100%, switched in its status bar for the reader without changing the template, and is read-only, without its toolbar, while a saved version is shown. `assets` and `variables` reach its image button and variable menu.

Implementation: `src/components/template-workspace/template-preview-editor.tsx`, `src/components/template-workspace/workspace-parts.tsx`, `src/engine/template-preview-lock.ts`, `src/model/templates/template-preview.ts`
Verification: `src/components/template-workspace/template-preview-editor.test.tsx`, `src/engine/template-preview-lock.test.ts`, `src/model/templates/template-preview.test.ts`, `e2e/template-workspace.spec.ts`

### DOCE-TEMPLATE-EDITOR-3.17 - The preview's toolbar and status bar

`TEMPLATE_PREVIEW_TOOLBAR`, as a document editor's `toolbar`, shall keep what a template's own content takes: undo and redo, the text style with the title before heading 1 (DOCE-EDITOR-4.1), the formats but the link, the bulleted and numbered lists, and a table, a page break, a variable, a script, a symbol and an image asset, leaving out references, footnotes, figures, code, math, contents, sections, abbreviations and the layout and mode controls. `TEMPLATE_PREVIEW_STATUS_BAR` shall keep the layout switch and the zoom, and `TEMPLATE_PREVIEW_ZOOM_LEVELS` be 50, 75, 100, 125 and 150%. The image asset item (`image-asset`, `insertImageAsset`) shall show while the template's own content is edited and the host's `assets` can search: it opens the host's images (an asset picker) and places the one chosen at the selection as a template image (`insertTemplateImage`, DOCE-SCHEMA-3.3), stored by its asset and snapshot and at its own size shrunk to fit 160 by 96 pixels, and it is disabled, saying why, where no image can go.

Implementation: `src/components/template-workspace/template-preview-editor.tsx`, `src/components/document-editor/template-image-button.tsx`, `src/components/document-editor/insert-controls.tsx`, `src/engine/template-images.ts`
Verification: `src/components/template-workspace/template-preview-editor.test.tsx`, `src/engine/template-images.test.ts`

### DOCE-TEMPLATE-EDITOR-3.18 - Root and web-layout templates

A template the host's `isRoot` names shall inherit nothing, not even the base template: the workspace resolves it as it is, previews it so, and shows no parent row for it. A template the host's `isNameReadOnly` names shall show its name read-only. Given the web layout (`layout`), the template editor shall leave out, besides the page size, orientation and the header and footer, the paragraph numbering, the footnotes, the references, the change bars and the contents (`pagesOnly`), and read and write the margins in pixels; on pages they stay in millimetres on an A or B size page and in inches otherwise.

Implementation: `src/components/template-workspace/workspace-assembly.tsx`, `src/components/template-workspace/workspace-parts.tsx`, `src/components/template-workspace/use-template-workspace.ts`, `src/components/template-editor/settings-catalog.ts`, `src/components/template-editor/contents-catalog.ts`, `src/components/template-editor/margins-row.tsx`
Verification: `src/components/template-workspace/template-workspace.test.tsx`

## Hooks

| Hook                                 | Kind      | Values                | Description                                              |
| ------------------------------------ | --------- | --------------------- | -------------------------------------------------------- |
| `de-template-editor`                 | root      |                       | The template editor's settings panel.                    |
| `de-template-json-editor`            | root      |                       | The template's JSON editor.                              |
| `data-scope`                         | attribute | `document`, `section` | On the template editor: whose settings it shows.         |
| `de-template-workspace`              | root      |                       | The template workspace.                                  |
| `de-template-workspace__band`        | slot      |                       | The band of scope tabs and the toolbar.                  |
| `de-template-workspace__toolbar`     | slot      |                       | The workspace's toolbar of template actions.             |
| `de-template-workspace__messages`    | slot      |                       | The workspace's banners.                                 |
| `de-template-workspace__main`        | slot      |                       | The scope tabs' panel.                                   |
| `de-template-workspace__body`        | slot      |                       | The preview beside the side panel.                       |
| `de-template-workspace__panel`       | slot      |                       | The side panel of properties and history.                |
| `de-template-workspace__json`        | slot      |                       | The template's JSON, shown in place of the preview.      |
| `de-template-workspace__open-dialog` | slot      |                       | The open dialog's search and tree.                       |
| `de-template-workspace__settings`    | slot      |                       | The open template's settings.                            |
| `de-template-workspace__preview`     | slot      |                       | The host's preview of the template shown.                |
| `de-template-workspace__history`     | slot      |                       | The open template's saved versions.                      |
| `de-template-picker`                 | root      |                       | The template picker's field.                             |
| `data-dirty`                         | attribute | `true`                | On the workspace: the open template has unsaved changes. |
| `data-layout`                        | attribute | `page`, `web`         | On the workspace: the layout the template shown is for.  |
| `data-loading`                       | attribute | `true`                | On the workspace: a template it asked for is loading.    |
| `data-view`                          | attribute | `json`                | On the workspace: the JSON view shows.                   |
