# Template editor

The template editor edits a template's own settings beside the document it styles: its name, page setup, text styles, paragraph numbering, header and footer, lists, tables, figures, code blocks, equations, footnotes, contents, references and change bars, in the base library's filterable property panel.

## DOCE-TEMPLATE-EDITOR-1 - Editing a template

### DOCE-TEMPLATE-EDITOR-1.1 - Settings and inheritance

`TemplateEditor` shall show a template's settings in a searchable `PropertyPanel` (`de-template-editor`, named by `panel`), by section (`TEMPLATE_SECTIONS`), each setting a property row with the base library's field for its kind: text, a length (kept once it reads as one, such as `12pt` or `20mm`), a number, a colour, a yes-or-no that may be unset, a choice from a list, or one of a few as segments (DOCE-TEMPLATE-EDITOR-1.7), a row marked overridden while the template sets its value. A field holds the template's own value and, while it has none, shows the value `resolved` gives it from its parents (`inherited`); a field emptied, or whose menu's Reset to inherited value is picked, inherits again (`withSetting` given null leaves the setting out, and the objects it leaves empty), and a row has no reset button of its own (DOCE-TEMPLATE-EDITOR-1.13). With `isDisabled`, such as while a saved version is shown, every field shall be locked, the root publishing `data-disabled`, while the filter and the scope picker stay usable; the picker's add, move and delete buttons are locked. After page setup, the Text styles section shall hold a card for each built-in style, in reading order (`TEXT_STYLES`: title, headings 1 to 6, paragraph), named by the style and summing up its font, size and spacing, marked overridden while the scope sets any of it. A card's rows are, in order: its font, its size (in points) and its weight, slant and underline as toggles that go from inherited, shown mixed, to on, off and inherited again, on one row that wraps; its alignment as segments drawn as the base library's text alignment glyphs, justified for the paragraph only, the title and headings keeping an inert justify segment so their rows line up, with the paragraph's line height after it; its space before and after (in points), labelled `before` and `after`; its colour; for the paragraph its indentation; and for a heading its numbering: whether it numbers, the text before the number, its format and the text after. The title and headings have no line height of their own: they follow the paragraph's. The other sections' cards take the same rows for the parts of a style they hold (`StylePart`). The code block's text is in the Code blocks section.

Implementation: `src/components/template-editor/template-editor.tsx`, `src/components/template-editor/setting-row.tsx`, `src/components/template-editor/template-settings.ts`, `src/components/template-editor/style-sections.tsx`, `src/components/template-editor/style-fields.tsx`, `src/components/template-editor/style-face.tsx`, `src/components/template-editor/style-rows.tsx`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/template-editor.test.tsx`, `src/components/template-editor/setting-row.test.tsx`, `src/components/template-editor/custom-style-section.test.tsx`, `e2e/template-workspace.spec.ts`

### DOCE-TEMPLATE-EDITOR-1.2 - Following the document

Each change shall hand the host the changed template (`onChange`); a document editor given the template resolved again restyles the document and lays its pages out again at once, as the template editor lab shows beside it.

Implementation: `src/components/template-editor/template-editor.tsx`, `labs/src/template-editor.lab.tsx`
Verification: `e2e/template-editor.spec.ts`

### DOCE-TEMPLATE-EDITOR-1.3 - Sections and the parent

The editor shall edit the whole document's settings or one template section's (`Settings of`, DOCE-TEMPLATE-EDITOR-2.1); a section's own rows set its name (DOCE-TEMPLATE-EDITOR-2.3), its label and whether every document has it, writers may edit it, add and remove it, and it restarts the numbering, an unset restart showing the restart the section's own heading or paragraph styles imply (`sectionRestartsNumbering`) and a change saving the explicit flag, and its page, header and footer, list, table, code and footnote settings, which show the document's values while it sets none; A section's settings shall hold its heading numbering together after the text styles (`headingNumbering`): a row for each heading level with the text before the number, its format and the text after, a field emptied inheriting the document's again; its heading cards keep only whether each numbers. While the template has no list of sections of its own, the editor shall list the sections it inherits (those of `resolved`), and an added section, or the first change to an inherited one, shall write the whole inherited list into the template with it (`withListedSections`): a template's list replaces its parent's whole (DOCE-FORMAT-3.1), so a list of the changed section alone would drop the others. The root publishes `data-scope`. With `parentOptions`, the identity rows pick the template's parent among them, never the template itself (DOCE-TEMPLATE-EDITOR-2.5).

Implementation: `src/components/template-editor/template-editor.tsx`, `src/components/template-editor/template-scope.tsx`, `src/components/template-editor/style-sections.tsx`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/template-editor.test.tsx`, `src/components/template-editor/custom-style-section.test.tsx`

### DOCE-TEMPLATE-EDITOR-1.4 - Header and footer content

The header and footer content shall be edited in place, on the pages of the document beside the template editor (DOCE-SECTIONS-5.1), and `withRegionChange` shall write each edit into the template: where the section's pages take the region from (`resolveSectionRegion`): into the section's own region while it has one that does not inherit, and into the document's otherwise. Given the resolved template (`withRegionChange(template, change, resolved)`), a section the template inherits counts as its own, and the template takes the inherited list with the edit (DOCE-TEMPLATE-EDITOR-1.3).

The Header & footer section shall end with a row for the header's HTML and one for the footer's, each a button that opens a dialog with an HTML code editor holding the scope's own content, or the one it inherits while it has none, as `writeHtmlContent` writes it. Applying reads the markup with `readHtmlContent` (DOCE-FORMAT-6.3), so nothing the schema does not know survives, and sets it as the scope's own content; cancelling changes nothing. The button is disabled while the scope's region takes its parent's. The settings panel holds no field for a region's source.

Implementation: `src/components/template-editor/template-editor.tsx`, `src/components/template-editor/region-source.tsx`, `labs/src/template-editor.lab.tsx`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/template-editor.test.tsx`, `src/components/template-editor/region-source.test.tsx`

### DOCE-TEMPLATE-EDITOR-1.5 - The template as JSON

Withdrawn. A template is written through its rows and edited in place on the preview (DOCE-TEMPLATE-EDITOR-1.9, DOCE-TEMPLATE-EDITOR-3.16); the library offers no JSON editor, and the package exports none.

Implementation: `src/components/index.ts`
Verification: `src/components/template-editor/template-editor.test.tsx`

### DOCE-TEMPLATE-EDITOR-1.6 - Custom styles

A Custom styles section, after the text styles, shall hold a card for each custom style the scope has or inherits, with the rows of the paragraph's card but its colour, and its name, which renames the style once committed when it is a letter followed by up to fifteen letters, digits or `_` and no other style has it (DOCE-TEMPLATE-EDITOR-1.10); its header adds a style with a new name and its defaults (DOCE-TEMPLATE-EDITOR-1.10), each card's header deletes one of the scope's own styles, or, for an inherited one, lets the scope override it field by field, and without styles the section says it has none.

Implementation: `src/components/template-editor/custom-style-section.tsx`
Verification: `e2e/template-editor.spec.ts`

### DOCE-TEMPLATE-EDITOR-1.7 - Fields for sizes, fonts, numbering and pages

A text size shall be a number in points, written as one (`12pt`) and showing a size in another absolute unit in points, and one in a relative unit (such as `1.5em`) as written, in a length field, as a style's summary shows it too; a font shall be picked from `fonts` (a default list without it), each option drawn in its own font (`de-template-editor__font-option` with `--de-font-option`), a font the template names that is not offered listed first, and the field's empty option inheriting; a numbering format shall be typed or picked from the formats offered (`NUMBERING_PRESETS`), each listed with the first three numbers it gives by the formatter the document numbers with (`numberingExample`: `I.` as `I., II., III.`, `I.1.i` as `I.1.i, I.1.ii, I.1.iii`), and shall keep only a level's character (`1`, `a`, `A`, `i`, `I`) and the separators `.`, `-`, `)`, `_` and the space, with what each character numbers with under it, and a heading's text before and after its number, each of the three saying on hover what it holds, with examples; a page size shall show its dimensions, such as `A4 (210 × 297 mm)`; the margins shall be one row of four sides (the base library's `FourSidePropertyStrip`), in millimetres on an A or B size page and in inches otherwise, written in that unit, each side the strip's own small input, which takes digits and a decimal point, so the row fits a narrow settings panel, and named by its side (`Top margin`); a contents list's padding and spacing are such rows in points; a code font shall be picked from `codeFonts`, monospace fonts (`DEFAULT_CODE_FONTS` without it), or typed; orientation, a change bar's side and a caption's placement shall be segments, orientation's with the page portrait and landscape glyphs; a bulleted list's bullet shall be picked from those it may show; change bars shall show or hide each kind, with its colour, the formatting changes' too, and their offset. While a field inherits, its help shall name the value and where it comes from: the parent template, or the document settings for a section. A style's font and its size in points share one row, and a number, such as a line height, is typed without step buttons. A yes or no that may be unset is a switch captioned On or Off, or, while unset, with what it inherits, going from inherited to on, off and inherited again. A space before or after is typed as a number of points.

Implementation: `src/components/template-editor/setting-controls.tsx`, `src/components/template-editor/setting-row.tsx`, `src/components/template-editor/template-settings.ts`, `src/components/template-editor/margins-row.tsx`, `src/components/template-editor/style-fields.tsx`, `src/components/template-editor/settings-catalog.ts`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/template-editor.test.tsx`

### DOCE-TEMPLATE-EDITOR-1.8 - Previewing the template

The template editor lab shall show, on asking, the template's preview document (DOCE-TEMPLATES-8.2) styled by the template as it is edited.

Implementation: `labs/src/template-editor.lab.tsx`
Verification: `e2e/template-editor.spec.ts`

### DOCE-TEMPLATE-EDITOR-1.9 - Every setting as a row

Every setting of the template format (`TEMPLATE_SHAPE`) shall have a row, so a template is written without its JSON, apart from what other parts of the editor edit (its identity, its sections, the content of its regions and sections, and the host's extensions) and what the editor leaves to the template's file: the title's and headings' own line height, a custom style's colour, and a footnote's numbering mode, text after the number, colours, underline and text spacing, which keep their meaning when a template sets them. `TEMPLATE_SECTIONS` holds them as data, each section a list of settings and of cards (`TemplateSettingCard`), and `SettingSections` shows them after the scope, with the text and custom styles after the page setup and a host's rows at the end of a section (`extra`). Only the identity sections and the scope picker start expanded; a person opens the others:

- Page setup: the page size and orientation under a Paper heading (Page in a template section), then the margins.
- Paragraph numbering: whether paragraphs are numbered, so a template section may switch it on or off, its text before the number, format and text after on one row labelled Before, Format and After, and a card for each of its six levels with its format, number indent and text indent.
- Header & footer: whether each takes its parent's, labelled Use the parent's header (or footer) in the document's settings and Use the document's header (or footer) in a section's, its height and its space to the content.
- References (DOCE-TEMPLATE-EDITOR-1.11).
- Lists: the text before the number, the numbering format and the text after on one row labelled Before, Format and After, then the bullet, the indentation, and the space before and after on one Spacing row.
- Tables, Figures, Code blocks and Equations: their own settings (a table's borders, padding, header and rows, a figure's default width, a code block's background and its text, an equation's brackets around the number), and for each a card for its numbering (whether it numbers, the text before, format and text after) and one for its caption (its placement, picked from a list, its alignment and the text after a continued caption), then, under the Caption label and Caption text headings in the section, the font of the caption's label and of its text.
- Footnotes: the separator line and its thickness, the space above and between notes, a card for the marker's font, size, bold and italic, and one for the note text's, with its alignment and line height.
- Contents: the leader, its spacing and the space before and after it, the padding and spacing, cards for the title's and the entries' fonts, a card for each of six levels (indentation, spacing and leader), and a card for each kind of list (`DEFAULT_CONTENTS_KINDS`) with its title, its leader and each level's leader.
- Change bars: for each kind of change, its switch beside its colour on one row, then the side, picked from a list, the offset and the width.

A setting of a level writes that entry of the list, with `null` for each earlier entry the template does not set, so it inherits its parent's entry at that index; a list whose entries all inherit is left out. A template section shows only what a section may set: not the contents or the references.

Implementation: `src/components/template-editor/settings-catalog.ts`, `src/components/template-editor/object-settings.ts`, `src/components/template-editor/template-rows.tsx`, `src/components/template-editor/template-settings.ts`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/settings-catalog.test.ts`, `src/components/template-editor/layout-rows.test.tsx`, `src/components/template-editor/template-settings.test.ts`, `e2e/template-workspace.spec.ts`

### DOCE-TEMPLATE-EDITOR-1.10 - Renaming and deleting a custom style

Adding a custom style shall name it `custom_style_1`, or the first such name with a free number, and set its font to Arial, its size to 12pt, its line height to 1.5, its space before and after to 6pt and its alignment to left (`NEW_CUSTOM_STYLE`); a custom style's card has a running text style's rows without a colour. Renaming a custom style of the document's settings shall rename it with what refers to it in the template (`withCustomStyleRenamed`): a section's override of the style, and each block of the template's content in the style (its stored `attrs.style`); deleting it shall take it out of the sections too and take it off those blocks, a heading in the style becoming a paragraph of the same text. In a section's settings, renaming or deleting changes the section's own styles. While the name typed may not be taken, the field shall say why (`customStyleNameError`): it is not a letter followed by up to fifteen letters, digits or `_`, or another style has it; a stored name with a hyphen, which the format allows, keeps it. A custom style the scope inherits shall be read-only, with no delete, until it is overridden (`overrideCustomStyle`); a field set then writes only that field, so the others keep following the inherited style, and in a section's settings the override goes back to the inherited style (`resetCustomStyle`).

Implementation: `src/components/template-editor/custom-style-names.ts`, `src/components/template-editor/custom-style-section.tsx`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/custom-style-names.test.ts`, `src/components/template-editor/custom-style-section.test.tsx`, `e2e/template-workspace.spec.ts`, `src/components/template-workspace/template-workspace.test.tsx`

### DOCE-TEMPLATE-EDITOR-1.11 - References

A References section shall hold a Format card, with the format of each reference format key (`referenceFormatKeys`), named by what it points to, then a card (`Links to the target`) with whether each links to its target. The host's reference types besides other documents (`referenceTypes`, each with what its targets are in) add their keys. The first format says which tokens a format may use and that an empty one inherits; a format that is not valid (`referenceFormatError`) shall show why on its field.

Implementation: `src/components/template-editor/settings-catalog.ts`, `src/components/template-editor/setting-controls.tsx`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/setting-row.test.tsx`, `src/components/template-editor/template-editor.test.tsx`, `e2e/template-workspace.spec.ts`

### DOCE-TEMPLATE-EDITOR-1.12 - Lists of contents

The Contents section shall pick the list type it edits: all lists, or one of the seven kinds (`contentsSettings`, in the order the insert menu offers them). Each shall show its title's and entries' font, size, bold, italic and colour, its padding and spacing, and its leader (character, bold and italic, spacing, and the space before and after it, in points); a kind's own settings are written under its key in `kinds`, with a custom title, over every list's. Lists that show no page numbers, references and abbreviations, shall show no leader. For all lists and the table of contents, a heading level picker shall show one level's size, bold and italic, indentation, spacing and leader; an All levels row shall set every level's indentation, each one step past the level above it, or its space before or after, in points, only when edited, keeping what each level sets otherwise (`withAllLevels`). Bold and italic cycle inherited, on, off (an explicit normal, over what is inherited) and inherited again, and an emptied field inherits again.

Implementation: `src/components/template-editor/contents-catalog.ts`, `src/components/template-editor/contents-section.tsx`, `src/components/template-editor/style-rows.tsx`
Verification: `src/components/template-editor/contents-section.test.tsx`, `src/components/template-editor/settings-catalog.test.ts`

### DOCE-TEMPLATE-EDITOR-1.13 - Drafts, inherited values and precision

A typed field (text, a length, a number, a size, a colour, a numbering format, a margin) shall keep what is typed as its draft and write it into the template only on Enter, once focus leaves the field, when the scope changes first, or as the field goes (`useCommitOnLeave`: a draft is written into the scope it was typed in); Escape puts the template's value back, a pick from a list (a select, segments, a switch, a listed numbering format) writes at once, and an emptied field inherits again. A draft that is not valid shall say why on its field and never be written: a length is a number with a unit (`pt`, `px`, `mm`, `cm`, `in`, `em`, `rem`) or a number alone, read as pixels (`24` as `24px`), never negative; a margin is a number that is zero or more, said on the four-side strip (`errors`). A size in points takes any decimal that is zero or more, unsnapped and unbounded above (`10.25pt`), a line height any decimal that is zero or more, and a length or margin shows every digit it holds in the unit shown (`0.125in` as `0.125`, not rounded). The editor tells `onDraftsChange` the state of its fields' drafts (`TemplateDraftState`): `pending` while one holds a draft it has not written, `invalid` while one is not valid, `clean` otherwise; a host's own fields in the extension slots report theirs with `useTemplateDraft`. The template workspace enables Save while a draft is pending, so pressing it writes the draft as focus leaves the field, and holds Save while one is invalid, saying why (`settingsInvalid`) when the unsaved-changes guard asks to save. A field that inherits shall be marked (`data-inherited` on its row and on `de-template-editor__setting`), say on hover where its value comes from and how to override it (`inheritedTitle`), and offer Reset to inherited value in its context menu while it has its own value over an inherited one.

Implementation: `src/components/template-editor/setting-drafts.tsx`, `src/components/template-editor/draft-controls.tsx`, `src/components/template-editor/setting-controls.tsx`, `src/components/template-editor/setting-row.tsx`, `src/components/template-editor/margins-row.tsx`, `src/components/template-workspace/use-workspace-controls.ts`, `src/components/template-workspace/workspace-toolbar.tsx`, `labs/reference/editor-chrome.css`
Verification: `src/components/template-editor/setting-drafts.test.tsx`, `src/components/template-editor/setting-row.test.tsx`, `src/components/template-editor/margins-row.test.tsx`, `src/components/template-workspace/template-workspace-drafts.test.tsx`, `src/components/template-workspace/template-workspace.test.tsx`, `e2e/template-editor.spec.ts`

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

A section's name shall be committed once, on Enter or on leaving the field, not as it is typed; written in lower case with underscores for other characters (`sectionNameOf`); and refused, saying why under the field, when another section has it (`renameSection`). Escape restores the name, and so does a name committed with nothing left to it, such as an emptied field, in the section's row and in its tab. A committed rename hands the template to `onChange`, the old and new names to `onSectionRename`, so the host follows the section in what names it, and moves the scope to the new name.

Implementation: `src/components/template-editor/template-scope.tsx`, `src/components/template-editor/template-section-list.ts`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/template-structure.test.tsx`, `src/components/template-editor/template-section-list.test.ts`

### DOCE-TEMPLATE-EDITOR-2.4 - Adding, moving and deleting sections

The scope picker shall add a section with a new name (`freshSectionName`) after the section shown, or at the end from the document's settings, and show it; move the section shown one place earlier or later, never past either end; and delete it only once a confirming alert dialog says what deleting does, then show the document's settings. The template's list changes by name (`withSectionAt`, `withSectionMoved`, `withNamedSection`, `withoutSection`).

Implementation: `src/components/template-editor/template-scope.tsx`, `src/components/template-editor/template-section-list.ts`
Verification: `e2e/template-editor.spec.ts`, `src/components/template-editor/template-structure.test.tsx`, `src/components/template-editor/template-section-list.test.ts`

### DOCE-TEMPLATE-EDITOR-2.5 - The parent's feedback

A parent option marked `cycle`, one that inherits from the template, shall be listed, disabled, with why; a parent the template names that is not among the options shall be said to be unavailable under the field, and `parentError`, such as a parent the host could not load, shall show there instead.

Implementation: `src/components/template-editor/template-identity.tsx`
Verification: `src/components/template-editor/template-structure.test.tsx`, `src/components/template-editor/template-identity.test.tsx`, `src/components/template-workspace/template-workspace.test.tsx`

### DOCE-TEMPLATE-EDITOR-2.6 - The id and the name

The identity rows shall start with the template's id, shown read-only once the host has saved the template. While the host has never saved it (`isNew`), the id may change, committed on Enter or on leaving the field and put back by Escape, may be left empty while it is edited, and is and written as a letter and then up to 63 letters, digits and underscores, other characters becoming underscores and what comes before the first letter left out (`templateIdOf`); while what is typed holds other characters, the field says what an id is written with (`idCharacters`); an id typed with nothing left is refused, saying why (`idEmpty`), and an emptied or refused id empties the template's id, so a host cannot save it until it has one. `idError` says under the field why the id cannot be saved, and `idInputRef` reaches its input, so a host can focus it. The name shall be a draft committed on Enter or on leaving the field and put back by Escape; it may be empty while it is edited, and an emptied name commits the default name (`defaultName`). A name holds at most 120 characters and no control or formatting characters: a character it may not hold is refused as it is typed, and the field says what a name may hold (`nameCharacters`). Both fields show a placeholder while empty (`idPlaceholder`, `namePlaceholder`), and every text is a label a host may replace.

Implementation: `src/components/template-editor/template-identity.tsx`
Verification: `src/components/template-editor/template-structure.test.tsx`, `e2e/template-editor.spec.ts`

### DOCE-TEMPLATE-EDITOR-2.7 - Committing the JSON

Withdrawn with DOCE-TEMPLATE-EDITOR-1.5.

Implementation: `src/components/index.ts`
Verification: `src/components/template-editor/template-editor.test.tsx`

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
Verification: `src/components/template-workspace/template-workspace.test.tsx`, `e2e/template-workspace.spec.ts`

### DOCE-TEMPLATE-EDITOR-3.9 - Answers that come back late

The workspace shall apply a store's answer only to the template it was asked for: each request is tagged with the template open when it was made, and an answer that comes back after another template, a new one or none was opened is dropped, apart from listing the templates again after a save. Opening a template, selecting a saved version and returning to Current supersede earlier navigation as soon as they are requested, before the guard asks or the store looks up a revision. Only the latest navigation may update the shown template, version, error or loading state. When navigation is superseded, a confirmation still awaiting an answer closes and leaves the draft as it is. Each request reads the open template as it is when it is made, so a restore or a keep after the guard saved the changes saves on the revision that save made.

Implementation: `src/components/template-workspace/use-open-template.ts`, `src/components/template-workspace/use-template-workspace.ts`, `src/components/template-workspace/use-workspace-controls.ts`, `src/components/template-workspace/workspace-requests.ts`
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
Verification: `src/components/template-workspace/template-workspace-layout.test.tsx`, `e2e/template-workspace.spec.ts`

### DOCE-TEMPLATE-EDITOR-3.13 - The JSON view

Withdrawn. The workspace shows no JSON in place of the preview: it has no `debug` view, and Control+Alt+B does nothing in it.

Implementation: `src/components/template-workspace/template-workspace.tsx`
Verification: `src/components/template-workspace/template-workspace-layout.test.tsx`

### DOCE-TEMPLATE-EDITOR-3.14 - The open dialog

Open shall show a dialog (`open-dialog`, titled by `openTitle`) listing the stored templates on the base library's `Tree` (named by `templates`): the templates the host pins first (`catalog.pinned`, in its order), then each template in the folders the host places it in (`catalog.pathOf`, outermost first), folders before templates and each by name, with the icon the host gives a template (`catalog.iconOf`). A search field (`searchTemplates`) keeps the templates whose name, id or folder path holds every word typed, with their folders. Open is enabled once a template is selected and opens it; a double click or Enter on a template's row opens it too.

Implementation: `src/components/template-workspace/template-open-dialog.tsx`, `src/components/template-workspace/template-open-list.tsx`, `src/components/template-workspace/workspace-toolbar.tsx`
Verification: `src/components/template-workspace/template-workspace-layout.test.tsx`, `e2e/template-workspace.spec.ts`

### DOCE-TEMPLATE-EDITOR-3.15 - A host's own layout

`renderLayout` shall receive the workspace's parts (`TemplateWorkspaceParts`): the scope tabs, the toolbar, the messages, the preview, the properties and the history, and the tabs' panel (`panel`), which wraps what a layout shows below the tabs, so a host can place them in its own frame, such as its own side panel and header, in place of the workspace's layout, and show a view of its own, such as a list of its fields with its tab beside the scope tabs, in place of the preview and properties.

Implementation: `src/components/template-workspace/template-workspace-types.ts`, `src/components/template-workspace/template-workspace.tsx`
Verification: `src/components/template-workspace/template-workspace-layout.test.tsx`, `e2e/template-workspace.spec.ts`

### DOCE-TEMPLATE-EDITOR-3.16 - The workspace's own preview

Without `renderPreview`, the workspace shall preview the tab shown with `TemplatePreviewEditor`: a document editor over the template's preview document shown in parts (DOCE-TEMPLATES-8.6), on a section's tab only that section, its content and placeholder followed by the sample in the section's own settings (`scope`), on the document's tab the sample and then every section, drawn afresh for another template, tab, layout or version. Its headers, footers and the sections' content and placeholders shall be edited in place into the draft, with `templatePreviewLockOf({ template, scope, own })` as its editing lock, read as the template changes: what `templatePreviewLock` locks, on the document's tab each header and footer a section sets itself rather than taking the document's, which that section's tab edits, a header or footer whose switch takes its parent's (a section's set to take the document's, or the open template's own, `own` in `TemplatePreview`, set to take its parent template's, on every page that shows it), which keeps its own content for when the switch is turned off, and a table in a section's content or placeholder, whose cells and size stay as they are; a header's or footer's table stays editable (DOCE-SECTIONS-5.4). It previews the template's layout at 100%, switched in its status bar for the reader without changing the template, and is read-only, without its toolbar, while a saved version is shown. `assets` and `variables` reach its image button and variable menu. Its pages are laid out with the workspace's `pageFonts`, the host's `fonts` adapter (DOCE-HOST-1.14.1); without it the preview shows the document without pages, in fallback fonts (DOCE-PAGINATION-12.5).

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

| Hook                                 | Kind      | Values                | Description                                                   |
| ------------------------------------ | --------- | --------------------- | ------------------------------------------------------------- |
| `de-template-editor`                 | root      |                       | The template editor's settings panel.                         |
| `data-scope`                         | attribute | `document`, `section` | On the template editor: whose settings it shows.              |
| `de-template-editor__setting`        | slot      |                       | A setting's field, with its hover text.                       |
| `de-template-editor__font-option`    | slot      |                       | A font's name in the font list, drawn in that font.           |
| `de-template-editor__unit`           | slot      |                       | The unit after a style's size, on its font row.               |
| `de-template-editor__strip`          | slot      |                       | A row of fields, such as a number's before, format and after. |
| `--de-font-option`                   | property  |                       | On a font option: the font it names.                          |
| `data-inherited`                     | attribute | `true`                | On a setting's row and field: it inherits its value.          |
| `de-template-workspace`              | root      |                       | The template workspace.                                       |
| `de-template-workspace__band`        | slot      |                       | The band of scope tabs and the toolbar.                       |
| `de-template-workspace__toolbar`     | slot      |                       | The workspace's toolbar of template actions.                  |
| `de-template-workspace__messages`    | slot      |                       | The workspace's banners.                                      |
| `de-template-workspace__main`        | slot      |                       | The scope tabs' panel.                                        |
| `de-template-workspace__body`        | slot      |                       | The preview beside the side panel.                            |
| `de-template-workspace__panel`       | slot      |                       | The side panel of properties and history.                     |
| `de-template-workspace__open-dialog` | slot      |                       | The open dialog's search and tree.                            |
| `de-template-workspace__settings`    | slot      |                       | The open template's settings.                                 |
| `de-template-workspace__preview`     | slot      |                       | The host's preview of the template shown.                     |
| `de-template-workspace__history`     | slot      |                       | The open template's saved versions.                           |
| `de-template-picker`                 | root      |                       | The template picker's field.                                  |
| `data-dirty`                         | attribute | `true`                | On the workspace: the open template has unsaved changes.      |
| `data-layout`                        | attribute | `page`, `web`         | On the workspace: the layout the template shown is for.       |
| `data-loading`                       | attribute | `true`                | On the workspace: a template it asked for is loading.         |
