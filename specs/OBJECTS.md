# Objects

Inserting and changing the document's objects: code blocks and linked code, inline and display math, figures, lists of contents and special characters. A new block goes in place of the empty paragraph holding the caret, or after the top-level block holding it (`newBlockRange`).

## DOCE-OBJECTS-1 - Commands

### DOCE-OBJECTS-1.1 - Code blocks

`insertCodeBlock(language)` shall put a code block holding exactly the text selected, line by line, in its place, leaving the rest of the blocks it came from before and after it, or insert an empty code block where a new block goes; the caret ends inside the block at the end of its text, so the next key edits the code and never the block after it. Mod-Alt-C inserts one. `setCodeLanguage(language)` sets the language of the code block or linked code holding, or selected at, the selection.

Implementation: `src/engine/object-commands.ts`
Verification: `src/engine/object-commands.test.ts`

### DOCE-OBJECTS-1.2 - Linked code

`setLinkedCode({ url, code, language, startLine })` shall insert linked code where a new block goes, selected, or change the linked code selected. `parseCodeLines(url)` reads the lines a URL's fragment names, such as `#L10-L20` or `#L7`. `codeLanguageOfUrl(url)` reads a language from the URL's file extension, such as `typescript` for `.ts`, which linked code takes when the host's code source names none. Typing while linked code, or any other block object, is selected leaves it, so a stray key never replaces it; the object views, which the editing plugins install, keep the writer's typed text from replacing a selected node unless its type replaces on typing: as its node spec's `replaceOnType` says, or else for inline nodes, such as inline math, only. On the pages the same holds on any fragment of split linked code, for typed, replacement and composed text alike, and on a fragment alone on its page the selection stays; Enter there adds a paragraph after the whole block.

Implementation: `src/engine/object-commands.ts`, `src/model/linked-code.ts`, `src/engine/object-views.ts`
Verification: `src/engine/object-commands.test.ts`, `src/engine/object-views.test.ts`, `src/model/linked-code.test.ts`, `e2e/linked-code-fragments.spec.ts`

### DOCE-OBJECTS-1.3 - Math

`insertMath(latex, { display })` shall insert math written as LaTeX, inline in place of the selection or as a block where a new block goes, and select it; empty LaTeX is refused. `setMathSource(latex)` sets the LaTeX of the math selected, and empty LaTeX deletes it; `convertMath` turns inline math into a block after its paragraph, or a block into inline math in a paragraph of its own, and is refused where its container takes no such block, as in a footnote.

Implementation: `src/engine/object-commands.ts`
Verification: `src/engine/object-commands.test.ts`

### DOCE-OBJECTS-1.4 - Figures

`insertFigure(source)` shall insert a new figure where a new block goes, after the figure selected when one is, selected, with its type (an image by default, or a diagram), its source (an asset's id and snapshot, or a URL), alternative text, caption, size and alignment, so figures inserted in turn follow one another. `setFigure(source)` shall change the figure selected, keeping what the source leaves out, its type included, or else insert one. `setObjectLayout(layout)` aligns the figure or table selected: left, centred, right or across the page (`fit`, stored as `fit-page-width`).

The figure dialog shall insert an image or a diagram, or change the figure selected, keeping its type, its size and its alignment. An image comes from an upload through the host's `assets` (a file larger than `assets.maxUploadBytes` is refused before any request, the limit shown under the upload control by `uploadLimit` and the refusal by `uploadTooLarge`; an upload that replaces the figure's image names its asset), from the host's images through the ui-components AssetPicker in a popover while `assets.search` exists (the chosen asset supplies its alternative text and its natural size), or from an address. An upload may set the preview and the stored image only while it is the latest source choice. An upload failure shows the host error message, or the `uploadFailed` label when there is no message, and the dialog stays open for another choice. Another upload, a pick from the host, entering an address or closing the dialog cancels the pending upload. A diagram comes from the host's `diagrams` adapter (DOCE-HOST-1.15): its button draws a new diagram, or edits the figure's, and the dialog takes the stored diagram and, for a figure without a size, its size; closing the dialog aborts the edit. A diagram edit failure shows the host error message, or the `diagramFailed` label when there is no message, and the dialog stays open with its fields available for retry. A size an asset or a diagram brings is clamped to 16 pixels a side at least and at most 2000, and to the width of the page's content, scaling as a whole (`clampFigureSize`). While the host draws diagrams, the toolbar's figure item becomes a menu of an image and a diagram, and Diagram… opens the host's diagram editor at once, with no dialog: its first save inserts the diagram as a figure, sized as above, later saves update it, a cancel inserts nothing, and a failure reports the same error message or fallback through the host's `feedback` (`DiagramDrawing`); otherwise the item stays a button for an image. The dialog edits a diagram figure's drawing, caption and alignment. Under the source the dialog previews the image or the diagram (`de-figure-preview`, named by `figurePreview`, with `data-state` `empty` or `ready`): the image (`de-figure-preview__image`) once there is one, else a placeholder (`de-figure-preview__empty`); then come an image's alternative text and the caption. The figure's size is set in the resize dialog and its alignment from the context menu (DOCE-OBJECTS-1.11).

Implementation: `src/engine/object-commands.ts`, `src/components/document-editor/figure-dialog.tsx`, `src/components/document-editor/figure-sources.tsx`, `src/components/document-editor/figure-size.ts`, `src/components/document-editor/insert-controls.tsx`
Verification: `src/engine/object-commands.test.ts`, `src/components/document-editor/figure-dialog.test.tsx`, `src/components/document-editor/figure-drawing.test.tsx`, `src/components/document-editor/figure-size.test.ts`, `e2e/objects.spec.ts`

### DOCE-OBJECTS-1.5 - Lists of contents and characters

`insertContents(kind, depth)` shall insert a list of contents of a kind (DOCE-CONTENTS) where a new block goes, selected, and `setContentsDepth(depth)` set the deepest heading level the list selected shows. `insertCharacter(character)` types a character, such as a symbol from a picker, in the formatting at the caret.

Implementation: `src/engine/object-commands.ts`
Verification: `src/engine/object-commands.test.ts`

### DOCE-OBJECTS-1.6 - Links

`setLink(href)` shall link the selected text to an address, or change the address of the link at the caret, the whole link; at a caret outside a link it types the address, linked, with the formatting at the caret and in one step, which suggest mode records as an insertion (DOCE-SUGGESTIONS-1.1). An empty address removes the link, and an address a link may not hold (DOCE-SCHEMA-3.8) is refused. `linkAt(state)` gives the address of the link at the selection.

Implementation: `src/engine/object-commands.ts`
Verification: `src/engine/object-commands.test.ts`

### DOCE-OBJECTS-1.7 - Typeset math

`createMathViews({ render })`, which the editing plugins install, shall draw each inline and display math node (`de-math`, with `data-display`) as its typeset MathML, through the base library's KaTeX renderer by default, in every view, the pages' measuring view too, each source typeset once and drawn the same in every view (DOCE-PAGINATION-10.8): the LaTeX source shows while it typesets (`data-state="pending"`), the MathML once it has (`ready`), built by the base library's `renderMathElement`, which keeps only MathML's own elements and attributes, and, when it does not typeset (`invalid`), a fixed text saying so in place of the math, `invalid` given to `createMathViews` or `invalidMath` to the editing plugins (`DEFAULT_INVALID_MATH_TEXT` by default, one for inline math and one for a block), with the renderer's reason as its title; the writer corrects it in place or in the math dialog. A math node or an image whose size changes once drawn has the pages measured again (`de-remeasure`).

Implementation: `src/engine/math-views.ts`, `src/pagination/layout-triggers.ts`, `src/utils/remeasure.ts`
Verification: `src/engine/math-views.test.ts`, `e2e/objects.spec.ts`, `e2e/full-editor-options.spec.ts`

### DOCE-OBJECTS-1.8 - Math as it is typed

The math views shall write math as it is typed: typing the closing dollar of `$` LaTeX `$`, the LaTeX neither starting nor ending with a space nor its closing dollar escaped (`\$`), turns it, with its dollars, into inline math with the caret after it, except in code and where the text between the dollars holds another inline node, such as math; Enter in a paragraph holding only `$$` and LaTeX, closed by `$$` or not, turns it into display math followed by an empty paragraph holding the caret, and a paragraph holding only `$$` into empty display math, selected and edited in place. Mod-Alt-L, the shortcut table's `math` key (DOCE-EDITOR-6.2), writes the text selected in one paragraph as inline math, or empty inline math at the caret, edited in place. Enter on selected math and a double click on math edit it in place too. `mathEditingAt(state)` gives the math edited in place, kept through changes until it goes; `commitMathEditing(latex)` sets its LaTeX, deleting it when the LaTeX is empty, and leaves the caret after inline math or display math selected; `cancelMathEditing` leaves it as it was, deleting math still empty. While the editor is editable, it shows the base library's `MathField` (inline or display, named by `mathSource`) over the math edited in place, focused: Enter (inline) or Ctrl or Cmd with Enter (display) commits the LaTeX, focus leaving the field commits a changed LaTeX and otherwise cancels, and Escape cancels; focus then goes back to the document. The field lasts as long as the edit: a change elsewhere in the document, such as another writer's before the math, moves the math and leaves the field with what the writer typed. The fields' layer (`de-object-editors`) covers the editor's body and its field (`de-object-editors__field`, with `data-kind` `math` or `caption`) publishes the box of the math, relative to the layer, as `--de-object-editors-top`, `--de-object-editors-left`, `--de-object-editors-width` and `--de-object-editors-height`.

Implementation: `src/engine/math-input.ts`, `src/engine/math-views.ts`, `src/components/document-editor/object-editors.tsx`, `labs/reference/editor-chrome.css`
Verification: `src/engine/math-input.test.ts`, `src/components/document-editor/object-editors.test.tsx`, `e2e/math-input.spec.ts`

### DOCE-OBJECTS-1.9 - New figures at the template's width

`createFigureDefaults({ template, isRemote })`, which the document editor installs, shall give each figure the writer's change brings in, inserted, pasted or uploaded, without a width or height of its own, its section's default figure width (`styles.figure.defaultWidth`, a section's over the template's), in pixels and in the same undo step. Figures with a size, and a change from another writer (`isRemote`), shall be left as they are.

Implementation: `src/engine/figure-defaults.ts`, `src/components/document-editor/use-document-layout.ts`
Verification: `src/engine/figure-defaults.test.ts`

### DOCE-OBJECTS-1.10 - Equation numbers

Each display equation in the pages' content shall count as an equation (the `equation` counter, restarted as the template says) and show its number, as the template's equation numbering formats it (`--doc-equation-counter-content`, `(` and the number and `)` without one), at its line's end, as lists of equations and references number it.

Implementation: `labs/reference/document.css`, `src/engine/math-views.ts`
Verification: `e2e/math-input.spec.ts`

### DOCE-OBJECTS-1.11 - Resizing and aligning figures

On a figure the context menu shall offer, after editing it, `Resize…` (`resizeFigure`), then its alignment: left, centred, right or across the page, the one it has checked, and choosing the one checked clears it back to the template's (a stored `null`), which the document then inherits. Resizing opens the resize dialog (`data-dialog` `figure-size`, titled by `resizeFigureTitle`): the width, with the page content width named as its maximum under it (`figureMaxWidth`), the height, and `Keep proportions`, on at first, while which a new width sets the height in the figure's proportions and a new height sets the width, rounded to whole pixels. It starts at the figure's own size, or else the size the engine laid it out at (DOCE-PAGINATION-10.12). A side that is not a whole number of pixels, below 1, or for the width wider than the page's content, stays as typed, its reason shows under it (`figureSizeProblem`) and Apply is disabled. Applying sets the size (`setFigureSize`) and leaves the fit to the page's width. Choosing left, centred or right for a figure fitted to the page's width (`setObjectLayout`) keeps the size it was fitted at, the engine's image box for it in whole pixels (`laidOutFigureSize`, DOCE-PAGINATION-10.12), as a table keeps its fitted column widths.

Implementation: `src/engine/figure-commands.ts`, `src/engine/figure-measure.ts`, `src/engine/object-commands.ts`, `src/components/document-editor/figure-resize-dialog.tsx`, `src/components/document-editor/figure-size.ts`, `src/components/document-editor/element-entries.ts`
Verification: `src/engine/figure-commands.test.ts`, `src/components/document-editor/figure-size.test.ts`, `src/components/document-editor/figure-resize-dialog.test.tsx`, `e2e/objects.spec.ts`, `src/engine/object-resize.test.ts`

### DOCE-OBJECTS-1.12 - Copying math

On inline or display math, selected or holding the selection, the context menu shall offer, right after Copy and whether or not the document is editable, `Copy equation` (`copyEquation`), which copies its typeset MathML with its LaTeX as the TeX annotation, as both HTML and plain text (the base library's `copyMath`), so word processors that read MathML paste an equation; `Copy equation's LaTeX` (`copyEquationLatex`), which copies its source as text; and `Copy equation as image` (`copyEquationImage`), which copies the drawing its layout made (`de-math__drawing`, DOCE-PAGINATION-12.11) as a PNG in black ink on a transparent ground at twice its size, the size it has before it is scaled to fit its line (`--de-math-scale`), with an HTML image at that size whose text alternative is the source; the image carries the LaTeX, in the PNG's `LaTeX` text chunk and the HTML image's `data-latex` (with `data-math-display` for display math), so it can become the equation again (`copyMathImage`). Copy equation needs the typeset MathML and Copy equation as image the drawing; until then they are disabled. Pasted MathML whose `annotation` is `application/x-tex`, as copied equations and typeset web pages carry it, becomes math with that LaTeX: display math for `<math display="block">`, inline math otherwise. A pasted HTML image with `data-latex` becomes math with that LaTeX, display math when its `data-math-display` is `display`, rather than an image or an uploaded figure, and pasted or dropped image files that all carry the `LaTeX` text chunk become that math, in order, where they land, rather than uploaded figures (`readMathImage`).

Implementation: `src/components/document-editor/math-copy-entries.ts`, `src/components/document-editor/context-entries.ts`, `src/model/schema/math-nodes.ts`, `src/components/document-editor/figure-paste.ts`, `src/components/document-editor/pasted-images.ts`, `src/components/document-editor/paste-place.ts`
Verification: `src/components/document-editor/math-copy-entries.test.ts`, `src/components/document-editor/clipboard-entries.test.ts`, `e2e/math-copy.spec.ts`

## DOCE-OBJECTS-2 - Captions

### DOCE-OBJECTS-2.1 - A caption's text

A table's, a figure's or a code block's caption shall be document content, the object's first child: a `table_figure` or `code_figure`, which the stored format does not keep, holds a table's caption (`table_caption`) and the table, or a code block's caption (`code_caption`) and the code block, and a figure holds its caption (`figure_caption`) before its image. A linked code block's caption is derived from its address and not edited. `captionedAt(state)` shall find the table, figure or code block selected or holding the selection, and `captionNodeAt(doc, found)` its caption node; `setCaption(text)` sets its caption text, with its spaces collapsed, and shows its caption, and `toggleCaption(shown)` shows or hides it, toggling it by default. The context menu offers editing the caption in place (DOCE-OBJECTS-2.5) and showing or hiding it (DOCE-EDITOR-3.8). `insertTable`, `insertFigure` and `insertCodeBlock` give the object an empty caption, and deleting a table deletes its caption with it (`deleteTableWithCaption`). A caption is rich text: it takes the marks a paragraph does, comment anchors (DOCE-COMMENTS-1.1), suggested text (DOCE-SUGGESTIONS-1.1) and footnotes (DOCE-FOOTNOTES-1.2), all stored with the caption.

Implementation: `src/engine/captions.ts`, `src/model/schema/caption-nodes.ts`, `src/model/schema/caption-content.ts`, `src/components/document-editor/caption-entries.ts`
Verification: `src/engine/table-format.test.ts`, `e2e/captions.spec.ts`

### DOCE-OBJECTS-2.2 - The caption line

A caption line shall read the object's label and number, from the template's numbering of its kind (`--doc-<kind>-counter-content`), then its text, `Table 1.1 - Limits`; the reference stylesheet counts each kind, a later part of a split object and a table with its caption hidden excepted, places captions as the template says, and ends a later part's caption with the template's continued suffix (`--doc-<kind>-caption-continued`).

Implementation: `src/model/schema/table-nodes.ts`, `labs/reference/document.css`
Verification: `e2e/captions.spec.ts`, `e2e/template-content.spec.ts`

### DOCE-OBJECTS-2.3 - Code block captions

A code block's caption shall be edited in place as a table's is (DOCE-OBJECTS-2.5), with no field over it: `editCaption` selects its text, a press on its line puts the caret in it, and a press on the code's padding or gutter puts the caret in the code (DOCE-OBJECTS-3.4). A code block is made with its empty caption however it is made: `insertCodeBlock`, the ` ``` ` typing shortcut (DOCE-EDITING-6.1), a pasted `<pre>`, which reads the caption line or `data-code-caption-text` an older copy carries, script output and the readers. A code block split across pages repeats its caption on each later part, which shows its text and is not edited, and joins back whole (DOCE-PAGINATION-1).

Implementation: `src/model/schema/code-nodes.ts`, `src/model/schema/caption-holder.ts`, `src/engine/code-commands.ts`, `src/engine/typing-rules.ts`, `src/engine/object-views.ts`
Verification: `src/model/schema/code-nodes.test.ts`, `src/engine/object-commands.test.ts`, `src/engine/typing-rules.test.ts`, `src/components/document-editor/object-editors.test.tsx`, `e2e/objects.spec.ts`

### DOCE-OBJECTS-2.4 - Caption lines outside the editor

`formatCaptionLineText({ elementName, numbering, captionText, continuedSuffix })` shall write a caption line as text, as the editor shows it: the label and number, then the caption text, `Table 1.1 - Limits`, each part with its spaces collapsed and a continued suffix after the text. `tableCaptionLineStyle(table)` shall give the width and margins a caption line takes to span exactly its table: the table's object layout when it has one, its column total once every column of its first row has a width, and nothing otherwise, so the template's caption alignment is relative to the table.

Implementation: `src/model/schema/caption-text.ts`, `src/model/schema/object-layout.ts`
Verification: `src/model/schema/caption-text.test.ts`

### DOCE-OBJECTS-2.5 - Captions edited in the caption

A table's, a figure's or a code block's caption shall be edited as any text of the document, in place: the caret goes into it as into a paragraph, and what the writer types, pastes, undoes or another writer changes is in the document at once. A caption is one line: Enter and Shift-Enter add nothing in it, and Backspace at its start and Delete at its end join it to nothing. `editCaption`, given the view, selects the caption's text and shows the caption, hidden or not. Select All in a caption selects its text, and a second Select All everything. A press on a figure's image selects the figure. A pasted table without its caption, or an HTML table, reads as a table with its HTML caption or an empty one.

Implementation: `src/engine/caption-editing.ts`, `src/engine/object-views.ts`, `src/engine/document-editing.ts`, `src/model/schema/caption-nodes.ts`
Verification: `src/engine/caption-editing.test.ts`, `e2e/captions.spec.ts`, `e2e/session.spec.ts`, `e2e/objects.spec.ts`

## DOCE-OBJECTS-3 - Object views

### DOCE-OBJECTS-3.1 - Line numbers

`createObjectViews({ lineNumbers })`, which the editing plugins install with the line numbers their template states (`styles.codeBlock.lineNumbers`, document-level only, `all` in the base template), never a host's or a viewer's own setting, so every view of a document lays its code out alike, shall draw a gutter of line numbers (`de-code-gutter`) before the code of all code (`all`, the default), linked code only (`linked`) or none (`none`), numbered from the code's first line (`startLine`, or a continued block's `codeLineStart`) and kept in step with its text in the same update, in every view, filled as the view is built; `lineNumbers(code, first)` gives them. Each line of code has a line in the gutter (`de-code-gutter__line`, with `data-line-number`) holding its number (`de-code-gutter__number`) and a hidden copy of its text (`de-code-gutter__text`), so a stylesheet that lays the gutter over the code, as wide as it, wraps each copy as the code wraps: a wrapped line shows its number on its first row and blank gutter rows after it, with no measuring. The code keeps one `code` element holding its text alone. The gutter publishes the digits of its highest number, at least three, on the code's `pre` as `--de-code-gutter-digits`. The reference stylesheet wraps numbered code, so it never loses text on paper, and sizes the gutter at three digits and 6px, or more for a higher number.

Implementation: `src/engine/object-views.ts`, `src/engine/document-editing.ts`, `src/engine/object-plugins.ts`, `src/model/format/template-format-shape.ts`, `labs/reference/document.css`
Verification: `src/engine/object-views.test.ts`, `e2e/objects.spec.ts`

### DOCE-OBJECTS-3.2 - Signatures

The object views shall draw a signature (`de-signature`, with `data-signed`) as its strokes, from its stored vector, and the signer's name (`de-signature__name`), and an unsigned one as the name alone.

Implementation: `src/engine/object-views.ts`
Verification: `e2e/objects.spec.ts`, `src/engine/object-views.test.ts`

### DOCE-OBJECTS-3.3 - Highlighting

The object views shall highlight the text of each code block and the code of linked code in their language, in every view: `highlightCode(code, language)` splits code into its tokens through the base library's code tokenizer (`resolveCodeTokenizer`), for JavaScript (`js`), TypeScript (`ts`), Python (`py`), C, C++ (`c++`), JSON, XML, HTML, CSS, YAML (`yml`), SQL, shell (`bash`, `sh`) and Markdown (`md`), and gives none for plain text or another language. Each token with a kind (`keyword`, `string`, `number`, `comment`, `key`, `literal`, `punctuation`, `link`, `invalid`), a run of tokens of one kind as one, shall be painted, in a code block, with the window's named highlight `de-code-<kind>` (`CSS.highlights`, `codeHighlightName`), which leaves the block's DOM as the editor draws it, and shall be marked, in linked code, `de-code-token` with its kind in `data-token`; the text stays as it is, and token styles shall not change layout. A code block shall be painted again when its text, its language or the elements that draw it change, and no other; a block of thousands of tokens shall not slow the pages' layout. Without named highlights in the window, code blocks shall show unpainted.

Implementation: `src/engine/code-highlighting.ts`, `src/engine/object-views.ts`
Verification: `src/engine/code-highlighting.test.ts`, `e2e/objects.spec.ts`

### DOCE-OBJECTS-3.4 - Pressing beside code

The object views shall put the caret at the code position nearest to a press on a code block's padding, gutter or caption line, never in the caption or beside the block, and a drag that starts there shall select the code from that position to the pointer, as a press in the text would. A double press on the caption line still edits the caption (DOCE-OBJECTS-2.3), and linked code, which takes no caret, is left to the editor's selection of it.

Implementation: `src/engine/object-views.ts`
Verification: `e2e/objects.spec.ts`

## DOCE-OBJECTS-4 - Script blocks

### DOCE-OBJECTS-4.1 - Inserting a script block

`insertScriptBlock(script)` shall insert a script block with the script given where a new block goes, selected and showing nothing yet, and `setScriptSource(script)` shall set the script of the script block at the selection; `listScriptBlocks(doc)` gives a document's script blocks with an element id, in document order, and `scriptBlockAt(state)` the one at the selection.

Implementation: `src/engine/scripts.ts`
Verification: `src/engine/scripts.test.ts`

### DOCE-OBJECTS-4.2 - Running scripts

`runScripts(view, runner, { ids })` shall run the scripts of the document, or those of the blocks with the ids given, one at a time in document order, each against the document as it is, then put what they produced in their blocks as one change the writer can undo, never recorded as a suggestion, with when it was produced (`renderedAt`); it resolves with the ids that failed, a script the host could not run or whose runner threw, or an output the document cannot read or that does not fit the script block as returned, which `scriptsState` keeps with their messages until their blocks run again. A failure never stops the run nor leaves a block marked running. One run goes at a time: while a run of the view's scripts is in flight, another runs nothing and rejects with a `ScriptsBusyError` (`isScriptsBusyError`). A block whose script changed while it ran, or whose inputs did, the runner's inputs key for it (DOCE-OBJECTS-4.7) asked as it started differing from the one once all answered, or whose output is the same as the one it shows, keeps what it shows, and every block does when the view is no longer editable once the run answered, or shows another document: outputs are compared by their nodes, text, marks and attributes by value (including arrays and records), the attributes that identify an element (`dataId`, `dataAuthor`, `dataAiSession`) aside, so a rerun that produces the same content leaves the document unchanged. The elements of an output put in take element ids made from the block's id and their place in the output, in document order, so the same output in the same block always has the same ids. Scripts run only when asked: opening, reloading or bringing a document in step with its template runs none, whatever a block's stored refresh policy, and a new block is run by hand.

Implementation: `src/engine/scripts.ts`, `src/components/document-editor/script-entries.ts`
Verification: `src/engine/scripts.test.ts`, `src/components/document-editor/script-entries.test.tsx`, `src/engine/host-domain-recipe.test.ts`

### DOCE-OBJECTS-4.3 - The script's output

The scripts plugin, which the editing plugins install, shall refuse the writer's own changes inside a script block's output, to its nodes, text, marks or attributes other than the ones that identify an element, while a run, an undo or a redo may change it and the writer may still add, move or delete whole blocks and change their script; it shall mark each block running, failed, stale (DOCE-OBJECTS-4.7) or empty (`data-script-state`), in that order of precedence, which `scriptBlockStates(state)` lists with each failure's message. While the editor shows the document, a failed block shows its failure's message as the runner gave it, at its start above the output it keeps, and, while the document is edited beside a runner, a block whose script produced nothing says so (`scriptEmpty`), both view-only (`de-script-message`, `data-script-message` `error` or `empty`).

Implementation: `src/engine/scripts.ts`, `src/engine/script-state.ts`, `src/engine/script-output.ts`, `src/components/document-editor/writing-decorations.ts`
Verification: `src/engine/scripts.test.ts`, `src/components/document-editor/script-entries.test.tsx`, `e2e/full-editor.spec.ts`

### DOCE-OBJECTS-4.4 - Scripts on a stored document

`runStoredScripts(file, { schema, runner, ids, signal, now })`, in the server-safe `./document` entry, shall run the scripts of a stored document, or those of the blocks with the ids given, with no editor and no DOM: one at a time in document order, each against the document as stored and for the purpose `stored` (DOCE-OBJECTS-4.6), then put what they produced in their blocks as DOCE-OBJECTS-4.2 says, with the same element ids and `renderedAt`, an output the same as the one shown leaving its block as it is. It resolves with the document, the one given when nothing changed and otherwise the one given with its sections written again, content the schema does not know kept as stored, and with the blocks that failed, by id with their messages: a script the runner could not run or that threw, or an output the schema cannot read or that does not fit the script block as returned, which keeps the output it had. The signal goes to the runner with each script; once it aborts, the run stops and rejects with its reason, changing nothing.

Implementation: `src/document/scripts.ts`, `src/engine/script-output.ts`
Verification: `src/document/scripts.test.ts`

### DOCE-OBJECTS-4.5 - Building a script's output

The script output builders, in `./document`, shall write the stored content a script gives without the stored format's names: `buildScriptText(text)` the inline content of plain text or parts (`ScriptInline`): runs, each bold, italic, struck, code or linking to `href` as it says, a link opening elsewhere, with no access back to the document, when `newTab`; inline equations (`{ math }`, LaTeX); and inline nodes the host builds in the stored format, such as references to its records or signatures; empty runs left out; `buildScriptParagraph(text)` a paragraph; `buildScriptHeading(text, { level, numbered })` a heading of level 1 to 6, a level outside them taking the nearer, unnumbered when `numbered` is false (DOCE-SCHEMA-3.10); `buildScriptList(items, { ordered })` a bulleted or numbered list with a paragraph in each item; `buildScriptTable(rows, options)` a table whose cells hold a paragraph of their text, or the paragraphs of a `ScriptCell`, such as a line and the line under it, spanning `colspan` columns, set out as `ScriptTableOptions` say: its first row of header cells when `header`, each row's first cell a header cell when `stub`, each column aligned as `align` says and a cell as its own `align` does, columns `widths` wide in pixels, a cell spanning columns taking theirs, its lines all drawn, only between rows and above and below it (`horizontal`) or none (`rules`), and fitted to the content width, its outer border included and its columns keeping their proportions, unless `fit` is `natural`; `buildScriptFigure({ src, alt, caption, width })` a figure of an image; `buildScriptCode(code, { language, caption })` a code block; and `buildScriptEquation(latex)` a display equation, numbered as any (DOCE-OBJECTS-1.10). What they build combines: a script returns any list of them. A `caption` is the object's caption text, its spaces collapsed, which the template's label and number lead as any caption (DOCE-OBJECTS-2.2), or `false` for a hidden caption; left out, the object has the default, an empty shown caption. What they build is content the document reads.

Implementation: `src/document/script-output.ts`
Verification: `src/document/script-output.test.ts`

### DOCE-OBJECTS-4.6 - Why a script runs, and where its output came from

Each run shall tell the runner why the script runs (`purpose`): `run` when asked, the default of `runScripts(view, runner, { purpose })`, `preview` for the script editor's preview and `stored` for `runStoredScripts`, and give it the run's signal (`signal`). Once the signal aborts, `runScripts` shall stop, put nothing in, end its blocks' running state and reject with the signal's reason. What a script produced (`ScriptRunOutput`) is its content, where it came from (`provenance`) and the signatures it carries (`signatures`), which a run puts in its block's attributes with its content; an output whose content, signatures and inputs key (`provenance.inputs`) are the same as the block's leaves it as it is, with no change, keeping the rest of the provenance the block records even when the output's differs, as a new run's id does; one whose signatures or inputs key alone changed changes only the block's attributes and `renderedAt`.

Implementation: `src/engine/scripts.ts`, `src/engine/script-output.ts`, `src/document/scripts.ts`
Verification: `src/engine/scripts.test.ts`, `src/document/scripts.test.ts`

### DOCE-OBJECTS-4.7 - Stale output

An output shall be stale when the runner's inputs key for its script (`inputsKey`, the key of what the script would read now, against the document as it is) differs from the one its output recorded (`provenance.inputs`), or when it recorded none; a runner without `inputsKey` finds no output stale, and a key the runner fails to give leaves its block not stale. `findStaleScripts(doc, runner, { document, ids, signal })` gives the stale blocks' ids, of the blocks with the ids given or of every one, in document order, rejecting with the signal's reason once it aborts, and `findStaleStoredScripts(file, { schema, runner, ids, signal })`, in `./document`, gives those of a stored document with no DOM. `checkStaleScripts(view, runner)` finds the view's stale blocks and marks them `stale` (`data-script-state`, kept in `scriptsState(state).stale`) until they run again with success; the scripts plugin given a runner with inputs keys, and the editor given a `scriptRunner` with them (DOCE-EDITOR-4.8), check once as a document opens.

Implementation: `src/engine/script-staleness.ts`, `src/engine/scripts.ts`, `src/document/scripts.ts`, `src/components/document-editor/script-entries.ts`
Verification: `src/engine/script-staleness.test.ts`, `src/document/scripts.test.ts`, `src/components/document-editor/script-entries.test.tsx`, `e2e/full-editor-options.spec.ts`

### DOCE-OBJECTS-4.8 - The preview numbered in context

The script editor's preview (DOCE-EDITOR-4.9) shall number what a script produced on from where its block is: the runner runs it with purpose `preview`, and the counters in effect just before the block edited, where it is now, or before the selection for a new block (`numberingCountersAt`, DOCE-CONTENTS-1.7), are published on the preview as `--de-script-editor-counters`, a `counter-reset` value naming each heading level's and numbered object kind's counter and its count (`numberingCounterValues`), from which a stylesheet's counters number on. The preview publishes none until it has run.

Implementation: `src/components/document-editor/script-panes.tsx`, `src/components/document-editor/script-dialog.tsx`, `labs/reference/editor-chrome.css`
Verification: `src/components/document-editor/script-panes.test.tsx`

## Hooks

| Hook                      | Kind      | Values                                                                                       | Description                                                                                                      |
| ------------------------- | --------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `de-math`                 | root      |                                                                                              | A math node, typeset.                                                                                            |
| `data-display`            | attribute | `inline`, `display`                                                                          | On math: inline or a block.                                                                                      |
| `data-state`              | state     | `pending`, `ready`, `invalid`                                                                | On math: whether it is typeset yet.                                                                              |
| `de-code-gutter`          | root      |                                                                                              | The line numbers beside code.                                                                                    |
| `de-code-gutter__line`    | slot      |                                                                                              | A line of the gutter: its number, then a hidden copy of the line's text.                                         |
| `de-code-gutter__number`  | slot      |                                                                                              | A line's number.                                                                                                 |
| `de-code-gutter__text`    | slot      |                                                                                              | The hidden copy of a line's text, which wraps as the code does.                                                  |
| `data-line-number`        | attribute | a number                                                                                     | On a gutter line: its number.                                                                                    |
| `--de-code-gutter-digits` | property  | a number                                                                                     | On numbered code's `pre`: the digits of its highest line number, at least three.                                 |
| `de-code-token`           | root      |                                                                                              | A token of highlighted linked code; a code block's tokens are painted with the highlight `de-code-<kind>` (3.3). |
| `data-token`              | attribute | `keyword`, `string`, `number`, `comment`, `key`, `literal`, `punctuation`, `link`, `invalid` | On a code token: its kind.                                                                                       |
| `de-object-box`           | root      |                                                                                              | A node a layout rule sized, drawn in the box it was laid out at (DOCE-PAGINATION-14.2).                          |
| `data-object-box`         | attribute | `inline`, `block`                                                                            | On a sized node: whether it sits on a line or takes its column.                                                  |
| `--de-object-height`      | property  | a length                                                                                     | On a sized node: its box's height.                                                                               |
| `--de-object-width`       | property  | a length                                                                                     | On a sized inline node: its box's width.                                                                         |
| `--de-object-baseline`    | property  | a length                                                                                     | On a sized inline node: its baseline, from its box's top.                                                        |
| `de-signature`            | root      |                                                                                              | A signature.                                                                                                     |
| `de-signature__name`      | slot      |                                                                                              | The signer's name.                                                                                               |
| `data-signed`             | state     | `true`, `false`                                                                              | On a signature: whether it holds strokes.                                                                        |
| `data-script-state`       | state     | `running`, `error`, `stale`, `empty`                                                         | On a script block: its last run.                                                                                 |
| `de-script-message`       | root      |                                                                                              | In a script block: its failure's message, or that its script produced nothing; view-only.                        |
| `data-script-message`     | attribute | `error`, `empty`                                                                             | On a script message: which it says.                                                                              |
| `de-script-preview`       | root      |                                                                                              | In a template script block without output: what its script would produce; view-only.                             |
| `data-script-preview`     | attribute | `true`                                                                                       | On a template script block: it shows a preview (DOCE-TEMPLATES-8.9).                                             |
