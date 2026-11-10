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

## DOCE-OBJECTS-2 - Captions

### DOCE-OBJECTS-2.1 - A caption's text

`captionedAt(state)` shall find the table, figure or code block selected or holding the selection; `setCaption(text)` sets its caption text, with its spaces collapsed, and shows its caption, and `toggleCaption(shown)` shows or hides it, toggling it by default, on the whole table when the pages split one. The context menu offers editing the caption in a dialog and showing or hiding it (DOCE-EDITOR-3.8).

Implementation: `src/engine/captions.ts`
Verification: `src/engine/table-format.test.ts`, `e2e/captions.spec.ts`

### DOCE-OBJECTS-2.2 - The caption line

A caption line shall read the object's label and number, from the template's numbering of its kind (`--doc-<kind>-counter-content`), then its text, `Table 1.1 - Limits`; the reference stylesheet counts each kind, a later part of a split object and a table with its caption hidden excepted, places captions as the template says, and ends a later part's caption with the template's continued suffix (`--doc-<kind>-caption-continued`).

Implementation: `src/model/schema/table-nodes.ts`, `labs/reference/document.css`
Verification: `e2e/captions.spec.ts`
