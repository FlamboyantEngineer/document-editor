# Objects

Inserting and changing the document's objects: code blocks and linked code, inline and display math, figures, lists of contents and special characters. A new block goes in place of the empty paragraph holding the caret, or after the top-level block holding it (`newBlockRange`).

## DOCE-OBJECTS-1 - Commands

### DOCE-OBJECTS-1.1 - Code blocks

`insertCodeBlock(language)` shall turn the selected text blocks into one code block holding their text, line by line, or insert an empty code block where a new block goes, with the caret in it; Mod-Alt-C inserts one. `setCodeLanguage(language)` sets the language of the code block or linked code holding, or selected at, the selection.

Implementation: `src/engine/object-commands.ts`
Verification: `src/engine/object-commands.test.ts`

### DOCE-OBJECTS-1.2 - Linked code

`setLinkedCode({ url, code, language, startLine })` shall insert linked code where a new block goes, selected, or change the linked code selected. `parseCodeLines(url)` reads the lines a URL's fragment names, such as `#L10-L20` or `#L7`. Typing while linked code, or any other block object, is selected leaves it, so a stray key never replaces it; the object views, which the editing plugins install, keep the writer's typed text from replacing a selected node unless its type replaces on typing: as its node spec's `replaceOnType` says, or else for inline nodes, such as inline math, only.

Implementation: `src/engine/object-commands.ts`, `src/model/linked-code.ts`, `src/engine/object-views.ts`
Verification: `src/engine/object-commands.test.ts`, `src/engine/object-views.test.ts`

### DOCE-OBJECTS-1.3 - Math

`insertMath(latex, { display })` shall insert math written as LaTeX, inline in place of the selection or as a block where a new block goes, and select it; empty LaTeX is refused. `setMathSource(latex)` sets the LaTeX of the math selected, and empty LaTeX deletes it; `convertMath` turns inline math into a block after its paragraph, or a block into inline math in a paragraph of its own.

Implementation: `src/engine/object-commands.ts`
Verification: `src/engine/object-commands.test.ts`

### DOCE-OBJECTS-1.4 - Figures

`insertFigure(source)` shall insert a new figure where a new block goes, after the figure selected when one is, selected, with its type (an image by default, or a diagram), its source (an asset's id and snapshot, or a URL), alternative text, caption, size and alignment, so figures inserted in turn follow one another. `setFigure(source)` shall change the figure selected, keeping what the source leaves out, its type included, or else insert one. `setObjectLayout(layout)` aligns the figure or table selected: left, centred, right or across the page (`fit`, stored as `fit-page-width`).

The figure dialog shall insert an image or a diagram, or change the figure selected, keeping its type. An image comes from an upload through the host's `assets`, from the host's images through the ui-components AssetPicker in a popover while `assets.search` exists (its alternative text, size, alignment and lock carry over), or from an address. A diagram comes from the host's `diagrams` adapter (DOCE-HOST-1.15): its button draws a new diagram, or edits the figure's, and the dialog takes the stored diagram and, for a figure without a size, its size; closing the dialog aborts the edit, and a failure shows as the dialog's error. While the host draws diagrams, the dialog for a new figure offers the type as a choice, and the toolbar's figure item becomes a menu of an image and a diagram; otherwise it stays a button for an image. The dialog sets the width and the height in pixels with `Keep proportions`, on at first: while it holds, a new width sets the height in the figure's proportions (from both sides when set, else from the drawing's natural size) and a new height sets the width, and clearing one clears both. Every size is clamped to 16 pixels a side at least and at most 2000, and to the width of the page's content (`resizeFigure`, `clampFigureSize`), scaling as a whole while the proportions are kept; a size an asset or a diagram brings is clamped the same way.

Implementation: `src/engine/object-commands.ts`, `src/components/document-editor/figure-dialog.tsx`, `src/components/document-editor/figure-sources.tsx`, `src/components/document-editor/figure-size.ts`, `src/components/document-editor/insert-controls.tsx`
Verification: `src/engine/object-commands.test.ts`, `src/components/document-editor/figure-dialog.test.tsx`, `src/components/document-editor/figure-size.test.ts`, `e2e/objects.spec.ts`

### DOCE-OBJECTS-1.5 - Lists of contents and characters

`insertContents(kind, depth)` shall insert a list of contents of a kind (DOCE-CONTENTS) where a new block goes, selected, and `setContentsDepth(depth)` set the deepest heading level the list selected shows. `insertCharacter(character)` types a character, such as a symbol from a picker, in the formatting at the caret.

Implementation: `src/engine/object-commands.ts`
Verification: `src/engine/object-commands.test.ts`

### DOCE-OBJECTS-1.6 - Links

`setLink(href)` shall link the selected text to an address, or change the address of the link at the caret, the whole link; at a caret outside a link it types the address, linked. An empty address removes the link, and an address a link may not hold (DOCE-SCHEMA-3.8) is refused. `linkAt(state)` gives the address of the link at the selection.

Implementation: `src/engine/object-commands.ts`
Verification: `src/engine/object-commands.test.ts`

### DOCE-OBJECTS-1.7 - Typeset math

`createMathViews({ render })`, which the editing plugins install, shall draw each inline and display math node (`de-math`, with `data-display`) as its typeset MathML, through the base library's KaTeX renderer by default, in every view, the pages' measuring view too: the LaTeX source shows while it typesets (`data-state="pending"`), the MathML once it has (`ready`), built by the base library's `renderMathElement`, which keeps only MathML's own elements and attributes, and the source, with the renderer's reason, when it does not typeset (`invalid`). A math node or an image whose size changes once drawn has the pages measured again (`de-remeasure`).

Implementation: `src/engine/math-views.ts`, `src/pagination/layout-triggers.ts`, `src/utils/remeasure.ts`
Verification: `e2e/objects.spec.ts`

### DOCE-OBJECTS-1.8 - Math as it is typed

The math views shall write math as it is typed: typing the closing dollar of `$` LaTeX `$`, the LaTeX neither starting nor ending with a space nor its closing dollar escaped (`\$`), turns it, with its dollars, into inline math with the caret after it, except in code; Enter in a paragraph holding only `$$` and LaTeX, closed by `$$` or not, turns it into display math followed by an empty paragraph holding the caret, and a paragraph holding only `$$` into empty display math, selected and edited in place. Mod-Alt-L, the shortcut table's `math` key (DOCE-EDITOR-6.2), writes the text selected in one paragraph as inline math, or empty inline math at the caret, edited in place. Enter on selected math and a double click on math edit it in place too. `mathEditingAt(state)` gives the math edited in place, kept through changes until it goes; `commitMathEditing(latex)` sets its LaTeX, deleting it when the LaTeX is empty, and leaves the caret after inline math or display math selected; `cancelMathEditing` leaves it as it was, deleting math still empty. While the editor is editable, it shows the base library's `MathField` (inline or display, named by `mathSource`) over the math edited in place, focused: Enter (inline) or Ctrl or Cmd with Enter (display) commits the LaTeX, focus leaving the field commits a changed LaTeX and otherwise cancels, and Escape cancels; focus then goes back to the document. The fields' layer (`de-object-editors`) covers the editor's body and its field (`de-object-editors__field`, with `data-kind` `math` or `caption`) publishes the box of the math, relative to the layer, as `--de-object-editors-top`, `--de-object-editors-left`, `--de-object-editors-width` and `--de-object-editors-height`.

Implementation: `src/engine/math-input.ts`, `src/engine/math-views.ts`, `src/components/document-editor/object-editors.tsx`, `labs/reference/editor-chrome.css`
Verification: `src/engine/math-input.test.ts`, `e2e/math-input.spec.ts`

## DOCE-OBJECTS-2 - Captions

### DOCE-OBJECTS-2.1 - A caption's text

`captionedAt(state)` shall find the table, figure or code block selected or holding the selection; `setCaption(text)` sets its caption text, with its spaces collapsed, and shows its caption, and `toggleCaption(shown)` shows or hides it, toggling it by default. The context menu offers editing the caption in a dialog and showing or hiding it (DOCE-EDITOR-3.8).

Implementation: `src/engine/captions.ts`
Verification: `src/engine/table-format.test.ts`, `e2e/captions.spec.ts`

### DOCE-OBJECTS-2.2 - The caption line

A caption line shall read the object's label and number, from the template's numbering of its kind (`--doc-<kind>-counter-content`), then its text, `Table 1.1 - Limits`; the reference stylesheet counts each kind, a later part of a split object and a table with its caption hidden excepted, places captions as the template says, and ends a later part's caption with the template's continued suffix (`--doc-<kind>-caption-continued`).

Implementation: `src/model/schema/table-nodes.ts`, `labs/reference/document.css`
Verification: `e2e/captions.spec.ts`

### DOCE-OBJECTS-2.3 - Captions edited in place

A double click on a caption line, or `editCaption`, shall edit the caption of the table, figure or code block it belongs to, or at the selection, in place: `captionEditingAt(state)` gives that object, kept through changes until it goes, and marks it `data-caption-editing`; `commitCaptionEditing(text)` sets its caption text as `setCaption` does, in one change, with the object selected after, and `cancelCaptionEditing` leaves it as it was. While the editor is editable, it shows the base library's `InlineTextField` (named by `caption`) over the caption line (`de-object-editors__field`, `data-kind="caption"`, placed as DOCE-OBJECTS-1.8 says), focused, holding the caption text: Enter commits the text, focus leaving the field commits a changed text and otherwise cancels, and Escape cancels; focus then goes back to the document. Select all and paste stay inside the field.

Implementation: `src/engine/caption-views.ts`, `src/engine/object-views.ts`, `src/components/document-editor/object-editors.tsx`
Verification: `src/engine/caption-views.test.ts`, `e2e/captions.spec.ts`

## DOCE-OBJECTS-3 - Object views

### DOCE-OBJECTS-3.1 - Line numbers

`createObjectViews({ lineNumbers })`, which the editing plugins install, shall draw a gutter of line numbers (`de-code-gutter`) before the code of linked code (the default), all code (`all`) or none (`none`), numbered from the code's first line (`startLine`, or a continued block's `codeLineStart`) and kept in step with its text, in every view; `lineNumbers(code, first)` gives them.

Implementation: `src/engine/object-views.ts`
Verification: `e2e/objects.spec.ts`

### DOCE-OBJECTS-3.2 - Signatures

The object views shall draw a signature (`de-signature`, with `data-signed`) as its strokes, from its stored vector, and the signer's name (`de-signature__name`), and an unsigned one as the name alone.

Implementation: `src/engine/object-views.ts`
Verification: `e2e/objects.spec.ts`

### DOCE-OBJECTS-3.3 - Highlighting

The object views shall highlight the text of each code block and the code of linked code in their language, in every view: `highlightCode(code, language)` splits code into its tokens through the base library's code tokenizer (`resolveCodeTokenizer`), for JavaScript (`js`), TypeScript (`ts`), Python (`py`), C, C++ (`c++`), JSON, XML, HTML, CSS, YAML (`yml`), SQL, shell (`bash`, `sh`) and Markdown (`md`), and gives none for plain text or another language. Each token with a kind (`keyword`, `string`, `number`, `comment`, `key`, `literal`, `punctuation`, `link`, `invalid`), a run of tokens of one kind as one, shall be painted, in a code block, with the window's named highlight `de-code-<kind>` (`CSS.highlights`, `codeHighlightName`), which leaves the block's DOM as the editor draws it, and shall be marked, in linked code, `de-code-token` with its kind in `data-token`; the text stays as it is, and token styles shall not change layout. A code block shall be painted again when its text, its language or the elements that draw it change, and no other; a block of thousands of tokens shall not slow the pages' layout. Without named highlights in the window, code blocks shall show unpainted.

Implementation: `src/engine/code-highlighting.ts`, `src/engine/object-views.ts`
Verification: `src/engine/code-highlighting.test.ts`, `e2e/objects.spec.ts`

## DOCE-OBJECTS-4 - Script blocks

### DOCE-OBJECTS-4.1 - Inserting a script block

`insertScriptBlock(script)` shall insert a script block with the script given where a new block goes, selected and showing nothing yet, and `setScriptSource(script)` shall set the script of the script block at the selection; `listScriptBlocks(doc)` gives a document's script blocks with an element id, in document order, and `scriptBlockAt(state)` the one at the selection.

Implementation: `src/engine/scripts.ts`
Verification: `src/engine/scripts.test.ts`

### DOCE-OBJECTS-4.2 - Running scripts

`runScripts(view, runner, { ids })` shall run the scripts of the document, or those of the blocks with the ids given, one at a time in document order, each against the document as it is, then put what they produced in their blocks as one change the writer can undo, never recorded as a suggestion, with when it was produced (`renderedAt`); it resolves with the ids that failed, which `scriptsState` keeps with their messages until the next run. A block whose script changed while it ran, or whose output is the same as the one it shows, keeps what it shows: outputs are compared by their nodes, text, marks and attributes, the attributes that identify an element (`dataId`, `dataAuthor`, `dataAiSession`, `captionDataId`) aside, so a rerun that produces the same content leaves the document unchanged. The elements of an output put in take element ids made from the block's id and their place in the output, in document order, so the same output in the same block always has the same ids. While the host runs scripts, `runOpeningScripts` runs, each time the document opens, those whose refresh policy is `open`.

Implementation: `src/engine/scripts.ts`
Verification: `src/engine/scripts.test.ts`

### DOCE-OBJECTS-4.3 - The script's output

The scripts plugin, which the editing plugins install, shall refuse the writer's own changes inside a script block's output, while a run, an undo or a redo may change it and the writer may still add, move or delete whole blocks and change their script; it shall mark each block running, failed or empty (`data-script-state`).

Implementation: `src/engine/scripts.ts`
Verification: `src/engine/scripts.test.ts`, `e2e/full-editor.spec.ts`

## Hooks

| Hook                 | Kind      | Values                                                                                       | Description                                                                                                      |
| -------------------- | --------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `de-math`            | root      |                                                                                              | A math node, typeset.                                                                                            |
| `data-display`       | attribute | `inline`, `display`                                                                          | On math: inline or a block.                                                                                      |
| `data-state`         | state     | `pending`, `ready`, `invalid`                                                                | On math: whether it is typeset yet.                                                                              |
| `de-code-gutter`     | root      |                                                                                              | The line numbers beside code.                                                                                    |
| `de-code-token`      | root      |                                                                                              | A token of highlighted linked code; a code block's tokens are painted with the highlight `de-code-<kind>` (3.3). |
| `data-token`         | attribute | `keyword`, `string`, `number`, `comment`, `key`, `literal`, `punctuation`, `link`, `invalid` | On a code token: its kind.                                                                                       |
| `de-signature`       | root      |                                                                                              | A signature.                                                                                                     |
| `de-signature__name` | slot      |                                                                                              | The signer's name.                                                                                               |
| `data-signed`        | state     | `true`, `false`                                                                              | On a signature: whether it holds strokes.                                                                        |
| `data-script-state`  | state     | `running`, `error`, `empty`                                                                  | On a script block: its last run.                                                                                 |
