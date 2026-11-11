# Objects

Inserting and changing the document's objects: code blocks and linked code, inline and display math, figures, lists of contents and special characters. A new block goes in place of the empty paragraph holding the caret, or after the top-level block holding it (`newBlockRange`).

## DOCE-OBJECTS-1 - Commands

### DOCE-OBJECTS-1.1 - Code blocks

`insertCodeBlock(language)` shall turn the selected text blocks into one code block holding their text, line by line, or insert an empty code block where a new block goes, with the caret in it; Mod-Alt-C inserts one. `setCodeLanguage(language)` sets the language of the code block or linked code holding, or selected at, the selection.

Implementation: `src/engine/object-commands.ts`
Verification: `src/engine/object-commands.test.ts`

### DOCE-OBJECTS-1.2 - Linked code

`setLinkedCode({ url, code, language, startLine })` shall insert linked code where a new block goes, selected, or change the linked code selected. `parseCodeLines(url)` reads the lines a URL's fragment names, such as `#L10-L20` or `#L7`.

Implementation: `src/engine/object-commands.ts`, `src/model/linked-code.ts`
Verification: `src/engine/object-commands.test.ts`

### DOCE-OBJECTS-1.3 - Math

`insertMath(latex, { display })` shall insert math written as LaTeX, inline in place of the selection or as a block where a new block goes, and select it; empty LaTeX is refused. `setMathSource(latex)` sets the LaTeX of the math selected, and empty LaTeX deletes it; `convertMath` turns inline math into a block after its paragraph, or a block into inline math in a paragraph of its own.

Implementation: `src/engine/object-commands.ts`
Verification: `src/engine/object-commands.test.ts`

### DOCE-OBJECTS-1.4 - Figures

`setFigure(source)` shall insert a figure where a new block goes, selected, with its type (an image by default), its source (an asset's id and snapshot, or a URL), alternative text, caption and size, or change the figure selected, keeping what the source leaves out. `setObjectLayout(layout)` aligns the figure or table selected: left, centred, right or across the page (`fit`).

Implementation: `src/engine/object-commands.ts`
Verification: `src/engine/object-commands.test.ts`

### DOCE-OBJECTS-1.5 - Lists of contents and characters

`insertContents(kind, depth)` shall insert a list of contents of a kind (DOCE-CONTENTS) where a new block goes, selected, and `setContentsDepth(depth)` set the deepest heading level the list selected shows. `insertCharacter(character)` types a character, such as a symbol from a picker, in the formatting at the caret.

Implementation: `src/engine/object-commands.ts`
Verification: `src/engine/object-commands.test.ts`

### DOCE-OBJECTS-1.6 - Links

`setLink(href)` shall link the selected text to an address, or change the address of the link at the caret, the whole link; at a caret outside a link it types the address, linked. An empty address removes the link. `linkAt(state)` gives the address of the link at the selection.

Implementation: `src/engine/object-commands.ts`
Verification: `src/engine/object-commands.test.ts`

### DOCE-OBJECTS-1.7 - Typeset math

`createMathViews({ render })`, which the editing plugins install, shall draw each inline and display math node (`de-math`, with `data-display`) as its typeset MathML, through the base library's KaTeX renderer by default, in every view, the pages' measuring view too: the LaTeX source shows while it typesets (`data-state="pending"`), the MathML once it has (`ready`), built by the base library's `renderMathElement`, which keeps only MathML's own elements and attributes, and the source, with the renderer's reason, when it does not typeset (`invalid`). A math node or an image whose size changes once drawn has the pages measured again (`de-remeasure`).

Implementation: `src/engine/math-views.ts`, `src/pagination/pagination.ts`, `src/utils/remeasure.ts`
Verification: `e2e/objects.spec.ts`

## DOCE-OBJECTS-2 - Captions

### DOCE-OBJECTS-2.1 - A caption's text

`captionedAt(state)` shall find the table, figure or code block selected or holding the selection; `setCaption(text)` sets its caption text, with its spaces collapsed, and shows its caption, and `toggleCaption(shown)` shows or hides it, toggling it by default, on the whole table when the pages split one. The context menu offers editing the caption in a dialog and showing or hiding it (DOCE-EDITOR-3.8).

Implementation: `src/engine/captions.ts`
Verification: `src/engine/table-format.test.ts`, `e2e/captions.spec.ts`

### DOCE-OBJECTS-2.2 - The caption line

A caption line shall read the object's label and number, from the template's numbering of its kind (`--doc-<kind>-counter-content`), then its text, `Table 1.1 - Limits`; the reference stylesheet counts each kind, a later part of a split object and a table with its caption hidden excepted, places captions as the template says, and ends a later part's caption with the template's continued suffix (`--doc-<kind>-caption-continued`).

Implementation: `src/model/schema/table-nodes.ts`, `labs/reference/document.css`
Verification: `e2e/captions.spec.ts`

## DOCE-OBJECTS-3 - Object views

### DOCE-OBJECTS-3.1 - Line numbers

`createObjectViews({ lineNumbers })`, which the editing plugins install, shall draw a gutter of line numbers (`de-code-gutter`) before the code of linked code (the default), all code (`all`) or none (`none`), numbered from the code's first line (`startLine`, or a continued block's `codeLineStart`) and kept in step with its text, in every view; `lineNumbers(code, first)` gives them.

Implementation: `src/engine/object-views.ts`
Verification: `e2e/objects.spec.ts`

### DOCE-OBJECTS-3.2 - Signatures

The object views shall draw a signature (`de-signature`, with `data-signed`) as its strokes, from its stored vector, and the signer's name (`de-signature__name`), and an unsigned one as the name alone.

Implementation: `src/engine/object-views.ts`
Verification: `e2e/objects.spec.ts`

## DOCE-OBJECTS-4 - Script blocks

### DOCE-OBJECTS-4.1 - Inserting a script block

`insertScriptBlock(script)` shall insert a script block with the script given where a new block goes, selected and showing nothing yet, and `setScriptSource(script)` shall set the script of the script block at the selection; `listScriptBlocks(doc)` gives a document's script blocks with an element id, in document order, and `scriptBlockAt(state)` the one at the selection.

Implementation: `src/engine/scripts.ts`
Verification: `src/engine/scripts.test.ts`

### DOCE-OBJECTS-4.2 - Running scripts

`runScripts(view, runner, { ids })` shall run the scripts of the document, or those of the blocks with the ids given, one at a time in document order, each against the document as it is, then put what they produced in their blocks as one change the writer can undo, never recorded as a suggestion, with when it was produced (`renderedAt`); it resolves with the ids that failed, which `scriptsState` keeps with their messages until the next run. A block whose script changed while it ran, or whose output is the same, keeps what it shows. While the host runs scripts, `runOpeningScripts` runs, each time the document opens, those whose refresh policy is `open`.

Implementation: `src/engine/scripts.ts`
Verification: `src/engine/scripts.test.ts`

### DOCE-OBJECTS-4.3 - The script's output

The scripts plugin, which the editing plugins install, shall refuse the writer's own changes inside a script block's output, while a run, an undo or a redo may change it and the writer may still add, move or delete whole blocks and change their script; it shall mark each block running, failed or empty (`data-script-state`).

Implementation: `src/engine/scripts.ts`
Verification: `src/engine/scripts.test.ts`, `e2e/full-editor.spec.ts`

## Hooks

| Hook                 | Kind      | Values                        | Description                               |
| -------------------- | --------- | ----------------------------- | ----------------------------------------- |
| `de-math`            | root      |                               | A math node, typeset.                     |
| `data-display`       | attribute | `inline`, `display`           | On math: inline or a block.               |
| `data-state`         | state     | `pending`, `ready`, `invalid` | On math: whether it is typeset yet.       |
| `de-code-gutter`     | root      |                               | The line numbers beside code.             |
| `de-signature`       | root      |                               | A signature.                              |
| `de-signature__name` | slot      |                               | The signer's name.                        |
| `data-signed`        | state     | `true`, `false`               | On a signature: whether it holds strokes. |
| `data-script-state`  | state     | `running`, `error`, `empty`   | On a script block: its last run.          |
