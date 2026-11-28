# Pagination

The editor lays each section out on pages. A block that does not fit where it falls is split into fragments, one per page: nodes of the block's own type marked as parts by their part number (`splitPartIndex`) and their type's continuation attributes. The stored document and the editing document hold whole blocks only, so joining fragments back is part of the model, and a server joins them the way the editor does. Joins are steps on a transform, so the way from one page layout to another is a transform too, and positions map through it.

## DOCE-PAGINATION-1 - Fragments

### DOCE-PAGINATION-1.1 - Fragment rules

Each splittable node type shall have a fragment rule (`FRAGMENT_RULES`) naming the attribute values of a whole block; a node holding any other value shall be a fragment (`isFragment`). The rules shall cover paragraphs, code blocks, linked code, tables, quotes, bullet and ordered lists, list items and tables of contents.

Implementation: `src/model/pagination/fragments.ts`, `src/model/pagination/split-part.ts`
Verification: `src/model/pagination/fragments.test.ts`, `src/model/pagination/split-part.test.ts`

### DOCE-PAGINATION-1.2 - Joining fragments

`joinFragments(blocks)` shall join each run of fragments into one whole block, in order, by the steps `joinBlocks` and `joinAt` add to a transform. A node shall continue the block before it (`continuesFragment`) when both have the same type, at least one is a fragment, and they share an id or their part numbers follow on. Two whole blocks that share an id shall stay apart. A fragment whose other parts are missing shall become whole on its own. Paragraph fragments shall join their content.

Captioned code and table figures shall identify their fragments by the enclosed code block's or table's id, including when nested in another split block. Different known enclosed ids shall keep figures separate. When an enclosed id is missing, fragments with consecutive part numbers shall join across every seam in the run, and part zero shall start a new run. The join shall keep a nested run's original first and last part numbers and any known enclosed id during the transform. The resulting block shall have its whole attributes.

Implementation: `src/model/pagination/fragments.ts`, `src/model/pagination/fragment-parts.ts`
Verification: `src/model/pagination/fragments.test.ts`, `src/model/pagination/page-projection.test.ts`

### DOCE-PAGINATION-1.3 - Code

A code block or linked code split at a line break shall join with that line break put back, and one split inside a line (DOCE-PAGINATION-3.3) with nothing put back; it shall lose its continued markers and its fragment's first line number.

Implementation: `src/model/pagination/fragments.ts`
Verification: `src/model/pagination/fragments.test.ts`

### DOCE-PAGINATION-1.4 - Tables

A table's fragments shall join their rows in order, without the leading header rows a continuation repeats from the first fragment, so they appear once. A captioned continuation shall remove matching header rows only when its caption carries repeated text, including an empty string. An independent body row with the same content shall be kept.

Implementation: `src/model/pagination/fragments.ts`
Verification: `src/model/pagination/fragments.test.ts`, `src/model/pagination/page-projection.test.ts`, `src/engine/suggested-tables.test.ts`

### DOCE-PAGINATION-1.5 - Lists

A list's fragments shall join their items, and an item split across them shall join its facing children the same way, without the empty paragraph a continuation opens with, which the split marks (`continuationPlaceholder`); an empty paragraph of the document, with or without an id, is kept. The joined list shall keep its first fragment's start number.

Implementation: `src/model/pagination/fragments.ts`
Verification: `src/model/pagination/fragments.test.ts`

### DOCE-PAGINATION-1.6 - Tables of contents

The parts of a table of contents with the same kind, deepest level and reference filter shall join into one that lists every entry and shows its title.

Implementation: `src/model/pagination/fragments.ts`
Verification: `src/model/pagination/fragments.test.ts`

### DOCE-PAGINATION-1.7 - Host rules

A host whose own node types split shall add their rules to `FRAGMENT_RULES`, each joining by steps on a transform (`join(tr, pos, rules)`), and pass the rules to `joinFragments` and to `writeDocumentFile` (`fragmentRules`). A type without a rule shall never join.

Implementation: `src/model/pagination/fragments.ts`, `src/model/format/document-format-convert.ts`
Verification: `src/model/pagination/fragments.test.ts`

### DOCE-PAGINATION-1.8 - Script blocks and layout sections

A script block's fragments shall join their output blocks as a quote's do. A layout section's fragments shall join column by column: each column of the later fragment shall join the column at its place in the earlier one, its facing blocks joining when they are one block's fragments, and a column that holds only the empty paragraph a split leaves (DOCE-PAGINATION-4.7) shall give way to the other side's blocks. Positions in the text of every continued column shall map to the same text in the whole column and back, including through repagination. A writer shall be able to select, type and undo on a continuation page in either column, with those edits reflected in the stored document.

Implementation: `src/model/pagination/fragments.ts`, `src/model/pagination/page-moves.ts`, `src/model/pagination/repaginate.ts`
Verification: `src/model/pagination/fragments.test.ts`, `src/model/pagination/container-split.test.ts`, `src/pagination/projection-map.test.ts`, `e2e/regression.spec.ts`

## DOCE-PAGINATION-2 - Page layout

### DOCE-PAGINATION-2.1 - Filling pages

`layoutPages(blocks, { pageHeight })` shall lay a section's measured blocks (`LayoutBlock`) out on pages in order, each page taking the blocks that fit its content height less a safety margin of `PAGE_SAFETY_MARGIN_PX`, and every page at least one block (`layoutNextPage` fills one). No blocks shall lay out on no pages.

Implementation: `src/model/pagination/page-layout.ts`
Verification: `src/model/pagination/page-layout.test.ts`

### DOCE-PAGINATION-2.2 - Margins

Blocks on a page shall take their heights plus, between two blocks, the larger of their facing margins (`stackedHeight`); the first block's top margin and the last block's bottom margin shall not count. The layout engine shall give each block its margins from the template (DOCE-PAGINATION-9.2, DOCE-PAGINATION-10.3), truncated to 1/64 px as Chromium lays them out (9.333px is 9.328125px), a plain block with no border or padding on a side taking the margin its first or last child passes through that side when it is larger; nothing is read from the page's computed styles. The reference stylesheet shall zero those of a page's first and last block and of a block whose margin passes through to that edge, the first or last block of a quote, a list or a list item there (to three levels), last in the sheet so no block's own margin wins over it, and the end margin of the block ending a list's last item, so no margin inside a list, such as a nested list's, collapses out past the end of a page the list ends; the rule holds in any writing mode.

Implementation: `src/model/pagination/page-layout.ts`, `src/layout-engine/typography.ts`, `src/layout-engine/blocks/stack.ts`, `labs/reference/document.css`
Verification: `src/model/pagination/page-layout.test.ts`, `src/layout-engine/typography.test.ts`, `e2e/regression.spec.ts`, `e2e/pretext-pagination-stress.spec.ts`

### DOCE-PAGINATION-2.3 - Splitting

A block that does not fit shall be split by its type's layout rule (`LAYOUT_RULES`, `split`) into a fragment that fits and the fragments after it, which the layout places next. A block that cannot split shall start the next page, or, on an empty page, stay there whole however tall it is.

Implementation: `src/model/pagination/page-layout.ts`
Verification: `src/model/pagination/page-layout.test.ts`

### DOCE-PAGINATION-2.4 - Page breaks

A page shall end after a page break, and before a block that starts a page (`breakBefore`), such as each fragment after a split's first. A page break is a marker only: it takes none of its page's height, and the reference stylesheet draws it over the page's content as a thin line that fades towards the page's edges with light centred lettering (`--de-page-break-label`), with no margins.

Implementation: `src/model/pagination/page-layout.ts`, `labs/reference/document.css`
Verification: `src/model/pagination/page-layout.test.ts`, `e2e/editing.spec.ts`

### DOCE-PAGINATION-2.5 - Headings keep with what they head

A heading shall move to the next page with the deeper headings directly under it and the block they head, when that block's type keeps with a heading (`keepsWithHeading`) and the group does not fit. A splittable block shall need only its lead to fit: the first fragment its own split (`LayoutRule.split`) places in the height left below the headings. So the split's limits decide, and a heading over a paragraph that cannot keep two lines on each side of a split, or over a table whose caption, header rows and first body row do not fit, moves with it. A document title shall rank above every heading level. Every built-in block keeps with a heading, a block embed and a figure included, but a list item and a list of contents.

Implementation: `src/model/pagination/page-layout.ts`
Verification: `src/model/pagination/page-layout.test.ts`

### DOCE-PAGINATION-2.6 - Page height

The page height shall be a number, or a function of the blocks that would be on the page and its index, so the space their footnotes take is left out.

Implementation: `src/model/pagination/page-layout.ts`
Verification: `src/model/pagination/page-layout.test.ts`

### DOCE-PAGINATION-2.7 - A split sized by what its head holds

A block split across pages shall be split to the room its head leaves itself: the page height is asked for the head that would be on the page, not the whole block, so the footnotes cited only in its tail take no room on the page. The split is tried at the room the page has without any of the block's footnotes; while the head's own footnotes leave it too little room, at the room they leave; and between a height whose head fits and one whose head does not, at most twelve tries in all look for the tallest head that fits. When the first try does not split or no try fits, the block is split at the room the page has with every footnote of the block. A heading keeps with the block it heads (DOCE-PAGINATION-2.5) by the same split.

Implementation: `src/model/pagination/page-layout.ts`
Verification: `src/model/pagination/page-layout.test.ts`, `src/pagination/layout-document.test.ts`

## DOCE-PAGINATION-3 - Text splits

### DOCE-PAGINATION-3.1 - Paragraphs

A paragraph the editor measured (`TextMeasurement`: the rendered height and lines of its text between two content offsets) shall split after the last word whose text, with the paragraph's height beyond its text, fits (`splitParagraph`, `planParagraphSplit`). The second fragment shall start at the next word, start a page, take the rest of the height and keep its offset in the whole paragraph, so it splits again against the same measurement. Inline nodes that are not text shall stay with the word they touch (`contentText`).

Implementation: `src/model/pagination/text-split.ts`, `src/model/pagination/page-layout.ts`
Verification: `src/model/pagination/text-split.test.ts`

### DOCE-PAGINATION-3.2 - Two lines on each side

Each fragment of a split paragraph shall keep at least `MINIMUM_SPLIT_LINES` (two) rendered lines; a split that would leave the second fragment fewer than its minimum shall move back a line when the first keeps enough, and otherwise the paragraph shall not split there.

Implementation: `src/model/pagination/text-split.ts`
Verification: `src/model/pagination/text-split.test.ts`

### DOCE-PAGINATION-3.3 - Code

A measured code block shall split at the last line break whose lines fit with the block's height beyond its text, which each fragment repeats (`splitCode`, `planCodeSplit`). Neither fragment shall keep the line break, the second shall not be empty, and it shall be marked continued and number its lines on from the first. A later fragment's caption, which shows the caption's text and holds none (DOCE-PAGINATION-1.1), shall be as tall as that text and the continued suffix are laid out after its label: the code figure's measurement carries how much taller that is than the caption (`continuedCaption`), which the held split adds to each later fragment's height and to the height it repeats (DOCE-PAGINATION-11.2); the reference stylesheet hides its empty text's trailing break, which would start a second line.

Successive fragments reuse the source line break offsets and measure the same whole block at those offsets.

On a page that holds nothing yet, code whose first line does not fit even there (one line longer than a page, as minified code or a long value) shall split instead at the start of the last of its wrapped lines that fits, keeping at least one line in each fragment and dropping nothing: the second fragment is also marked as going on with the line the first ends (`codeLineContinued`, `data-code-line-continued`), numbers its lines from that line's number and leaves its first gutter row blank, as a wrapped line's later rows are. On a page that holds blocks already, such code moves on to the next page.

Implementation: `src/model/pagination/code-split.ts`, `src/model/pagination/fragments.ts`, `src/model/schema/code-nodes.ts`, `src/engine/code-drawing.ts`, `src/engine/code-gutter.ts`, `src/document/print-code.ts`
Verification: `src/model/pagination/text-split.test.ts`, `src/model/pagination/fragments.test.ts`, `src/engine/code-drawing.test.ts`, `src/pagination/layout-document.test.ts`, `e2e/code-split-captions.spec.ts`

### DOCE-PAGINATION-3.4 - Linked code

Linked code shall split the same way by its code, its second fragment numbered on from its start line. Its box shall take the code's margins and its code none, so the margins are measured, packed and dropped at a page's edges as a code block's are.

Implementation: `src/model/pagination/code-split.ts`
Verification: `src/model/pagination/text-split.test.ts`

### DOCE-PAGINATION-3.5 - Laid out and joined back

A measured paragraph laid out across pages shall split once per page, and its fragments shall join back into the whole paragraph (DOCE-PAGINATION-1.2).

Implementation: `src/model/pagination/text-split.ts`, `src/model/pagination/page-layout.ts`
Verification: `src/model/pagination/text-split.test.ts`

### DOCE-PAGINATION-3.6 - Splitting after a hard break

A paragraph split at a line that a hard break ended shall move that break to the second fragment's start, so the first fragment ends on its last line's text and draws no line after it. The paged view shall mark such a break, the first node of a later fragment, with `de-split-break`, and the reference stylesheet hide it; the layout engine shall start no line with it, and a later split of that fragment shall count its lines from after it, so each fragment reserves the lines it draws and the fragments put together give back the paragraph. The empty line after a paragraph's last hard break belongs to its last fragment.

Implementation: `src/model/pagination/text-split.ts`, `src/pagination/split-breaks.ts`, `src/layout-engine/runs.ts`, `labs/reference/document.css`
Verification: `src/model/pagination/text-split.test.ts`, `src/pagination/split-breaks.test.ts`, `src/pagination/text-engine.test.ts`, `e2e/block-geometry.spec.ts`

## DOCE-PAGINATION-4 - Container and table splits

### DOCE-PAGINATION-4.1 - Lists between items

A list the editor measured (`ContainerMeasurement`: where each item sits, from the top of the fragment's first item) shall split before the first item that crosses the page's foot when that item cannot split (`splitList`). The second part shall take the rest of the height, start a page and keep its items' layouts; an ordered list's second part shall number on from the items before it, and the pages shall draw it so: an ordered list that starts past 1 carries how many items come before it as `--de-list-start` (`createListStarts`), for a stylesheet's own counter, and the document's markup is unchanged.

Implementation: `src/model/pagination/container-split.ts`, `src/model/pagination/page-layout.ts`, `src/pagination/list-starts.ts`
Verification: `src/model/pagination/container-split.test.ts`, `e2e/regression.spec.ts`

### DOCE-PAGINATION-4.2 - Through an item

An item that crosses the page's foot shall split by its own children the same way (`splitListItem`), through a child that splits by its own rule, so a list splits inside a paragraph of an item or inside a nested list. A paragraph's second fragment inside an item shall keep at least three rendered lines (`splitParagraphWith`), and the item continuation shall be marked continued.

Implementation: `src/model/pagination/container-split.ts`, `src/model/pagination/text-split.ts`
Verification: `src/model/pagination/container-split.test.ts`

### DOCE-PAGINATION-4.3 - Item continuations

An item's second fragment that starts with a block other than a paragraph shall open with an empty paragraph and be marked continued. The empty paragraph has no id, is marked `continuationPlaceholder` (`data-continuation-placeholder`), and takes no room on the page; the reference stylesheet hides it (`data-orphaned-list-continuation`). An item shall not split where either fragment would hold only that empty paragraph.

Implementation: `src/model/pagination/container-split.ts`
Verification: `src/model/pagination/container-split.test.ts`, `e2e/regression.spec.ts`

### DOCE-PAGINATION-4.4 - Quotes

A measured quote shall split between or through its blocks as a list does (`splitContainer`), and its fragments shall join back (DOCE-PAGINATION-1.1). A container's measured `overhead`, the height it takes beyond its children's span, shall count in each fragment: the children shall fit the height less it, and each fragment's height shall include it.

Implementation: `src/model/pagination/container-split.ts`, `src/model/pagination/fragments.ts`
Verification: `src/model/pagination/container-split.test.ts`

### DOCE-PAGINATION-4.5 - Tables

A measured table shall split after its last body row that fits with its height beyond its rows (`splitTableWith`), never inside its leading header rows, never between rows a cell spans (it moves whole when no other row fits), and not when it has one body row. On a page holding nothing else, where no body row fits, it shall split after the first body row no cell spans past, so rows taller than a page overflow it alone and the rest go on to the next page, never the whole table on one page. Its second part shall repeat the header rows when its section's `styles.table.repeatHeader` asks for it, or the template's when the section sets none (`createLayoutRules({ repeatTableHeader })`, by default it does); a layout's `rules` may be given by section for it (`SectionLayoutRules`). When a header cell spans into the body, the continuation shall omit the header group so its body rows keep their original grid. A continuation split again shall keep the actual number of repeated header rows, including zero even if it starts with a body row made of header cells. The continuation draws the source table's column widths while keeping each body cell's stored attributes. A table with its caption (`table_figure`) splits as its table does, measured by its table's rows (`splitTableFigureWith`): the first part holds the caption, and each later part holds an empty caption. When it repeats header rows, the later part shows the original caption through `continuedText`. A later part without repeated headers shall have null `continuedText` and no caption height, including when its first body row is made of header cells or the part is split again. Joining shall drop only header rows that repeat the first part's, and a later part's caption. In the reference stylesheet, a later part shall show the table's caption, with its continued suffix, only when it repeats the header rows. A held table's measurement shall carry its caption's box (`caption`, from block geometry), which each later part with repeated header rows shall keep, and, from block geometry, how much taller a later part's caption, showing the caption's text and the continued suffix, is (`continuedCaption`), which each later part showing its caption takes too, and one without repeated headers does not.

Implementation: `src/model/pagination/table-split.ts`, `src/layout-engine/blocks/tables.ts`, `src/model/pagination/page-layout.ts`, `src/model/pagination/fragments.ts`, `src/pagination/layout-document.ts`, `src/components/document-editor/start-paging.ts`, `labs/reference/document.css`
Verification: `src/model/pagination/container-split.test.ts`, `src/pagination/projection-map.test.ts`, `e2e/regression.spec.ts`

### DOCE-PAGINATION-4.6 - Script blocks

A measured script block shall split its output between or through its blocks as a quote does, keep with a heading before it, and each fragment shall keep the block's script and settings.

Implementation: `src/model/pagination/page-layout.ts`, `src/model/pagination/container-split.ts`
Verification: `src/model/pagination/container-split.test.ts`, `e2e/layout-rules.spec.ts`

### DOCE-PAGINATION-4.7 - Layout sections

A measured layout section (`ContainerMeasurement`: where each column sits, each with its own blocks' layouts) shall split by splitting every column at the same height (`splitLayoutSection`): a column that fits stays whole on the first fragment, one whose blocks split there splits between or through them, and one with no block that fits moves whole to the second. A column with nothing on one side shall hold an empty paragraph there, marked `continuationPlaceholder` as an item's continuation marks it (DOCE-PAGINATION-4.3). A column's height shall be its blocks' span and its overhead, not the height a grid stretched it to beside a taller column. The section shall not split when no column has a block of its own that fits, or none has one left for the next page; a column that holds only a split's empty paragraph has none, so a section whose column starts with a block taller than a page stays whole on a page of its own rather than splitting page after page. It shall keep with a heading before it.

Implementation: `src/model/pagination/layout-section-split.ts`, `src/model/pagination/page-layout.ts`
Verification: `src/model/pagination/container-split.test.ts`, `e2e/layout-rules.spec.ts`

## DOCE-PAGINATION-5 - Measuring

### DOCE-PAGINATION-5.1 - Blocks laid out by the engine

`layoutDocument(state, { engine })` shall lay out each top-level block of a section's page content with the layout engine (`PagesTextEngine.measureBlock`, DOCE-PAGINATION-11.1): its height and margins; a text block's lines as a `TextMeasurement`; linked code's code by its lines; and where each child of a list, list item, quote or table sits, as a `ContainerMeasurement`, with the children laid out the same way. The engine is required: nothing is measured in the DOM, and the pages are not laid out until the engine has loaded. Laid out with these measurements, every page's blocks shall fit its height.

Implementation: `src/pagination/layout-document.ts`, `src/pagination/text-engine.ts`
Verification: `src/pagination/layout-document.test.ts`, `e2e/pagination.spec.ts`

### DOCE-PAGINATION-5.2 - Containers and host rules

A container other than a table, including a script block, a layout section and a layout column, shall carry its `overhead`: how far its first child sits below its top, plus its bottom padding and border. A host's own node type is laid out by its layout rule's `size` (DOCE-PAGINATION-14.1), worked out from the node before it is drawn; a block its rule sizes is a box moved whole, never split, so a host type that must split across pages holds content the engine lays out. Blocks shall split across pages, keep headings with what they head, and join back into the document they were laid out from.

Implementation: `src/pagination/layout-document.ts`, `src/model/pagination/page-layout.ts`, `labs/src/layout-rules.lab.ts`
Verification: `e2e/pagination.spec.ts`, `e2e/layout-rules.spec.ts`

### DOCE-PAGINATION-5.3 - Measurement cache

Withdrawn. Nothing is measured in the DOM, so there is no measurement cache: the layout engine keeps each block it laid out by its node (DOCE-PAGINATION-11.1).

Implementation: `src/pagination/text-engine.ts`
Verification: `src/pagination/text-engine.test.ts`

### DOCE-PAGINATION-5.4 - Measuring again what changed size

Withdrawn. No size is read from what is drawn, so nothing drawn changing size lays the pages out again: every size comes from the document, the template and the served fonts (DOCE-PAGINATION-14), and math waits for its typesetting before it is laid out (DOCE-PAGINATION-10.8).

Implementation: `src/pagination/projection-session.ts`
Verification: `src/pagination/projection-view.test.ts`

### DOCE-PAGINATION-5.5 - Incremental layout

Given a layout memory (`createLayoutMemory`, `layoutDocument`'s `memory`), laying a section out again shall reuse what the change cannot reach (`layoutSectionIncrementally`): with its page height, each page's measured header and footer heights, its footnote area's measurements and the footnotes shown before it as they were, the pages before the first changed block that read no changed block, and, once a page after the change starts at the same unchanged block, with no fragment before it, at the same page index and with the same footnotes shown before it as a page did before, every page from there. A section that did not change reuses every page, and a block that kept its height lays out only the pages around it. The pages shall always be those a full layout gives. `onSection` tells how many pages each section laid out (`pagesLaidOut`).

Implementation: `src/pagination/incremental-layout.ts`, `src/pagination/layout-document.ts`, `src/pagination/projection-layout.ts`
Verification: `src/pagination/incremental-layout.test.ts`, `src/pagination/layout-document.test.ts`, `src/pagination/projection-view.test.ts`

### DOCE-PAGINATION-5.6 - Fonts

The pages are measured with the font files the host serves (DOCE-PAGINATION-12.5), never with the faces the page's document loads, so a face loading in the document lays nothing out again. The text layout engine shall be made again when the served faces of a family the template newly names arrive (`holdTextEngine`). Given what the measurements wait for (`PagedProjectionOptions.ready`), nothing shall be laid out until it settles, loaded or failed, the pages staying pending meanwhile. The document editor's `fonts` adapter (DOCE-HOST-1.14) shall be asked to load the individual families the template names, including each in a fallback stack in order (`templateFontFamilies`, `loadTemplateFonts`) within `FONT_TIMEOUT` milliseconds (five seconds), or the editor's `fontTimeout`, and the pages wait for it; the editor shows no pages without them (DOCE-EDITOR-4.29). After a delayed font loads, the pages shall hold their content.

Implementation: `src/pagination/layout-triggers.ts`, `src/pagination/text-engine-holder.ts`, `src/pagination/fonts.ts`, `src/pagination/projection.ts`, `src/components/document-editor/use-document-layout.ts`
Verification: `src/pagination/layout-triggers.test.ts`, `src/pagination/text-engine.test.ts`, `src/pagination/fonts.test.ts`, `src/pagination/projection-view.test.ts`, `src/components/document-editor/banners.test.tsx`, `e2e/pagination.spec.ts`

### DOCE-PAGINATION-5.7 - Laying out at once

Typing or deleting text inside one textblock shall wait for the writer to pause (DOCE-PAGINATION-7.10), unless it changed its block's height (DOCE-PAGINATION-5.17); any other change to the canonical document, such as Enter, a page break, a footnote, a deletion across blocks, a paste or a drop, shall lay the pages out on the next frame without waiting (`wantsLayoutNow`), and so shall a transaction marked with `layoutNow`. This holds for input on the pages, for what the canonical plugins append to it, and for a change the host shows with the transaction that made it (DOCE-PAGINATION-7.12).

Implementation: `src/pagination/layout-latency.ts`, `src/pagination/projection-session.ts`, `src/pagination/projection.ts`
Verification: `src/pagination/layout-latency.test.ts`, `src/pagination/projection-view.test.ts`

### DOCE-PAGINATION-5.8 - The caret stays in place

When a layout moves the caret of a focused view of the pages on screen, as when its line moves onto the next page, the view's scrolling pane, or the document's, shall scroll by as much once the view draws the new pages, so the caret is back where the writer saw it (`caretPlace`, `keepCaretInPlace`). A view without focus is not scrolled. The caret is read before a layout only when the layout changes the pages up to the end of the top-level block it is in (`movesCaret`), so a layout that changes only what follows it reads nothing drawn.

Implementation: `src/pagination/caret.ts`, `src/pagination/projection-session.ts`, `src/pagination/projection.ts`
Verification: `src/pagination/caret.test.ts`, `src/pagination/projection-view.test.ts`

### DOCE-PAGINATION-5.9 - Checking the drawn pages

After each layout, when the projection is asked to count them (`overflow`, the editor's `debug.overflow`, as tests and the labs ask), the pages the view of the projection drew shall be checked (`findPageOverflow`): a page whose content, footnotes or footer reach more than a pixel below its content box overflows, unless it holds a single block, which may be taller than a page by design. A region or block drawn without a box, such as an empty region its styles hide, reaches nowhere, wherever the page is scrolled. The check runs once the view shows the laid-out pages, also when a layout left them as they were, and not between layouts, so typing does not read every page. The pages that overflow are counted (`stats().overflowPages`) for reports, and nothing is laid out again for them: every size comes from the layout engine, so a fresh layout gives the same pages. Unasked, no page's box is read after a layout and the count stays 0.

Implementation: `src/pagination/layout-validation.ts`, `src/pagination/projection.ts`, `src/pagination/pagination-stats.ts`
Verification: `src/pagination/layout-validation.test.ts`, `src/pagination/projection-view.test.ts`

### DOCE-PAGINATION-5.10 - Page geometry

`pageElements(view)` shall give the element of each page of the paged document a view shows, in the order `PageMap.pages()` lists them; `pageBoxes(view, { scale })` each drawn page's box relative to the view's element, divided by its on-screen scale; and `pageAtPoint(view, { y })` the index of the page a point on screen falls on, or of the nearest page above it, or null above the first page.

Implementation: `src/pagination/page-geometry.ts`
Verification: `src/pagination/page-geometry.test.ts`

### DOCE-PAGINATION-5.11 - Host rules on the document editor

`DocumentEditor` shall lay its pages out with the host's `layoutRules` over the library's (`createLayoutRules`) and join their fragments with the host's `fragmentRules` over `FRAGMENT_RULES` (DOCE-PAGINATION-1.7), on pages and when it joins them for the web layout. The layout rules, and the template's repeat-header settings of each section, shall be read as each section lays out, so a renamed section or other host rules apply from the next layout; other host rules, told apart from the last by each node type's settings rather than by identity (so rules passed inline on each render lay nothing out again while any functions they hold stay the same objects), lay every section out again at once, so no section keeps the rules before; the fragment rules are read when the pages mount.

Implementation: `src/components/document-editor/use-document-layout.ts`, `src/components/document-editor/document-editor.tsx`, `src/components/document-editor/start-paging.ts`
Verification: `src/components/document-editor/document-editor.test.tsx`, `src/components/document-editor/start-paging.test.ts`

### DOCE-PAGINATION-5.12 - A first layout before the first paint

`beforePaintIn(element)` shall give a schedule that runs in a microtask of the element's window, before it next paints, and can be cancelled, so a projection's first layout can land before the first paint.

Implementation: `src/pagination/layout-triggers.ts`
Verification: `src/pagination/layout-triggers.test.ts`

### DOCE-PAGINATION-5.13 - The state laid out follows the document

The state the pages are laid out from, the canonical document with the plugins that change what takes room and no view (DOCE-PAGINATION-7.17), shall follow each new canonical document by the smallest replacements (`followDocument`), node by node where the two pair up: a node whose attributes alone changed, such as a header numbered anew when a section gains a page, takes the new attributes and keeps its content, and within a node whose children no longer pair up, only the range that differs is replaced. Every block a change does not reach keeps its node, and with it what the layout engine kept for it and what the plugins map rather than build again, even when a fresh join of the pages builds it anew. The state shall then hold exactly the document it follows: the change goes in as a remote one, out of the history, so no plugin that derives writes from the writer's own edits (such as the page regions' reset) writes into it, and a state some plugin still changed is replaced by a new state of the document, so the layout and its map never describe another document than the canonical one.

Implementation: `src/pagination/layout-source.ts`
Verification: `src/pagination/layout-source.test.ts`

### DOCE-PAGINATION-5.14 - A block that changed size after it was measured

Withdrawn. Nothing drawn is measured, so no element changing size lays the pages out again (DOCE-PAGINATION-5.4).

Implementation: `src/pagination/projection-session.ts`
Verification: `src/pagination/projection-view.test.ts`

### DOCE-PAGINATION-5.15 - Images and their sizes

Withdrawn. Every image holds its size (DOCE-SCHEMA-3.14) and is laid out from it (DOCE-PAGINATION-10.4, DOCE-PAGINATION-14.5); no image is loaded or waited for to lay the pages out.

Implementation: `src/layout-engine/blocks/objects.ts`
Verification: `src/layout-engine/blocks/objects.test.ts`

### DOCE-PAGINATION-5.16 - A block drawn as no element

Withdrawn. A block the engine cannot lay out takes no room and is reported (DOCE-PAGINATION-14.6), whatever the view draws for it.

Implementation: `src/pagination/text-engine-counts.ts`
Verification: `src/pagination/text-engine-inputs.test.ts`

### DOCE-PAGINATION-5.17 - Typing that changes a block's height

After typing or deleting text inside one textblock, by the writer or a remote one, the pages shall take, on the next frame, the height the layout engine lays the typed top-level block of the canonical document out at now, whole, and compare it with the height the latest layout gave that whole block (`SectionReport.heights`); a block split across pages, such as a quote, a code block or a table, is compared whole too, never by the sum of its parts, which repeat its edges, caption or header row; nothing drawn is read. The block is laid out from the state the pages are laid out from (`followDocument`), moved onto the canonical document first, so the engine keeps it for the next layout, which lays it out no second time. When it moved by more than half a pixel, as when a paragraph gains or loses a line, the pages shall be laid out on that frame, not once the writer pauses. When the writer pauses, the pages shall not be laid out at all when everything typed since the latest layout was text typed or deleted inside paragraphs that had text before and after it, none split across pages, each laid out at the height the layout gave it: they stay as they are, the next layout measures the changed blocks, and the layout state settles as after a layout. Any other change, a block that moved, a heading, an emptied or newly filled paragraph or a split one, lays them out as before. The probe lays out the typed blocks alone, never the blocks of other pages, and reads frames from the window the pages mount in.

Implementation: `src/pagination/typing-probe.ts`, `src/pagination/session-hooks.ts`, `src/pagination/projection-session.ts`, `src/pagination/projection-layout.ts`, `src/pagination/layout-document.ts`, `src/pagination/projection.ts`
Verification: `src/pagination/projection-view.test.ts`, `src/pagination/typing-probe.test.ts`, `e2e/pagination.spec.ts`, `e2e/budget-counters.performance.spec.ts`

## DOCE-PAGINATION-6 - Projection

### DOCE-PAGINATION-6.1 - The whole document

`joinDocumentPages(doc)` shall join each section's pages into one page by steps: the first page's header with the last page's footer, every page's footnote entries, and the content with the fragments that meet there joined (`joinSectionPages`, which can join a range of pages). Its transform's mapping shall map a position in the paged text onto the same text in the whole document.

Implementation: `src/model/pagination/page-transform.ts`
Verification: `src/model/pagination/page-projection.test.ts`

### DOCE-PAGINATION-6.2 - The paged document

`projectDocument(whole, sections)` shall put each section's blocks on the pages its layout gives (`SectionPages`), each page with its section's header and footer numbered through the document (`pageNumber`, `totalPages`) and the entries of the footnotes its blocks are first to cite, so each entry appears once. With footnotes numbered on each page (`footnoteNumbering: 'page'`), each page shall hold the entries of every footnote it cites. It sets no footnote number: the view of the pages draws them (DOCE-FOOTNOTES-2.2). A section without a layout shall keep its blocks on one page.

Implementation: `src/model/pagination/page-projection.ts`
Verification: `src/model/pagination/page-projection.test.ts`

### DOCE-PAGINATION-6.3 - Repaginating by steps

`repaginate(tr, target)` shall step a paged document onto another layout of the same content: in each section, the pages between those it begins and ends with alike (`sameStructure`) shall be joined and split again as the target's own join inverted, with attributes such as page numbers set by attribute steps. Text in the content shall keep its position through the steps, so the selection and the undo history follow it, and the pages before the first change shall stay the same nodes.

Implementation: `src/model/pagination/repaginate.ts`
Verification: `src/model/pagination/page-projection.test.ts`

### DOCE-PAGINATION-6.4 - Growing, shrinking and replacing

Repaginating shall add and remove pages, rejoin a code block's line break and split it again. A section the steps cannot reach shall be replaced whole, and a document with other children replaced, so the result is always the target.

Implementation: `src/model/pagination/repaginate.ts`
Verification: `src/model/pagination/page-projection.test.ts`

### DOCE-PAGINATION-6.5 - A new width

When the page width changes, the pages shall be laid out again from the measured whole document and the editor moved onto them by steps, with the caret on the same text.

Implementation: `src/model/pagination/repaginate.ts`, `labs/src/pagination.lab.ts`
Verification: `e2e/pagination.spec.ts`

### DOCE-PAGINATION-6.6 - Typing and undo

As the writer types, the pages shall be laid out again, with the caret where the typing left it and every page holding its content, and undo shall undo the typing through the repaginations, which stay out of the history.

Implementation: `src/model/pagination/repaginate.ts`, `labs/src/pagination.lab.ts`
Verification: `e2e/pagination.spec.ts`

### DOCE-PAGINATION-6.7 - Joining as the pages meet

Joining a section's pages (DOCE-PAGINATION-6.1) shall give the same whole document and the same mapping of every position as joining the pages first and then their blocks' fragments in reading order, at a cost that grows with the blocks times the log of the pages rather than with the blocks times the fragments. The pages join in pairs, round after round; each run of fragments joins where its two pages meet, read from the pages before any step, and a page whose one block continues on both sides holds back the join after it until the rounds are done, so every join meets the next fragment as the page split it. A page without blocks, or two fragments of one block on one page, takes the joins in reading order. Repaginating (DOCE-PAGINATION-6.3) copies the target's attributes in one walk over the joined pages.

Implementation: `src/model/pagination/page-transform.ts`, `src/model/pagination/repaginate.ts`
Verification: `src/model/pagination/page-transform.test.ts`

## DOCE-PAGINATION-7 - Showing a document on pages

### DOCE-PAGINATION-7.1 - Laying the pages out

A projection (DOCE-PAGINATION-7.10) shall keep its pages laid out from a state of the whole canonical document with no view, which follows it by the smallest replacement (DOCE-PAGINATION-5.13), so unchanged blocks keep what the layout engine kept for them; after each change, once the writer pauses for `settle` milliseconds (150 by default, and never more than four times as long after the first change; 0 for every change) and no pointer button is down on the pages, so a layout never lands in the middle of a drag (a press ends on a button's release, a drag's end or drop, or the window losing focus), then on the next frame and never during composition, the pages shall be laid out from it (`layoutDocument`), unless typing kept its blocks at their heights (DOCE-PAGINATION-5.17) and the projection stepped onto them (DOCE-PAGINATION-6.3) in a transaction marked as a layout's (`isPaginationTransaction`) and kept out of the undo history. `refresh({ remeasure })` shall lay the pages out again, starting that state's plugins over after a change to a value a plugin shows. The state shall run the `plugins` the pages render with, and the `layoutPlugins` beside them, so the plugins that decorate and typeset the document (page variables, math) run on it; their plugin views do not run, as nothing renders it. `element`, an element of the document the pages show in, gives the window that schedules the layouts and the fonts that settle them. A projection made again, as when the host remounts the editor, starts from a new state, and a layout due as a projection goes lays nothing out.

Implementation: `src/pagination/projection.ts`, `src/pagination/projection-session.ts`, `src/pagination/projection-layout.ts`, `src/pagination/layout-document.ts`, `src/pagination/layout-triggers.ts`
Verification: `e2e/pagination.spec.ts`, `e2e/document-editor.spec.ts`, `src/pagination/layout-triggers.test.ts`

### DOCE-PAGINATION-7.2 - Room for footnotes

Each page shall leave room for the footnote entries it holds: their heights as the engine lays the area out, each with the space before the next but the page's last without it, and the area's own height beyond them (`footnoteAreaOf`, `footnoteAreaHeight`, DOCE-PAGINATION-11.10). An entry shall be on the first page that cites it, unless footnotes are numbered on each page, when each page holds the entries of every footnote it cites. The view of the pages numbers them (`createFootnoteNumbers`, DOCE-FOOTNOTES-2.2): through the document, or from 1 on each page; the numbers follow a change mirrored onto the pages at once, before the pages are laid out again. The engine lays markers and entry numbers out with the numbers through the document, or, when footnotes are numbered on each page, with the room of one digit (the width of `0`), whatever number the page draws: the document it lays out has no pages to number by, so no layout waits on the numbers it draws and renumbering the footnotes lays nothing out again. A page that draws a two-digit number draws it wider than it was laid out. A page that holds none leaves no room, and a footnote inserted where its page is full moves the block that no longer fits on before the writer types in it.

Implementation: `src/pagination/layout-document.ts`, `src/pagination/footnote-area.ts`, `src/model/pagination/page-projection.ts`, `src/pagination/projection.ts`, `src/engine/footnote-numbers.ts`, `src/pagination/node-numbers.ts`
Verification: `e2e/pagination.spec.ts`, `e2e/split-paragraphs.spec.ts`, `src/pagination/text-engine.test.ts`, `src/pagination/layout-document.test.ts`, `e2e/objects.spec.ts`, `src/engine/footnote-numbers.test.ts`, `src/pagination/node-numbers.test.ts`

### DOCE-PAGINATION-7.3 - A caret in a moving footnote

A selection in a footnote entry that moves to another page shall move with it, at the same place in the entry's text: the selection is the canonical one, which a layout does not move, mirrored onto the page that shows the entry.

Implementation: `src/pagination/selection-mirror.ts`, `src/pagination/projection-session.ts`
Verification: `e2e/pagination.spec.ts`

### DOCE-PAGINATION-7.4 - Layout debugging

Each layout shall keep, until the next change, how each page was filled (`pageMetrics(state)`, `PageMetric`, from `layoutDocument`'s `onPage`): the height it has for its blocks, what they take with facing margins collapsed (`used`) and with every margin counted (`stacked`), the room its header, footer and footnote area take, and each block's height and where it starts below the content's top (`tops`). `createPageDebug({ shown, sheet })` shall show the parts `shown` names (`PageDebugParts`), every length with three decimals (`debugLength`): with `pages`, each page carries its sheet's and its content's width and height when `sheet` gives its section's sheet (`PageDebugSheet`), its header's and footer's room, what its blocks take, collapsed and stacked, the height left and the device pixel ratio of the window it is drawn in (`data-debug-paper`, `data-debug-content`, `data-debug-header`, `data-debug-footer`, `data-debug-used`, `data-debug-stacked`, `data-debug-free`, `data-debug-dpr`); with `blocks`, each region of a page and each block on it carries its node type (`data-debug-type`), and each block its laid-out height and top (`data-debug-height`, `data-debug-top`), and `data-debug-overflow` when it reaches below the page's room. They shall show the latest layout, also one that kept the same pages. The document editor's `debug` shows them (DOCE-EDITOR-6.13).

Implementation: `src/pagination/layout-marks.ts`, `src/pagination/layout-document.ts`, `src/pagination/page-debug.ts`, `src/components/document-editor/use-document-layout.ts`
Verification: `src/pagination/page-debug.test.ts`, `e2e/document-editor.spec.ts`

### DOCE-PAGINATION-7.5 - Stats

A projection's `stats()` shall count what its layouts did since it was made (`PaginationStats`), its first layout, run while it is made, included: the layouts run (`layouts`); the blocks the layout engine laid out anew rather than taking from what it kept (`blocksMeasured`); the sections laid out with at least one block laid out anew (`sectionsRelaid`) and from the blocks the engine kept alone (`sectionsReused`); the pages broken from their blocks rather than reused from the layout before (`pagesLaidOut`, DOCE-PAGINATION-5.5); the pages drawn taller than they are (`overflowPages`, DOCE-PAGINATION-5.9); and the pages a layout kept as they were (`pagesReused`) and built anew (`pagesRebuilt`). The transaction a layout moves the projection with carries the counts as they stood after it (`layoutStats(tr)`); any other transaction carries none.

Implementation: `src/pagination/layout-marks.ts`, `src/pagination/pagination-stats.ts`, `src/pagination/layout-document.ts`
Verification: `src/pagination/projection-view.test.ts`

### DOCE-PAGINATION-7.6 - Layout state

`layoutState()` shall say whether the pages are `pending`, `settled` or `failed`, and `onLayoutStateChange` tell of each change. A projection is pending from its start, and again on each change, each layout asked for and each `refresh`. Two frames after a layout, once the views that follow the pages have drawn, it is settled when no layout is asked for and no edit waits for one. While the served fonts of the current template are pending (`fontsPending`), it is pending, not settled; when they start or stop being pending (`fontsChanged()`), no layout runs for it: it settles two frames on once nothing is due, and lays the pages out only when a change waits for a layout (new faces lay them out again through the engine, DOCE-PAGINATION-12.5). A layout that throws fails, and so does a layout due after eight layouts in a row moved the pages with no change or `refresh` in between: that layout does not run, and the next change or `refresh` lays the pages out again. `whenSettled()` shall resolve with `settled` or `failed` once no layout is pending. Destroying the projection shall resolve outstanding readiness requests with `failed` without reporting a layout failure through `onLayoutStateChange`.

If the requested text layout engine fails to load or has no served fonts, the projection shall fail without laying out any pages. Refreshing that projection shall keep it failed. The failure does not wait for optional readiness inputs, whose own failures allow layout to proceed once the engine is available (DOCE-PAGINATION-5.6).

Readiness requests already waiting shall resolve before the matching state-change callback runs. A new request after a refresh started by that callback shall wait for its new layout. A callback exception shall preserve the readiness result and any layout already requested. Destroying the projection shall fail remaining requests even if a node view throws while being destroyed. Late input completion shall schedule no layout after destruction.

Implementation: `src/pagination/projection.ts`, `src/pagination/projection-session.ts`, `src/pagination/projection-view.ts`, `src/pagination/layout-readiness.ts`, `src/pagination/layout-triggers.ts`, `src/pagination/session-hooks.ts`, `src/components/document-editor/use-document-layout.ts`
Verification: `src/pagination/projection-view.test.ts`, `src/pagination/projection-session.test.ts`

### DOCE-PAGINATION-7.7 - The layout

`pageMap(state, view?)` shall give the layout of the document a state shows (`PageMap`). For a canonical state and the view rendering it on pages, it shall give that view's projected pages. Without a projection view it shall read the state's own document, made once for each document and joined by `FRAGMENT_RULES`; `createPageMap(paged, rules)` shall make one for any paged document. `pages()` shall list its pages in order (`LaidOutPage`): each with its number through the document from 1, its section's index from 0, and its page node and where it starts in the paged document. `pageAt(pos)` shall give the page holding a position in the canonical whole document (DOCE-PAGINATION-6.1), the page after a break that falls inside a block by default and the page before it with `assoc` -1, or null where no page holds it; a footnote entry's position gives the page that shows the entry. `pageOf(elementId)` shall give the first page holding the element with that id, or null. Reading the pages and elements shall not join the pages; the first position mapped does, once.

Implementation: `src/pagination/page-map.ts`, `labs/src/pagination.lab.ts`
Verification: `src/pagination/page-map.test.ts`, `e2e/pagination.spec.ts`

### DOCE-PAGINATION-7.8 - Positions between the pages and the canonical document

`toCanonical(pos)` and `toProjection(pos)` shall map a position between the paged document (the projection) and its canonical whole document (`canonical`) through the page transform's steps, so every position in the content's text maps exactly both ways. A projection position at the end of a textblock shall keep to the text before it unless `assoc` says otherwise; a canonical position where a page break falls inside a block shall map after the break, or before it with `assoc` -1. Positions the transform moves or drops shall be found again at the same offset: inside any visual copy of a footnote entry, in the sole canonical entry of the same footnote, and inside a header row a table continuation repeats, in the canonical table's row. A position found in neither shall map to null.

Implementation: `src/pagination/page-map.ts`, `src/pagination/page-positions.ts`
Verification: `src/pagination/page-map.test.ts`

### DOCE-PAGINATION-7.9 - Positions kept exact between layouts

The projection map (`ProjectionMap`) shall map positions between a projection and its canonical document as DOCE-PAGINATION-7.8 does, and stay exact as both change between layouts. An edit made on both documents shall extend it by the projection step inverted and the canonical step, paired as mirrors, so positions inside newly inserted content map across. A canonical step mirrored onto the projection shall be placed by its ends; a replacement inside one textblock whose range crosses a page break shall be mirrored page by page, so the pages between keep their footnotes, header and footer; and an edit to a header row a split table repeats or to a footnote drawn on more than one page shall be made on every copy. A body row made of header cells shall keep its own position and content when the original header is edited, even if both rows share the same node. A captioned continuation shall receive mirrored header edits only when its caption carries repeated text (DOCE-PAGINATION-1.4). A selection set by the browser after its edit shall keep its position in the edited content when the mirror takes different steps. Typing or selecting in a later repeated table header or footnote shall keep the selection in that visual occurrence while it survives, including through repagination. Undoing an edit in a later repeated table header shall restore both endpoints of the prior selection in that copy while it survives. On generated documents and layouts, every character shall map both ways, and keep doing so through generated edits made on either side and mirrored onto the other.

Implementation: `src/pagination/projection-map.ts`, `src/pagination/projection-input.ts`, `src/pagination/projection-steps.ts`, `src/pagination/page-positions.ts`, `src/pagination/footnote-positions.ts`, `src/pagination/selection-mirror.ts`
Verification: `src/pagination/projection-map.test.ts`, `e2e/footnote-occurrences.spec.ts`, `e2e/regression.spec.ts`

### DOCE-PAGINATION-7.10 - The paged projection

`createProjectionView({ mount, state, pageHeight })` shall show a canonical state, the whole document with each section on one page and whole blocks, on pages: a read-only projection view mounted in `mount`, with the `nodeViews` given, shows the paged document, the only view of it; the pages are laid out from a state of the canonical document with the same `plugins` and no view (DOCE-PAGINATION-7.1). After an edit, once the writer pauses (`settle`, as DOCE-PAGINATION-7.1) and never during composition, a layout due during one waiting for its end (`compositionend`) with nothing scheduled meanwhile, the pages shall be laid out by the layout engine and the projection stepped onto them, with the canonical selection on the side of a page break nearest the projection's. The projection's document shall change only by a layout or by a canonical change mirrored onto it: any other change is input (DOCE-PAGINATION-7.11), or is refused and drawn again when a step does not map onto the canonical state or, taken as the browser made it, would cross a region of a page. A refused change made during a composition, as one typed with an input method into a page header, makes the browser drop the composition without ending it: once that composition sends nothing for a second (`DROPPED_COMPOSITION_MS`) and has not ended, the view shall be told it ended and the pages laid out, so they never wait for it for good. Its pages shall always join into the canonical document. `stats()` shall count the layouts (`layouts`), the refused changes (`refused`) and the canonical changes that could not be mirrored and laid the pages out at once (`relaid`); `onLayout` shall be told of each layout. A projection that starts, or starts again, shall start from the canonical selection and dispatch nothing to the canonical state until a view shows its pages.

Implementation: `src/pagination/projection-view.ts`, `src/pagination/projection-layout.ts`, `src/pagination/layout-source.ts`, `src/pagination/dropped-composition.ts`, `src/pagination/layout-triggers.ts`, `labs/src/spikes/spike-projection.lab.tsx`
Verification: `src/pagination/projection-view.test.ts`, `src/pagination/projection-session.test.ts`, `src/pagination/dropped-composition.test.ts`, `e2e/spike-projection.spec.ts`, `e2e/editing-layout.spec.ts`

### DOCE-PAGINATION-7.11 - Input on the pages

Input on the projection shall run on the canonical state, which holds the undo history. Enter, Backspace, Delete, paste and the commands given as `keys` shall run as commands on the canonical state (`run`), with the projection's selection mirrored there first; Backspace and Delete delete one character where the browser would, a whole grapheme cluster (a flag, a family emoji, a letter with its accents) of any length, as an arrow key at a page break steps over one: a family of four people with skin tones (19 UTF-16 units) or a letter with 40 accents is one character, its boundaries the ones the whole text block has. Changes the browser makes in the DOM (typing, composition, spellcheck replacements) shall be mapped step by step onto the canonical state and paired with their mirror, so the writer's DOM is not drawn again under them; a selection that only followed such an edit follows it on the canonical state too. An arrow key at a page break inside a split block shall move the caret a character on the canonical text. A cell selection dragged across the parts of a split table shall select cells of the canonical table and be drawn on every part (`selectedCell`); while the pages still show the caret a canonical cell selection is drawn with, as when a menu or the toolbar runs a command on the cells and the document takes the focus back, the cell selection stands and is not replaced by that caret; the drag ends when the button is released, is no longer down as the pointer moves, or the press turns into a native drag, and when the projection goes; and a column resized on one part shall set the canonical table's column, so every part follows; `resizeColumns: false` leaves resizing to the canonical plugins. Each canonical transaction input makes shall go to `dispatch`, and be applied to the canonical state the projection holds with what the canonical plugins append to it, which is shown on the pages at once; beside another writer in a shared room, typing, Enter, Backspace, a mark, undo, redo and paste on the pages each reach the canonical state, the pages and the other writer once. A copy, a cut and a drag shall take the content of the canonical selection the pages' selection stands for, whole blocks with no page, header or footer between them, and text copied across a forced line's break (DOCE-PAGINATION-11.2) with no line break there; a slice that is not the selection's, as a dragged node's, shall be taken as the blocks its pages hold. A pasted or dropped slice that holds more than one page of a section, as another view of pages copied it, shall be taken as the blocks of its pages' content, the parts of a split block joined (`contentSlice`), so no paste adds a page to a section.

Implementation: `src/pagination/projection-input.ts`, `src/pagination/selection-mirror.ts`, `src/pagination/graphemes.ts`, `src/layout-engine/graphemes.ts`, `src/pagination/cell-drag.ts`, `src/pagination/projection-view.ts`, `src/pagination/canonical-clipboard.ts`, `src/model/pagination/page-slice.ts`
Verification: `src/pagination/projection-view.test.ts`, `e2e/spike-projection.spec.ts`, `src/pagination/canonical-clipboard.test.ts`, `src/model/pagination/page-slice.test.ts`, `src/pagination/cell-drag.test.ts`, `src/pagination/graphemes.test.ts`, `src/layout-engine/graphemes.test.ts`, `e2e/layout-invariant.spec.ts`, `e2e/table-selection.spec.ts`, `e2e/shared-room.spec.ts`, `e2e/text-layout.spec.ts`

### DOCE-PAGINATION-7.12 - Canonical changes reach the pages

`update(state, tr)` shall show a new canonical state on the projection at once: by the steps of `tr` when it made the state from the document shown, otherwise, as for a state the host replaced or a remote change, by the smallest replacement between the two documents; a state whose document is the one shown changes only the selection, unless the browser shows a selection the pages had not read yet, as after keys pressed while the host still rendered a click's: that newer selection stays on the pages and goes to the canonical state instead. A change that cannot be mirrored shall lay the pages out at once, including one whose steps the projection map places outside the pages, as when the pages no longer join into the document shown; it never throws. The pages are laid out again once the writer pauses. The pages shall scroll to the selection for a change, also one of the selection alone, only when a transaction that made it asked to (`scrollIntoView`), as a view of the canonical state would: going to a place in the document brings it into view, and a change nothing asked to scroll for, such as a collaborator's or a state the host replaced, leaves the pages where the writer reads them.

Implementation: `src/pagination/projection-mirror.ts`, `src/pagination/projection-view.ts`, `src/pagination/projection-session.ts`
Verification: `src/pagination/projection-view.test.ts`, `src/pagination/projection-session.test.ts`, `e2e/shared-room.spec.ts`

### DOCE-PAGINATION-7.13 - Canonical decorations on the pages

The projection shall draw every decoration the canonical state's plugins draw (search, proofing, comments, changes), mapped onto its pages, including one that crosses a page break; a node decoration on a block split across pages is drawn on each of its parts, including a leaf block such as a list of contents, whose parts after the first map to no canonical content; a decoration on content only the projection holds, such as a repeated header row, is not drawn there. A set unchanged on pages unchanged shall be drawn as it was, not merged or mapped again, so a state of the pages that changes neither, such as a selection's, costs nothing more for them. Whatever renders the projection (`createPagedProjection`, without a view of its own) shall render it with the plugins its state carries, pass each of its transactions to `receive`, and take each new projection state from `onProjection`.

Implementation: `src/pagination/canonical-decorations.ts`, `src/pagination/projection.ts`
Verification: `src/pagination/projection-view.test.ts`, `src/pagination/canonical-decorations.test.ts`

### DOCE-PAGINATION-7.14 - The pages' view as a canonical view

`canonicalView(view, { canonical, map, dispatch })` shall give the view that renders the projection as a view of the canonical state, for toolbars, menus and commands: its `state` is the canonical state, `dispatch` takes canonical transactions, and `coordsAtPos`, `domAtPos`, `nodeDOM`, `posAtDOM` and `posAtCoords` take and give canonical positions; everything else is the projection view's. Any fragment of a split atom, such as linked code split across pages, stands for its whole block: `posAtCoords` gives the block as the node a point on any fragment is inside, a node selection of a continued fragment mirrors as the block's (`canonicalNodeAt`), so the context menu, Enter and the editing commands act on that block and never on the one after it, and the fragment the writer selected stays the one drawn selected.

Implementation: `src/pagination/canonical-view.ts`, `src/pagination/selection-mirror.ts`
Verification: `src/pagination/projection-view.test.ts`, `e2e/linked-code-fragments.spec.ts`

### DOCE-PAGINATION-7.15 - The canonical plugins run through the pages

The canonical state's plugins shall run on the canonical view of the view that renders the projection (DOCE-PAGINATION-7.14), as they would on a view of their own. Their plugin views shall start with it and be updated with each new canonical state, and what they dispatch shall reach the canonical state and the pages at once. Their key handlers shall run after an arrow key's move across a page break and the host's `keys`, and before Enter, Backspace and Delete; their paste handlers before the projection's paste, and their transforms of pasted HTML, text and slices, and their parse of pasted text, shall shape what is pasted on the pages. Their transforms of a copied slice and their text of it (`transformCopied`, `clipboardTextSerializer`) shall run on the canonical content the pages copy (DOCE-PAGINATION-7.11), on the canonical view, so the text copied from the pages is the text copied from the document. Their text input, click, double- and triple-click handlers, and those on the nodes around a click, shall take canonical positions and nodes, a node only the pages hold being offered to none; their drop, key press and scroll-to-selection handlers shall run on the canonical view; the attributes they give the editor shall be given to the view of the pages, classes joined; and their handlers of DOM events shall see those events, a press, the pointer's moves and its leaving, a drop and a paste included, so a plugin that tells content moved within the document from content pasted into it sees the drop on the pages, a column border dragged on the pages resizes the canonical table and a Ctrl-click there selects its cell. Input that a canonical plugin takes shall have the projection's selection mirrored onto the canonical state first, and input no canonical plugin takes shall cost nothing more, so typing keeps its budget (DOCE-PAGINATION-7.10). A press stays the projection's as well: it places the caret on the pages, or starts a cell drag across them, which the canonical cell drag does not take. The canonical plugins' node views shall draw their nodes on the pages, with canonical positions, including those of plugins the canonical state gains after the projection is made. Text typed on the pages that no canonical plugin takes, while the canonical state holds marks for the next text (`storedMarks`), such as a mark turned on at the caret or the marks a typing shortcut leaves (DOCE-EDITING-6.2), shall be typed into the canonical state with those marks; text the browser hands back with it that was already there, such as a space at the end of a line, keeps its own.

Implementation: `src/pagination/canonical-plugins.ts`, `src/pagination/canonical-handlers.ts`, `src/pagination/projection.ts`, `src/pagination/projection-input.ts`, `src/pagination/canonical-clipboard.ts`
Verification: `src/pagination/projection-view.test.ts`, `src/pagination/canonical-clipboard.test.ts`, `src/pagination/canonical-plugins.test.ts`, `e2e/editing.spec.ts`

### DOCE-PAGINATION-7.16 - How the projection's layouts go

A projection shall tell how its layouts go. `layoutState()`, `whenSettled()` and `onLayoutStateChange` behave as in DOCE-PAGINATION-7.6, including failing when a layout throws or layouts keep moving the pages with no change in between. `refresh({ remeasure })` behaves as in DOCE-PAGINATION-7.1. `stats()` shall count what its layouts did (DOCE-PAGINATION-7.5), beside `refused` and `relaid`. Each layout's projection transaction shall be marked as a layout's (`isPaginationTransaction`, `layoutStats`), shall record its pages' metrics (`pageMetrics`), and shall be handed to `onLayout`.

Implementation: `src/pagination/projection.ts`, `src/pagination/projection-session.ts`, `src/pagination/projection-layout.ts`
Verification: `src/pagination/projection-view.test.ts`

### DOCE-PAGINATION-7.17 - DocumentEditor on the projection

DocumentEditor shall keep `state` as the whole document, each section on one page, and render a paged projection of it (DOCE-PAGINATION-7.10), laid out by the layout engine. The document shall be rendered once, on the pages: no hidden view renders it again to measure it. A block the host's React node views draw (`nodeViews`, read when the pages mount) takes the room its layout rule's `size` gives it, and none without one (DOCE-PAGINATION-14.1). The state the pages are laid out from shall run the editor's plugins except proofing and search, whose marks take no room, and any plugin whose spec says `measured: false`, such as the shared document's sync (DOCE-COLLAB-4.1), which belongs to the editor's own state. Input on the pages shall become canonical transactions that pass through the editor's dispatch body (suggestions, proofing) to `onStateChange`; a transaction the host does not commit, or one made on a state the host no longer holds, shall be taken back off the pages: one the host does not commit back to the state before it, not to the state React last drew, which may predate a selection the pages have sent since, as a key extending it. Each state the host commits shall be shown on the pages (DOCE-PAGINATION-7.12). The toolbar, menus, dialogs, table handles, the host's events and the editor's own view props shall see the canonical view (DOCE-PAGINATION-7.14), and layouts shall be told as the pagination's are (DOCE-PAGINATION-7.16). The editor's plugin views shall run on the canonical view and be updated when the pages are drawn again as well as when the state changes, so a code block's highlights (DOCE-OBJECTS-3.3) are painted on the pages shown, every part of a split block included. The layout's plugins that read the pages, page debugging (DOCE-PAGINATION-7.4) and page variables (DOCE-PAGINATION-8.2), shall run on the pages, and draw them again when what they show changes. The pages shall wait for the template's fonts (DOCE-PAGINATION-5.6), and each layout shall start from what the one before found. `pageMap` given the editor's canonical state and view shall give the layout of that view's pages, so the status bar, properties and contents show the pages of their own view. A canonical caret at a page break shall go to the side of the break that stands for its position, so a caret after the line break a split code block dropped sits at its continuation's start. A caret at a code fragment's end shall stand for the place before that line break, so Delete there removes it. The browser's selection not reported yet shall be read before a layout draws the pages again (DOCE-EDITOR-1.4), but only while the pages show the canonical document, so a change that could not be mirrored keeps the caret it placed. A state of another schema, as a document swapped in or a template previewed, shall start the projection over.

Implementation: `src/components/document-editor/use-paged-projection.ts`, `src/pagination/canonical-plugins.ts`, `src/engine/code-highlighting.ts`, `src/components/document-editor/start-paging.ts`, `src/components/document-editor/use-document-layout.ts`
Verification: `src/components/document-editor/use-paged-projection.test.ts`, `e2e/projection-editor.spec.ts`, `e2e/regression.spec.ts`

### DOCE-PAGINATION-7.18 - The pages' layout without joining them

The layout of a canonical document a projection shows (`pageMap`, DOCE-PAGINATION-7.17) shall map its positions through the map the projection keeps between its pages and that document (DOCE-PAGINATION-7.9), so reading pages and positions on each keystroke joins no pages; `createPageMap(paged, rules, positions)` shall do so for any paged document whose positions are known. Only a document the pages do not show exactly, as while an edit typed on the pages is on its way to the canonical state, shall map through the page transform, and a document shown before keeps the pages that projection showed it on. Two views sharing the same immutable document shall keep independent page counts, current pages and contents numbers, including after one view is detached. Joining a section's pages shall join them in pairs, round after round, so each block is copied a number of times that grows with the log of the pages, and the fragments that meet shall then join in time linear in the blocks; measuring a parent's blocks shall find each block's element from the one before it.

Implementation: `src/pagination/page-map.ts`, `src/pagination/projection-session.ts`, `src/pagination/projection-attachment.ts`, `src/model/pagination/fragments.ts`, `src/model/pagination/page-transform.ts`
Verification: `src/pagination/page-map.test.ts`, `src/pagination/projection-view.test.ts`

### DOCE-PAGINATION-7.19 - A keystroke drawn once

Text typed on the pages shall be offered to the canonical plugins (DOCE-PAGINATION-7.15) with the selection the view read with the browser's change mirrored on the canonical state, without having the view read the browser again, which would draw the pages without the text and then with it. The values of page variables (DOCE-PAGINATION-8.2) shall move with a change that only edits text inside a textblock, adding and taking no variable, and be found again through the document after any other change, so typing reads the variables of no other block. A host that holds the canonical state shall take a transaction the pages made as the state the projection made of it, while the host still holds the state it was applied to, so what the canonical plugins appended to it, such as the element ids of a new block, is the same on the pages and in the host, and the host applies no transaction a second time.

Implementation: `src/pagination/canonical-plugins.ts`, `src/pagination/projection-session.ts`, `src/pagination/page-variables.ts`, `src/components/document-editor/use-paged-projection.ts`
Verification: `src/pagination/projection-view.test.ts`, `src/pagination/page-variables.test.ts`, `src/components/document-editor/document-editor.test.tsx`

### DOCE-PAGINATION-7.20 - The layout's trace

Given `trace` (`LayoutTraceSink`), a projection shall write a line for each event while the sink gives where it goes (`LayoutTrace`), and write nothing, nor make its values, while it gives none. A `render` line tells of what draws the pages: a layout (`layout`, with the layouts so far, the pages and how long it took), a canonical change mirrored onto the pages (`mirror`) and a change refused and drawn again (`refuse`); a `trace` line of scheduling: a layout asked for (`layout.request`), an edit left to settle (`settle`), a layout skipped during composition (`layout.skip`) and one that fails because layouts did not converge (`layout.fail`). Each line is the event followed by its values as `key=value` pairs under short keys (`traceLine`), a number that is not whole with three decimals. The document editor's `debug.trace` receives it (DOCE-EDITOR-6.13).

Implementation: `src/pagination/layout-trace.ts`, `src/pagination/projection-session.ts`, `src/components/document-editor/start-paging.ts`
Verification: `src/pagination/layout-trace.test.ts`

### DOCE-PAGINATION-7.21 - Caret keys and clicks across pages

The browser's caret and selection keys and clicks shall act on the whole document across pages, in both layouts: arrows and Shift+arrows across a page boundary, Home and End on the line, Page Up and Page Down, word moves and word deletes, double, triple and Shift clicks; and a read document shall take none of them as an edit. Mod-Home and Mod-End (`createDocumentEditing`) shall put the caret at the document's first and last text, and Shift with them extend the selection there, past an object that holds no caret, such as a list of contents opening the document, and never into a page's header or footer. On pages, a press on the empty space of a page's content below its last block shall put the caret at the end of that page's last text, or extend the selection there with Shift; a page whose content is empty shall first get an empty paragraph, on the canonical state, while the editor is editable and the place is not locked.

Implementation: `src/engine/body-edge.ts`, `src/pagination/page-caret.ts`, `src/pagination/projection.ts`
Verification: `src/engine/body-edge.test.ts`, `src/pagination/page-caret.test.ts`, `e2e/caret-keys.spec.ts`

### DOCE-PAGINATION-7.22 - Input right after focus

A click or key that comes right after the editor takes focus, on the pages or in the web layout, or in a paged projection's own view (`createProjectionView`), shall keep its selection on a busy page. The view takes focus itself and makes one check of the selection the browser shows, twenty milliseconds on, in place of the engine's own: when a press on the view brought focus or input came after it, the check reads the browser's selection, so that nothing draws the view's older selection back over a key the browser has acted on but not yet reported; a focus with no input, such as one from the keyboard or the host, keeps the view's selection: the view draws it at the check where the browser shows another, and at once where the browser shows none of its own, none in the view or a caret at the content's start as a dialog handing focus back leaves, or any while the view holds cells or a node selected, which the browser cannot show, as when a menu that acted on them hands focus back, so neither pages drawn nor a selection change reported before the check take that place for the writer's.

Implementation: `src/utils/dom-selection.ts`, `src/components/document-editor/editor-body.tsx`, `src/pagination/projection-view.ts`
Verification: `src/utils/dom-selection.test.ts`, `src/pagination/projection-view.test.ts`, `e2e/caret-keys.spec.ts`, `e2e/presence.spec.ts`, `e2e/spike-projection.spec.ts`, `e2e/table-selection.spec.ts`

### DOCE-PAGINATION-7.23 - Inline atoms at a paragraph's edge

On the pages, text typed with the caret after an inline atom that ends its paragraph, such as an abbreviation, shall go after the atom, in what the pages show and in the document; and Backspace at the start of a paragraph holding only one inline atom shall join it into the paragraph before, keeping that paragraph's text and exactly one atom.

Implementation: `src/components/document-editor/pages-view.tsx`
Verification: `e2e/references.spec.ts`

### DOCE-PAGINATION-7.24 - The first key after a click

The first key or character the writer types right after a click, on the pages or in the web layout, shall act at the caret the click placed, without waiting for the browser to report it: whether the click brought focus or the editor had it, and before any selection change from the click reaches the document.

Implementation: `src/utils/dom-selection.ts`, `src/components/document-editor/use-editor-engine.ts`, `src/components/document-editor/pages-view.tsx`
Verification: `src/utils/dom-selection.test.ts`, `e2e/caret-keys.spec.ts`

### DOCE-PAGINATION-7.25 - No older caret drawn back

A selection the pages have sent, such as the caret a key moved, shall stay when React commits a render of an older state after it, as a render under way when the key came: the pages draw the projection's latest state, not the one the render holds, and a host state the pages' own commits made is not shown on them again once they have sent a later one, so the next key acts where the last one left the caret.

Implementation: `src/components/document-editor/pages-view.tsx`, `src/components/document-editor/use-paged-projection.ts`
Verification: `src/components/document-editor/pages-view.test.tsx`, `src/components/document-editor/use-paged-projection.test.ts`, `e2e/caret-keys.spec.ts`

### DOCE-PAGINATION-7.26 - One canonical state for a rewritten change

When the editor's dispatch body commits another transaction in place of one the pages made, on the same canonical state, such as the change rewritten as a suggestion or a refused suggestion's notice, the projection's canonical state shall be the state that transaction makes, at once, and the host shall take that same state. The canonical plugins never see the change as the pages made it: a shared document's binding sends a suggester's typed text, or a deleted range, as one change that already carries the suggestion's marks and author, never the plain change first. The body sees the state the transaction was made on, also while the host has not yet drawn the one the pages' last change made.

Implementation: `src/pagination/canonical-change.ts`, `src/pagination/projection-session.ts`, `src/components/document-editor/use-paged-projection.ts`
Verification: `src/pagination/projection-session.test.ts`, `src/components/document-editor/use-paged-projection.test.ts`, `e2e/session-room.spec.ts`

## DOCE-PAGINATION-8 - Page headers and footers

### DOCE-PAGINATION-8.1 - Room for headers and footers

`pageHeight` shall be a section's page height inside its margins. Each page of a section shall leave room for its header and footer as the layout engine lays them out (DOCE-PAGINATION-11.10), with their margins, so content never runs into them; an empty region shall take none.

Implementation: `src/pagination/layout-document.ts`
Verification: `e2e/page-regions.spec.ts`

### DOCE-PAGINATION-8.2 - Page variables

`createPageVariables()` shall show the value of each variable in a page header or footer inside it: `page.current` the page's number, `page.total` the document's page count, and any other key the text the document stores for it (DOCE-FORMAT-1.7), or nothing. It asks nothing of the host or the clock, so every view, viewer and print of a document shows the same texts; a stored text an edit changes shows at once. `refreshPageVariables(view)` shall show the values again, outside the undo history.

Implementation: `src/pagination/page-variables.ts`
Verification: `src/pagination/page-variables.test.ts`, `e2e/page-regions.spec.ts`

### DOCE-PAGINATION-8.3 - Variables in the text

The plugin shall show the variables in the document's text too, `page.current` by the page they are on, counted through the document, and `page.total` the document's page count; and `date.current`, like any other key, the text the document stores, the date it was last refreshed on (DOCE-PAGINATION-8.8), wherever it is.

Implementation: `src/pagination/page-variables.ts`
Verification: `src/pagination/page-variables.test.ts`

### DOCE-PAGINATION-8.4 - Variables in the editor

`DocumentEditor` shall show page variables in both layouts, and in the view it measures in, with the texts the document stores. For a writer who edits directly, it shall store the texts of the host's `variables` adapter (DOCE-HOST-1.12) as edits out of the undo history (DOCE-PAGINATION-8.8): when a document opens, those of the keys it stores none for, so a document already stored opens unchanged, and whenever the adapter says a value changed, every key's; a reader's editor and one suggesting change nothing. The Tools menu shall offer storing every text again (`updateVariables`, DOCE-EDITOR-4.17). Page numbers shall be read from the layout's pages (`createPageMap`).

Implementation: `src/components/document-editor/document-values.ts`, `src/components/document-editor/tools-entries.ts`, `src/pagination/page-variables.ts`
Verification: `src/components/document-editor/document-editor.test.tsx`, `src/components/document-editor/tools-entries.test.ts`

### DOCE-PAGINATION-8.5 - Repeated headers and footers

On the pages of a projection, the header and footer of each page of a section after its first shall be hidden from assistive technology (`aria-hidden`), so a screen reader reads each section's header and footer once; they still show and print.

Implementation: `src/pagination/page-chrome.ts`, `src/pagination/projection.ts`
Verification: `src/pagination/projection-view.test.ts`, `e2e/a11y.spec.ts`

### DOCE-PAGINATION-8.6 - Spacing in headers and footers

The reference stylesheet shall give a page's header and footer no padding and their blocks no vertical margins, so a header of several paragraphs is as tall as its lines; the body's blocks keep the template's spacing.

Implementation: `labs/reference/document.css`
Verification: `e2e/page-regions.spec.ts`

### DOCE-PAGINATION-8.7 - Typing in every page's header and footer

Every page's copy of its section's header and footer shall take the writer's edits, as the copy the canonical document keeps does (the section's first page's header and its last page's footer): a place in any copy shall map to the same place in the kept copy, so typing, keys and commands there reach the canonical state, and every page then shows the edit. The caret shall stay in the copy the writer edits, through the edit and the layout after it.

Implementation: `src/pagination/page-positions.ts`, `src/pagination/selection-mirror.ts`, `src/pagination/projection-layout.ts`
Verification: `src/pagination/projection-view.test.ts`, `e2e/template-editor.spec.ts`

### DOCE-PAGINATION-8.8 - Stored variable texts

A variable other than `page.current` and `page.total` shall show the text its document stores (DOCE-FORMAT-1.7), so its width, and the lines and pages it may move, are the same on every machine, at any time and for every collaborator; only a page's number and the page count come from the layout. `documentValueKeys(doc, template)` shall give the keys the document shows a stored text for: those of the variables in its text and page regions, of its template blocks (DOCE-TEMPLATES-9.3) and of the template's regions. `refreshDocumentValues(source, refresh)` shall store each key's text as one change, `false` when they already are: the host's `value`, and for `date.current` the date (`now`) written long in `locale`, else the document's language (DOCE-PAGINATION-9.16); `all` writes every key again and keeps no other, `missing` writes only the keys the document stores none for and keeps the rest. `createDocumentValues(source)` shall store, in the same change, the text of each variable a writer's change adds that the document stores none for, whether inserted from the menu, typed, pasted or brought back by undo, so it shows its value at once; a change out of the history, as another writer's or a refresh, is left as it came. The texts are one attribute of the top node, which a room keeps one shared attribute per key (DOCE-COLLAB-6.9), so of two writers who each add a variable at once both texts are kept; where a key is left with no text, as after an undo of a text another writer set at the same time, a writer's editor shall run the `missing` refresh again whenever the texts its document stores change, which stores the text the record lacks and changes nothing once every key the document shows has one. It only adds texts the record lacks and never rewrites one it holds, so it answers neither its own refill nor another editor's, and writers who each lost a text settle within one refill each.

Implementation: `src/engine/document-values.ts`, `src/model/document-values.ts`, `src/components/document-editor/document-values.ts`
Verification: `src/engine/document-values.test.ts`, `src/components/document-editor/document-editor.test.tsx`, `src/collab/document-values-room.test.ts`

## DOCE-PAGINATION-9 - Text layout engine

The text layout engine (`src/layout-engine/`) lays a text block's lines out from its template typography with Pretext, without the DOM. Its line table is the one result calculation, editing, the viewer and print share: the renderer draws exactly its lines. It measures in Chromium's profile. The editor's pages are laid out with it (DOCE-PAGINATION-11); a block it refuses is measured as DOCE-PAGINATION-5 says.

### DOCE-PAGINATION-9.1 - The line table

`createTextLayout(options).layoutText(node, place)` shall lay a paragraph, a heading, a code block, a footnote entry or a caption out at the place's width and return its line table (`LineTable`): at least one line, an empty block's line as tall as its leading; each line's start and end as content offsets, which tile the content (a line ends where the next starts, the last at the content size); its width without the spaces that hang past its end (a block's last line too, as Chromium hangs them there in pre-wrap, whichever elements hold them, unless a caption label or an inserted word ends the block, after which the editor draws a trailing break; a line ending at a hard break keeps them, as they hang there only where they do not fit), where it starts from the left content edge, its top and its height; and whether it wraps, ends at a hard break or ends the block. The table's height is its lines' together, and its `overhead` the block's padding above and below. Lengths are CSS pixels at a zoom of 1. The engine shall count the text runs it found prepared and those it prepared (`stats()`). It shall keep a block's prepared runs for as long as the block's node lives, however many blocks the document has, so laying the whole document out again, as when atoms settle, prepares nothing that did not change; and it shall tell Pretext the document's language only when it differs from the last one told, since telling it forgets every width Pretext measured.

Implementation: `src/layout-engine/line-table.ts`, `src/layout-engine/text-layout.ts`, `src/layout-engine/lines.ts`
Verification: `src/layout-engine/text-layout.test.ts`, `src/layout-engine/text-boxes.test.ts`

### DOCE-PAGINATION-9.2 - Typography from the template

A text block's typography (`typography(node, scope)`) shall be its template scope's (a section's styles over the template's, merged once per template and scope, as a template is never changed in place: `scope-styles.ts`): a paragraph the paragraph style, a heading its level's, the document's title the title style, a code block the code style; a custom style (`className`) over a paragraph shall set what it sets, its weight and slant else normal, and over a heading only its size and slant. Unset values shall take the reference stylesheet's fallbacks: a serif 12px paragraph at a line height of 1.5, headings from 2em down to 0.9em at 1.2, a 24px title, monospace code at 1.4 with 8px of padding. The engine shall read the lengths the template format takes and the stylesheet is given (DOCE-FORMAT-2.1: a percentage a font size's alone), and fall back as the stylesheet does for any other form. Relative lengths shall resolve against the paragraph's size, and the paragraph's own relative size once against the default 12px (`rem` against 16px), as the page content takes the paragraph's size (DOCE-TEMPLATES-5.2), lengths snap to the nearest 1/64 px, and a leading, the size times the line height, and a margin are truncated to 1/64 px, as Chromium keeps its line box and a block's margins. A family the host serves (`fontStacks`) shall be measured in the stack it names.

Implementation: `src/layout-engine/typography.ts`, `src/layout-engine/scope-styles.ts`
Verification: `src/layout-engine/typography.test.ts`, `src/layout-engine/text-layout-work.test.ts`

### DOCE-PAGINATION-9.3 - Marks

Text shall be measured in its marks' fonts, applied outermost first in the schema's mark order: strong text a bolder weight (CSS `bolder`), emphasis italic, inline code the code style's family and size (the size around it when the style sets none; a relative size of its block's font, as the stylesheet's `em` is of the element around it) with 3px of padding on each side of each line it reaches, a line that ends inside it fitting without its end padding as Chromium fits a cloned box, once per `code` element the page draws: adjacent nodes whose marks agree up to the code mark in that order, an inline atom, a template variable and hidden content among them included, share one element, and an inserted word ends it (`code-boxes.ts`), and subscript and superscript at the size around them divided by 1.2. Each text node shall be measured as its own item, as Chromium rounds each element's piece of a line to its layout unit, kerning still counting across neighbours in the same font; a line ending in a link or underlined text shall fit its last letter's full width, as Chromium places a decorated line's end exactly. Marks that change only decoration change nothing. The renderer draws sub- and superscripts, footnote markers included, without growing the line (`line-height: 0` in the reference stylesheet, in both layout modes) and inline code with its padding on every line (`box-decoration-break: clone`).

Implementation: `src/layout-engine/typography.ts`, `src/layout-engine/runs.ts`, `src/layout-engine/code-boxes.ts`, `labs/reference/document.css`
Verification: `src/layout-engine/typography.test.ts`, `src/layout-engine/text-layout.test.ts`, `src/layout-engine/text-runs.test.ts`, `e2e/inline-geometry.spec.ts`

### DOCE-PAGINATION-9.4 - White space and hard breaks

Text shall be laid out as `white-space: pre-wrap` with `overflow-wrap: break-word`, as the pages draw it: runs of spaces and tabs kept, spaces hanging at a line's end, and a word longer than a line broken. Each hard break shall end a line, and a block that ends with one shall have an empty last line after it. Each identifier of a citation (DOCE-REFERENCES-1.13) shall be one unbreakable piece, laid out whole on one line, as the stylesheet keeps it.

Implementation: `src/layout-engine/runs.ts`, `src/layout-engine/lines.ts`, `src/model/citation-identifiers.ts`
Verification: `src/layout-engine/text-layout.test.ts`, `e2e/inline-geometry.spec.ts`

### DOCE-PAGINATION-9.5 - Prefixes and inline atoms

A place's `prefix`, such as a heading's number with its space, shall be laid out in the block's font before the content on its first line, taking no content offset. A template variable's value is drawn inside it by the page variables (DOCE-PAGINATION-8.2). Where the place gives the text each variable shows, by its key (`variables`), as for a header or footer drawn once with known values, the variable shall be laid out as that text in its font with its marks, never broken inside, and as nothing when it shows none; as text with those marks, it grows its line in another font, takes inline code's padding and fits its line end in a link. Elsewhere it shall be laid out as the `bodyVariables` option says (DOCE-PAGINATION-11.13); without that option, or in a header, footer or footnote area without `variables`, it shall be laid out as the text it holds, which the page draws where no page variables fill it, so no block is refused for a variable. A footnote marker, a mention, a glossary reference and an inline embed (`TEXT_ATOMS`), unless the `textAtoms` option leaves the type out, as for one a host draws itself, shall be laid out as the text the page draws in it, in its font with its marks, growing its line as text in that font does but for a footnote marker, whose `sup` does not, never broken inside: the marker's number from the `textAtoms.footnoteOf` option at `font-size: smaller` (nothing for a marker without one), the mention's `@` and name, the glossary reference's display text with its last letter's full width at a line end, as an underlined link's, and the inline embed's stored text (`text`, refreshed by its update as any edit is) likewise, nothing for one with none; a type in `textAtoms.refused` shall not be laid out, with its reason. Any other inline node shall take the box its `measureAtom` option gives it, which is told the text block holding it and the block's section, drawn on one line, and sit on the baseline at its own baseline, or at its bottom when it gives none; an atom aligned to the line's top or bottom (`align`) shall make its line at least as tall as itself and no taller. A line shall be as tall as the block's strut, grown by the atoms and the text in another font that reach above or below it. A font's box is its ascent and descent, rounded to whole device pixels at the `scale` option's device pixel ratio as Chromium rounds them (a pixel moves from the ascent to a descent that rounding shortened where Chromium positions glyphs at subpixels: unhinted text, as the pages draw theirs, at every ratio, and hinted text, as the `hinted` option says a lab draws, at ratios other than 1), with half the rest of its leading above, truncated to whole device pixels, and the rest below; the block's strut takes the block's leading, and text in another font the leading of its own size at the block's line height, which it inherits. Subscript and superscript do not grow the line. Without a size the block shall not be laid out, and the reason is given.

Implementation: `src/layout-engine/runs.ts`, `src/layout-engine/text-atoms.ts`, `src/layout-engine/lines.ts`, `src/layout-engine/metrics.ts`, `src/layout-engine/text-layout.ts`
Verification: `src/layout-engine/text-layout.test.ts`, `src/layout-engine/text-runs.test.ts`, `e2e/inline-geometry.spec.ts`

### DOCE-PAGINATION-9.6 - Alignment and padding

A line shall start at the block's left padding plus, when the block is centred, half the room its line leaves, and when right-aligned, all of it; a justified line starts at the edge. A code block's lines shall be laid out inside its 8px padding and, with the `codeLineNumbers` option (the template's `styles.codeBlock.lineNumbers`, DOCE-OBJECTS-3.1), beside its gutter of line numbers, as the reference stylesheet draws it: as many widths of the code font's zero as its highest line number (from its `codeLineStart`) has digits, at least three, and 14px more, truncated to the layout unit, in from the left of each line, in a table cell too. The pages' engine takes the option from the state's object views, on when they number all code (`lineNumbers: 'all'`, the default), and is made again when that changes.

Implementation: `src/layout-engine/lines.ts`, `src/layout-engine/text-layout.ts`, `src/layout-engine/code-gutter.ts`, `src/engine/object-views.ts`, `src/pagination/text-engine-holder.ts`
Verification: `src/layout-engine/text-layout.test.ts`, `e2e/inline-geometry.spec.ts`

### DOCE-PAGINATION-9.7 - Served fonts and language

Given `isFontServed`, a block whose font's first family, or whose inline code's, is not served shall not be laid out, with the reason, so no system font decides a line. Lines shall break, and text be shaped, by the rules of the document's `language`. The pages' engine shall take the language the document is laid out in (DOCE-PAGINATION-9.16), never the `lang` of the page around it, and shall be made again when that language changes. The pages' engine shall select that language before measuring any text, including standalone widths for generated content and layout rules. It shall tell Pretext only when the selected language changes, since setting it drops Pretext's caches.

Implementation: `src/layout-engine/text-layout.ts`, `src/layout-engine/lines.ts`, `src/pagination/text-engine-holder.ts`, `src/pagination/text-engine.ts`
Verification: `src/layout-engine/text-layout.test.ts`, `src/pagination/text-engine.test.ts`, `src/pagination/text-engine-profile.test.ts`, `e2e/font-widths.spec.ts`

### DOCE-PAGINATION-9.8 - Splitting at computed lines

A line table as a text measurement (`lineTableMeasurement(table, offset)`) shall give a range's height and lines from the lines it touches, and carry the lines, so a paragraph splits at the start of its first line that does not fit, keeping at least two lines in each fragment and the trailing lines it is asked for. A nonempty range includes lines whose start is before its end and whose end is after its start. At a single offset, each line covers at least one content offset, starting at its anchor, so empty lines count too. Height runs from the top of the first touched line to the bottom of the last. Range measurements find both bounds by offset in an ordered line table. Paragraph splits reuse exact cumulative layout-unit heights across fragments and check the fit of only the lines on the current page.

Implementation: `src/layout-engine/text-layout.ts`, `src/layout-engine/line-measurement.ts`, `src/model/pagination/text-split.ts`, `src/model/pagination/text-line-split.ts`, `src/utils/count-prefix.ts`
Verification: `src/layout-engine/text-layout.test.ts`, `src/model/pagination/text-split.test.ts`

### DOCE-PAGINATION-9.9 - Heading and paragraph numbers

`documentNumbers(doc, template)` shall give, by block position, each numbered heading's number with the space after it, as its scope's heading numbering shows it (`numberedHeadings`), and each numbered paragraph's number, level and level positions, counted as the paragraph numbering counts them (DOCE-NUMBERING-6). A heading's number shall be laid out as its place's `prefix`. A paragraph given its `number` shall start its first line at the number position, with the number in a box as wide as the gap to the text position or as the number and a space, whichever is wider, and its other lines at the text position: the level's, or after the indentation (20pt a level below the first, else the paragraph style's), the number position and the room the label reserves in widths of the font's zero. The engine shall keep the widths of the texts it measures for numbers and gutters, so blocks that show the same number or gutter measure them once.

Implementation: `src/layout-engine/numbers.ts`, `src/engine/paragraph-numbering.ts`, `src/layout-engine/text-layout.ts`, `src/layout-engine/lines.ts`, `src/layout-engine/metrics.ts`
Verification: `src/layout-engine/numbers.test.ts`, `src/layout-engine/text-layout-work.test.ts`

### DOCE-PAGINATION-9.10 - Footnote entries

A footnote entry's typography shall be its scope's footnote text style (`resolveFootnoteSettings`), with no margins of its own (the footnote area sets entries apart): unset, the paragraph's family at 10px, a weight of 400 and a line height of 1.4. A place's `footnoteNumber` shall be laid out before the content on the first line, in the marker style (unset: the entry's family at 0.85 of its size, a weight of 600, upright), followed by the numbering suffix and a quarter of the marker size; a marker family that is not served refuses the block. The renderer draws the number and the entry text in these fonts, so an entry's inherited family is the paragraph's, not the page's.

Implementation: `src/layout-engine/typography.ts`, `src/layout-engine/footnote-marker.ts`, `src/layout-engine/text-layout.ts`, `src/layout-engine/runs.ts`
Verification: `src/layout-engine/footnote-marker.test.ts`

### DOCE-PAGINATION-9.11 - Captions

A figure, table or code caption's typography shall be its object's caption text font in its scope (`figure`, `table` or `codeBlock` caption settings), unset values the paragraph's, its slant and weight included, at the paragraph's line height and with no margins of its own (its place in the object is the block layout's); a table caption shall be aligned as its caption settings say, others left. A place's `label`, the caption's label, number and separator, shall be laid out before the text on the first line, in the caption label font, unset values the caption text's (`captionLabelFont`); a label family that is not served refuses the block. The renderer draws a caption's label and text in these fonts and at this line height, not in the page's inherited font. The engine shall lay figure, table and code captions out; a code caption at its code figure's content width, at the left of the box whatever its alignment, as the stylesheet draws it inside the code's padding. A later part's caption, which holds no text and shows the first part's (`continuedText`), shall be laid out over that text followed by its kind's continued suffix in its scope (`continuedCaption`, a table's or code's, with its space, as the stylesheet draws it), its line table carrying that text (`text`), which its offsets are in. Where a line breaks inside the label or right after it, as in a narrow cell, the line table shall carry the label's part on each line it starts (`label`), each ending in a line feed but a last one that shares its line with the content; the content starts at its first shown character, after any content hidden as a suggestion (DOCE-PAGINATION-11.12).

Implementation: `src/layout-engine/typography.ts`, `src/layout-engine/text-layout.ts`, `src/layout-engine/continued-caption.ts`, `src/layout-engine/lines.ts`
Verification: `src/layout-engine/caption-typography.test.ts`, `src/layout-engine/text-layout.test.ts`, `src/layout-engine/text-boxes.test.ts`, `e2e/code-split-captions.spec.ts`

### DOCE-PAGINATION-9.12 - Paragraph direction

A text block's direction shall come from its text alone, as Unicode's paragraph rule (UAX #9, P2 and P3) and `dir="auto"` decide it: its first strongly directional character, in its text and the text its mentions and glossary references show, by its Bidi_Class in the Unicode version of Chromium's ICU (17.0, generated into `src/layout-engine/bidi-classes.ts` by `scripts/bidi-classes.mjs`, with the defaults of unassigned code points): R or AL makes it right to left, L left to right, and every other class, numbers and neutrals and marks, is passed over; isolate controls are read through, as Chromium's `dir="auto"` reads them; a block without one is left to right. Every code point shall get the class Chromium's `dir="auto"` gives it. Nothing is stored. Lines break in the text's order whatever the direction, so the engine's lines are the same in both, and each line's start is measured from the block's start edge: the template's left and right alignments are its start and end. The pages shall draw each forced block with `dir` set to its direction, and a split block's later parts with the first part's (the part of the same element id that is not continued), top-level or inside a container such as a list item or a quote, in the editor, the viewer and print, so the browser never decides it from other text, such as an equation's letters; the stylesheet aligns a forced block to its start and lets its end overhang (DOCE-PAGINATION-11.2). Words drawn in a block that are not its content, such as a comparison's deleted words (DOCE-PAGINATION-11.11), do not decide its direction and are drawn in it. Blocks the pages do not draw on forced lines, such as captions, which the engine lays out with the same lines in either direction, and the DOM text layout, keep the browser's own direction.

Implementation: `src/layout-engine/direction.ts`, `src/layout-engine/bidi-classes.ts`, `scripts/bidi-classes.mjs`, `src/pagination/block-directions.ts`, `src/pagination/forced-lines.ts`, `src/pagination/pages-layout.ts`, `src/document/print-pages.ts`, `labs/reference/document.css`
Verification: `src/layout-engine/direction.test.ts`, `src/pagination/forced-lines.test.ts`, `src/document/print-pages.test.ts`, `e2e/paragraph-direction.spec.ts`, `e2e/text-layout.spec.ts`, `e2e/font-widths.spec.ts`

### DOCE-PAGINATION-9.13 - List of contents rows

`layoutContentsRow(row, place)` shall lay a list of contents row out as the stylesheet's flex row draws it, in its kind's level font over the entries' in its scope (`resolveContentsList`), unset values the paragraph's family and size, a weight of 400 and upright, at a line height of 1.5. The place gives the row's width and, from the block geometry's metrics, the level's indentation, the gap after the number and the gaps around the leader. The number's box shall start at the indentation, as wide as the number's text up to the next layout unit, then the list's separator in a box of its own in place of the gap when the row has one, and the text after them on every line (at the indentation for a row without a number), wrapping in the room the number leaves and, with a page, a leader of at least the font's `0` down to its layout unit, its gaps and the page number's width. The leader and the page shall be on the text's last line: the page against the row's end, and the leader from the text's box (the room when the text wraps, its own width when not) and its gap to the gap before the page. A row without a page has neither; when the level draws no leader (`leaderGaps` null), the page follows the text's box with no gaps and the text's room leaves only the page. A group heading row (`heading`) is bold. `contentsTextWidth(text, level)` shall give a text's width in a level's font as the row sizes the page. A level family that is not served refuses the row.

Implementation: `src/layout-engine/contents-layout.ts`, `src/layout-engine/contents-row.ts`, `src/layout-engine/contents-typography.ts`, `src/layout-engine/text-layout.ts`
Verification: `src/layout-engine/contents-row.test.ts`

### DOCE-PAGINATION-9.14 - List of contents title and empty message

`layoutContentsText(text, { width, kind, scope, role })` shall lay a list of contents' title (`role: 'title'`) or the message it shows when it has no entries (`role: 'empty'`) out on lines at the width of the list's content box, wrapping as a paragraph does and left-aligned, at the paragraph's line height as the page content sets it, a ratio of the text's own size. The title shall take its kind's title font in its scope (`resolveContentsList(...).titleFont`), unset values the paragraph's family, 16px, a weight of 700 and upright; the empty message the paragraph's family, size and weight, italic. The space under the title is the block geometry's. A family that is not served refuses the text.

Implementation: `src/layout-engine/contents-layout.ts`, `src/layout-engine/contents-row.ts`, `src/layout-engine/contents-typography.ts`, `src/layout-engine/text-layout.ts`
Verification: `src/layout-engine/contents-row.test.ts`

### DOCE-PAGINATION-9.15 - Segmentation in one language

Grapheme clusters shall be found in one fixed language, `en` (`SEGMENTATION_LOCALE`), never the runtime's default, wherever the editor counts, measures or reserves them: caret steps and deletions (`clusterStart`, `clusterEnd`), reserved boxes, math cluster counts and the font-file measurer. `segmentationFingerprint()` shall hash the boundaries of a fixed corpus (`SEGMENTATION_CORPUS`: accents, emoji sequences, Indic conjuncts, Hangul and kana, Thai, Lao, Khmer and Burmese words, both directions, invisible characters) in the runtime, so two runtimes whose segmentation data differs give different fingerprints. The corpus's grapheme and word boundaries in Node shall equal `test/fixtures/segmentation/boundaries.json`, and in Chromium the same but for the differences the file lists: Chromium's Khmer dictionary splits a word that Node's keeps whole, so Khmer lines can break differently between the two.

Implementation: `src/utils/segmentation.ts`, `src/layout-engine/graphemes.ts`, `src/layout-engine/reserved-boxes.ts`, `src/utils/math-text.ts`, `src/layout-engine/font-files/measure-context.ts`
Verification: `src/utils/segmentation.test.ts`, `e2e/segmentation.spec.ts`

### DOCE-PAGINATION-9.16 - The document's language

A document shall be laid out in its own language (`language`, DOCE-FORMAT-1.7), else its template's (`language`, document-level, `en` in the base template), else `en` (`documentLanguage`): a canonical language tag, never empty and never the language of the host's page, since an empty language makes Pretext and Chromium fall back to the browser's default. The editor's engine, its snapshot's `lang` (DOCE-EDITOR-6.19), the layout's `language` and the layout inputs key (DOCE-PAGINATION-13.12) shall all take it. The template editor shall offer the template's language as a document-level setting, refusing what is not a language tag.

Implementation: `src/model/document-values.ts`, `src/pagination/text-engine-holder.ts`, `src/components/document-editor/start-paging.ts`, `src/engine/snapshot.ts`, `src/components/template-editor/settings-catalog.ts`
Verification: `src/model/document-values.test.ts`, `src/pagination/text-engine.test.ts`, `src/engine/snapshot.test.ts`

## DOCE-PAGINATION-10 - Block geometry and measured atoms

On the pages, block geometry lays blocks out with no DOM, from the text layout engine's lines (DOCE-PAGINATION-9), the atom cache and the template's numbers, in the shapes the page layout reads (DOCE-PAGINATION-5.1), so the page packer and the splitters read them unchanged. The rendered document follows these numbers: the template's, and the stylesheet's own, which it states for the engine to read (DOCE-PAGINATION-10.8).

### DOCE-PAGINATION-10.1 - The atom cache

`createAtomCache({ measure })` shall size the atoms the engine sizes by a measurer of its own, equations from their math layout (DOCE-PAGINATION-12.10), once, and keep the size by the atom's content: its type, the attributes that show (element ids, authors and split parts left out), its marks, its content (but not a figure's caption, which the engine lays out as text, so typing in a caption keeps the image's size), the width it is laid out in, to Chromium's layout unit, its section and, for an inline atom, the type and shown attributes of the text block holding it, whose font it takes. `measureAtom(node, { parent, scope })` shall give an inline atom's size, baseline and line alignment, for the text layout engine; `measureBlockAtom(node, width, scope)` a block atom's. An atom the measurer cannot size shall have no size, and the cache shall keep the most recently used atoms up to its limit. A size never changes once given, and nothing is read from the DOM.

Implementation: `src/layout-engine/atoms.ts`
Verification: `src/layout-engine/atoms.test.ts`

### DOCE-PAGINATION-10.2 - Measuring atoms in the DOM, and sizes that may change

Withdrawn. No atom is measured in the DOM and no size is provisional: math is sized from its layout once typeset (DOCE-PAGINATION-10.8, DOCE-PAGINATION-12.10), images from their stored size (DOCE-PAGINATION-14.5), a host's inline nodes by their rules (DOCE-PAGINATION-14.1), and an inline atom nothing sizes takes no room (DOCE-PAGINATION-14.6).

Implementation: `src/layout-engine/atoms.ts`
Verification: `src/layout-engine/atoms.test.ts`

### DOCE-PAGINATION-10.3 - Text blocks and containers

`createBlockLayout({ text, atoms, metrics, labelOf })` shall give each block its height, margins and the measurement its split reads (`layoutBlock(node, { width, scope, region })`), or name the node it cannot lay out yet and why, the same each time. A text block shall take its lines and margins from the text layout, a caption its label (`labelOf`) before its text; a paragraph in a list item or a table cell, and any block in a header or footer, no margins. Children shall stack with adjoining margins collapsed to the larger, also through a block of no height between them, which sits where its top margin alone puts it, a container without padding or border at an edge letting its first or last child's margin through as its own, an empty first or last child's margins with it, as the stylesheet's block flow does. A block with no width left, as a list nested deep in a narrow cell, shall be laid out in a content box of no width, its text a grapheme a line, as the stylesheet draws it, not refused. A list shall indent its items by the template's indentation with the template's spacing, the last block of its last item without a bottom margin, and a checklist item keep its blocks' margins inside it, its last block's bottom margin too when it is the last item; a quote shall stand in on each side by the stylesheet's quote indent, with its quote spacing as margins (DOCE-PAGINATION-10.8); an embed's content and a script block's output shall stack as they stand, an empty script block keeping a line and a half of the document's text size and no margins, with its message laid over it; a layout section shall set its columns side by side at their preset's tracks less the stylesheet's column gaps, a preset's tracks standing when fewer columns fill them, as the stylesheet's grid template keeps them, each column padded inside a border of the stylesheet's sizes, its edge blocks without their outer margins, and as tall as the tallest. Containers shall carry where each child sits and their `overhead` (`ContainerMeasurement`).

Implementation: `src/layout-engine/blocks/block-layout.ts`, `src/layout-engine/blocks/context.ts`, `src/layout-engine/blocks/stack.ts`, `src/layout-engine/blocks/text-blocks.ts`, `src/layout-engine/blocks/containers.ts`, `src/layout-engine/blocks/metrics.ts`, `src/layout-engine/blocks/types.ts`
Verification: `src/layout-engine/blocks/containers.test.ts`, `src/layout-engine/blocks/block-layout.test.ts`

### DOCE-PAGINATION-10.4 - Figures, code, equations and rules

A figure shall take the image box its stored size fixes, which every figure has (DOCE-SCHEMA-3.14): at its size, narrowed to the width when wider, or across the width when set to the page's width, each scaled whole, its height in its proportions, as the stylesheet draws it (`fixedImageBox`); and its caption across the content width unless switched off, with the paragraph's bottom spacing. Code with its caption shall be one box padded as the code is, holding the caption above or below the code with the stylesheet's caption gap either side of its caption rule, measured by its code's lines. Linked code shall be laid out as code with its caption, the caption derived from its address and the code its stored lines, and labelled as code. A display equation shall be laid out from its math layout (DOCE-PAGINATION-12.10) with the stylesheet's equation spacing as margins, and one with no math layout is not laid out; a horizontal rule as tall as the stylesheet's rule height, with its rule spacing as margins; a page break no height; a kept block, which nothing sizes, no room (DOCE-PAGINATION-14.6).

Implementation: `src/layout-engine/blocks/objects.ts`
Verification: `src/layout-engine/blocks/objects.test.ts`

### DOCE-PAGINATION-10.5 - Tables

A table's columns shall keep their stored widths, columns without one sharing what is left equally, with one outer border added to the sum; a table without a width for every column shall span its place, a column without one never taking less than an equal share of it, the stored columns being scaled into the rest; an aligned table's columns without a width shall take 100px, and one set to the page's width shall be scaled to it; a table too wide shall be scaled to fit. The rendered table uses the same column proportions in the editor, viewer and print (`proportionColumns`, `table-layout: fixed` and available column room in the reference stylesheet). Tables in the page body, header and footer share the same sizing and collapsed borders. A fully specified table that fits shall keep its column widths. When it needs to shrink, its rendered columns shall scale to its local width less the outer border and the caption shall span the fitted table. Rendering keeps the stored widths, which a column resize may change starting from the widths it sees (DOCE-TABLES-2.4, DOCE-TABLES-3.7). This is an accepted difference from the DOM's measuring, whose automatic layout sizes columns by their content: tables with long or uneven columns take more rows, so their documents take more pages (in the regression lab: long-mixed 25 to 30, table-both-header-modes 10 to 12, table-long-headerless 10 to 11, table-long-single-header 11 to 14, table-long-repeated-header 13 to 15). Each cell shall be laid out in its columns' width less its padding and the halves of its side borders (none in a header or footer), each row shall be as tall as its tallest single-row cell or a cell's row height, a cell spanning rows adding what it lacks to the rows it spans in proportion to their heights, as Chromium spreads it, or to the last when they have none, with half a border above the first row and below the last; the border class shall set which lines are drawn. A table's caption shall stand above or below it within the table's width, padded by the stylesheet's caption padding, unless switched off. The table shall be measured by its rows, for the table split. A cell aligned centre, right or justified (`textAlign`, "Align cells") shall lay out every paragraph and heading in it, in its lists and quotes too, at that alignment in place of their own, so the editor, the viewer and print draw its text there; a cell at the default, left, which cannot be told from no alignment set, shall leave each block its own alignment and clear one a cell further out gives; code and captions keep their own.

Implementation: `src/layout-engine/blocks/tables.ts`, `src/layout-engine/blocks/table-columns.ts`, `src/layout-engine/blocks/text-blocks.ts`, `src/model/schema/table-nodes.ts`, `labs/reference/document.css`
Verification: `src/layout-engine/blocks/tables.test.ts`, `e2e/table-widths.spec.ts`, `e2e/tables.spec.ts`, `e2e/table-selection.spec.ts`

### DOCE-PAGINATION-10.6 - Headers, footers and footnote areas

`layoutRegion(node, place)` shall give a page header or footer its blocks stacked without margins, at least the template's height for it, and the template's spacing between it and the content; and a footnote area its entries under the separator (none when switched off) and the template's spacing to content, the entries the template's entry spacing apart. An empty region shall take no height.

Implementation: `src/layout-engine/blocks/regions.ts`
Verification: `src/layout-engine/blocks/regions.test.ts`

### DOCE-PAGINATION-10.7 - Numbers counted by the engine

A page out of view is not drawn, so a CSS counter there counts nothing. `captionNumbers(doc, template)` shall give, by node, each shown caption's label with the `-` after it (numbered by kind as the lists of contents number it, each section by its scope, restarting where a section restarts numbering; a caption switched off gets none and counts out; a later part's caption, which a split makes again with no element id, the label of the caption it repeats, `repeatedCaptionOf`), and the labels in order as one key. The pages' node numbers (`numbersByNode`) shall give each footnote marker's and entry's number, by its footnote's id, in the order the markers first cite them. The atom cache shall keep an atom by the text a view draws in it (`shownOf`); footnote markers are laid out as text with their numbers (DOCE-PAGINATION-9.3); block geometry shall lay each footnote entry out with its number (`footnoteOf`), which the text layout engine draws before it (DOCE-PAGINATION-9.10); an engine made again (another template, served faces that arrived, a remeasure) shall be numbered at once with the document the engine before it was last numbered with, so a region drawn before the next layout draws its footnotes with their numbers; and a layout that numbers the footnotes otherwise (`numbersVersion`), as an edit that cites a footnote before the others renumbers them, shall draw the forced lines and regions again, though it leaves the pages as they were. Heading and paragraph numbers come from the text layout engine (DOCE-PAGINATION-9).

Implementation: `src/layout-engine/blocks/numbers.ts`, `src/pagination/node-numbers.ts`, `src/pagination/text-engine-holder.ts`, `src/pagination/forced-lines.ts`, `src/layout-engine/atoms.ts`, `src/layout-engine/blocks/text-blocks.ts`
Verification: `src/layout-engine/blocks/numbers.test.ts`, `src/pagination/node-numbers.test.ts`, `src/pagination/text-engine.test.ts`, `src/pagination/forced-regions.test.ts`, `src/layout-engine/atoms.test.ts`, `src/layout-engine/blocks/regions.test.ts`

### DOCE-PAGINATION-10.8 - Math typeset before it is laid out

Math is typeset ahead of the layout that sizes it: the math views (`createMathViews`, or the editing's `math` option) typeset each source once (`createMathTypesetter`), and every view they run in draws what it typeset. The pages shall not lay a document out until its math is typeset (`mathTypesetReady`) and the math layouter has loaded what laying it out needs (`PagesTextEngine.mathPending`, the layouter's `prepare`), staying pending meanwhile, so an equation is laid out once, from its layout (DOCE-PAGINATION-12.10), and not again when a view draws it; what the math of the document readied last typeset as is kept however many sources it holds, so the wait ends for any document. The wait always ends: math whose renderer has not answered within `timeout` (30 seconds by default, `DEFAULT_MATH_TIMEOUT`) is typeset as invalid, with `timeoutMessage` and the deadline as its reason, and stays so; an answer that comes later is not drawn, as the pages were laid out with the invalid math. Nothing a view draws, math or otherwise, is measured.

Implementation: `src/engine/math-views.ts`, `src/engine/math-typesetter.ts`, `src/pagination/math-wait.ts`, `src/pagination/text-engine-atoms.ts`, `src/pagination/projection-session.ts`
Verification: `src/engine/math-views.test.ts`, `src/engine/math-typesetter.test.ts`, `src/pagination/projection-view.test.ts`, `src/pagination/text-engine-inputs.test.ts`, `e2e/equations-layout.spec.ts`

### DOCE-PAGINATION-10.9 - The template's block numbers

The numbers no other template setting gives shall be the template's, in its scope's `styles.blocks` (a section's over the template's): `quoteIndent` and `quoteSpacing` (a quote's inline and block margins), `ruleHeight` and `ruleSpacing`, `codePadding`, `codeCaptionGap` and `codeCaptionRule`, `tableCaptionPadding`, `equationSpacing`, and a layout section's `columnsGap`, `columnsAfter`, `columnPadding` and `columnBorder`. Each is a length in an absolute unit (px, pt, pc, in, cm, mm, Q) or in `em`, the scope's paragraph size; one left out, or stated as anything else (a percentage, `rem`), takes its default: 40px, 1em, 2px, 0.5em, 8px, 4px, 1px, 2px, 6px, 4px, 4px, 5px and 1px. The engine shall lay blocks out with them (`blockMetrics(template, scope)`, `templateBlockNumbers`), and read nothing from the page or its stylesheet. The template's properties (`templateProperties`) shall state the same numbers to the stylesheet as `--de-quote-indent`, `--de-quote-spacing`, `--de-rule-height`, `--de-rule-spacing`, `--de-code-padding`, `--de-code-caption-gap`, `--de-code-caption-rule`, `--de-table-caption-padding`, `--de-equation-spacing`, `--de-columns-gap`, `--de-columns-after`, `--de-column-padding` and `--de-column-border`, always, and as the engine read them (a default for one it could not), so the stylesheet draws blocks with the numbers they were laid out with. The reference stylesheet states the defaults for pages drawn without the template's properties. The other template lengths block geometry reads, the paragraph spacing objects take, a list's indentation and spacing, a table's cell padding and border width, and the footnote area's separator, spacing and entry spacing, shall be read in the forms the template format takes and the stylesheet is given (`resolveLength`, DOCE-PAGINATION-9.2), as the stylesheet draws them: `em` at the page content's paragraph size, the footnote area's lengths at its text size, `rem` at the root's 16px; any other form takes the default.

Implementation: `src/model/templates/block-numbers.ts`, `src/model/templates/template-properties.ts`, `src/model/format/template-format-shape.ts`, `src/layout-engine/blocks/metrics.ts`, `labs/reference/document.css`
Verification: `src/model/templates/block-numbers.test.ts`, `src/layout-engine/blocks/metrics.test.ts`

### DOCE-PAGINATION-10.10 - Sizes the same on every screen

Nothing the pages are laid out with is read from the browser, so the planned pages are the same at every device pixel ratio: the engine fits lines at a layout scale of 1 and never reads the ratio (DOCE-PAGINATION-11.1). A change of ratio, as when the window moves to another screen, lays nothing out again.

Implementation: `src/layout-engine/text-layout.ts`
Verification: `e2e/layout-invariant.spec.ts` (DOCE-LABS-8.8, the planned heights at ratios 1.25 to 3)

### DOCE-PAGINATION-10.11 - Lists of contents and their page boxes

A list of contents block (`toc_block`) shall be laid out from what it shows (`contentsOf`, read from the contents plugin of the state the pages are laid out from, with the host's kinds and labels, or from the document's own catalog of the default kinds without one): its title, or under it what it shows when it lists nothing (DOCE-PAGINATION-9.14), 8px above the rows, then a row per entry (DOCE-PAGINATION-9.13) at its level's indentation (16px a level after the first by default), its spacing before and after collapsed between rows as the stylesheet's block flow does, a group's heading 6px below the row before it, the list's padding at its sides and its spacing above and below it (12px below by default). Each row's page box shall keep room for a fixed number of its level font's `0`, whatever its page reads, so no row's height depends on the page numbers the layout comes to: 3 digits (`PAGE_DIGITS`), or the digits of the document's page count when it has more pages. A layout of a document with a list shall start from 3 digits and pass again with one more as long as the pages it comes to need more, at most 3 times, saying why it stopped (`onUnsettled`) when they still do; the pages are then the same however the document was laid out before. The pages shall draw each row's page box at the width the engine kept for it (`--de-contents-page-width`, in px, from `contentsDrawn`), its number at its end, and break each row's text, and the list's title and what it shows when it lists nothing, only where the engine broke their lines (`data-engine-lines`, a line break between lines). A list's rows are laid out for the contents split by block geometry.

Implementation: `src/layout-engine/blocks/contents.ts`, `src/engine/contents-look.ts`, `src/engine/contents-view.ts`, `src/pagination/contents-lists.ts`, `src/pagination/contents-drawn.ts`, `src/pagination/forced-lines.ts`, `src/pagination/layout-document.ts`, `src/pagination/text-engine.ts`, `labs/reference/document.css`
Verification: `src/pagination/contents-pages.test.ts`, `src/pagination/text-engine-refusals.test.ts`

### DOCE-PAGINATION-10.12 - Object boxes for resizing

The engine shall give, for a top-level block of a section's page content, the box of each figure and table in it as it lays the block out in the section's content width (`objectBoxes(block, scope)`, an `ObjectBox` by node): a figure's image box with the content width of the place it is in, and a table's column widths, each row's height with its cells' padding and the halves of their borders, that edge, and the content width of its place. `objectBoxAt(state, pos)` finds the box of the figure or table at a position of the pages from the engine the forced lines hold, and `contentRoomAt(state, pos)` the content width of the section a position is in (`sectionContentWidth`); both give none where the pages are not laid out by the engine, as in the web layout. Every size a resize starts from or stores shall come from these boxes, never from the drawn element: leaving the fit to the page width (`laidOutFigureSize`, a figure's box in whole pixels no wider than it, the height in its proportions; a table's column widths), the resize and figure dialogs' starting size and their widest width, a column or row border's drag and the room the last column may take, and equal rows (DOCE-TABLES-3.10). A drag adds the pointer's movement divided by the view's zoom on screen (`pointerScale`). A row's stored height is its content's, the row's laid-out height less its cells' padding and borders, so a released row is laid out at the height it was shown at. The stored numbers are then the same whoever resizes, at whatever zoom or device pixel ratio. Where the browser lays the document out (the web layout), a figure takes its stored size and a table the widths and heights as drawn, divided by the zoom.

Implementation: `src/layout-engine/blocks/types.ts`, `src/layout-engine/blocks/objects.ts`, `src/layout-engine/blocks/tables.ts`, `src/pagination/text-engine.ts`, `src/pagination/content-width.ts`, `src/pagination/object-boxes.ts`, `src/engine/figure-measure.ts`, `src/engine/table-resize.ts`, `src/engine/table-row-resize.ts`, `src/engine/table-format.ts`, `src/components/document-editor/figure-size.ts`
Verification: `src/pagination/object-boxes.test.ts`, `src/engine/object-resize.test.ts`, `e2e/object-resize.spec.ts`, `e2e/tables.spec.ts`

## DOCE-PAGINATION-11 - The layout engine on the pages

The pages are always laid out and drawn with the text layout engine (DOCE-PAGINATION-9, DOCE-PAGINATION-10), measured with the font files the host serves (DOCE-PAGINATION-12.5). The engine's module loads with the pages' first layout. The web layout keeps the DOM's lines and never loads the engine; without the host's fonts the editor shows the document in the web layout (DOCE-PAGINATION-12.5).

### DOCE-PAGINATION-11.1 - Measuring with the engine

The paged projection shall load the engine with its first layout and make it again for each template the pages are laid out with. Each top-level block of a section's page content shall take its height, margins and split measurement from the engine, in the section's content width, kept by node, its heading or paragraph number, the numbers of the footnote markers it holds, the caption labels and equation numbers it and its descendants show (`blockLabelKeys`), and its section. An insertion, deletion, move or undo that renumbers a caption or equation shall lay out its block again, including an equation inside an unchanged table; a block its host's rule sizes takes that size (DOCE-PAGINATION-14.1); one a host draws with a node view of its own or holding one (`nodeViews`, DOCE-PAGINATION-7.17) that no rule sizes, or one the engine cannot lay out, takes no room, with the reason counted in the projection's `stats().textLayout` (DOCE-PAGINATION-14.6). The engine shall size math from its layout (DOCE-PAGINATION-12.10), lay out as text the text atoms the host draws with no node view of its own, number footnote markers and entries through the document as the state the pages are laid out from does, by footnote id, and give captions their labels (`captionNumbers`); footnote markers are laid out as text too, since a superscript no longer raises its line (DOCE-PAGINATION-9.3), so no text atom is refused (`REFUSED_TEXT_ATOMS` is empty), nor is a block for a template variable it holds (DOCE-PAGINATION-9.5). A block's lines (`lines(node, { scope, prefix, number })`) shall be those its `measureBlock` laid it out on for the same prefix and number, kept by them and its footnote markers' numbers. The engine shall take text widths from one injectable source (`measureContext`): in the editor, the font files the host serves (DOCE-HOST-1.14.1, DOCE-PAGINATION-12.5), and only outside the editor, as in unit tests, a Canvas measuring unhinted (`geometricPrecision`); and its font metrics from the same source, and fit lines at a layout scale of 1 on every screen and zoom, never reading the device pixel ratio, so every device computes the same lines and the pages are drawn on them; the pages shall then draw their text unhinted too (`text-rendering: geometricPrecision` in the reference stylesheet), since hinted widths differ by script.

The engine shall use Pretext's Blink profile at layout scale 1 independently of the browser.

Implementation: `src/pagination/text-engine.ts`, `src/pagination/block-label-keys.ts`, `src/pagination/text-engine-holder.ts`, `src/pagination/served-fonts.ts`, `src/pagination/host-rules.ts`, `src/pagination/layout-document.ts`, `src/pagination/projection.ts`, `src/layout-engine/text-atoms.ts`
Verification: `src/pagination/text-engine.test.ts`, `src/pagination/text-engine-profile.test.ts`, `src/pagination/text-engine-inputs.test.ts`, `src/pagination/text-engine-captions.test.ts`, `src/pagination/layout-document.test.ts`, `e2e/text-layout.spec.ts`

### DOCE-PAGINATION-11.2 - Forced lines

The pages shall draw each top-level paragraph and heading the engine lays out on the engine's lines, so the browser chooses no line break in them, and each paragraph and heading in a table's cells, a list's items, a quote, a layout section's columns, a script block's output or an embed on the lines the engine laid it out on with its table, list, quote, section or container, in its cell's, item's, quote's, column's or container's width (`nestedLines`, `forcedBlocksOf`), and a code figure's code on the lines the engine laid it out on with its figure, beside its gutter of line numbers, and linked code on the lines of the code block it is laid out as, top-level or in its container (`linkedCodeFigure`), numbered from its first line, and the caption of a figure, a table or a code figure on the lines the engine laid it out on with what holds it, after the label the pages draw before its content (`--de-number`, DOCE-PAGINATION-11.9), its first line's indent drawn before that label, laid out with the labels the pages show, as a split part's own copy of its holder shows the whole one's: a later part's caption shows the first part's text and the continued suffix, which it does not hold, drawn before its empty content in `de-forced-lines__text` with the line marks of the text the engine laid it out over (DOCE-PAGINATION-9.11), and a caption whose lines break inside its label or right after it draws the label in its parts (`de-forced-lines__label`, `labelParts`), each part after the first starting its line at its indent and each that ends its line followed by a `br`, in the caption label font, instead of the label the stylesheet generates, and its content's lines that start in the label take no indent of their own; the reference stylesheet then draws neither the generated label nor the generated text and suffix. A caption the pages do not show, one switched off or a later part's without repeated header rows, is no forced block; a numbered paragraph or heading inside them, or one with words other plugins insert in it, is left to the browser, and the empty placeholder a split leaves at the start of a list item's continuation, which takes no room (DOCE-PAGINATION-4.3), is not drawn. Each text block of a drawn page's header, footer and footnote area shall be drawn on the lines the engine laid it out on with its region (`regionLines`, DOCE-PAGINATION-11.10), with the texts its template variables show on that page, read from the page variables' decorations (`regionVariableTexts`, `forcedRegions`); a footnote entry's first line holds the number the view draws before its content, as the engine laid it out. The block shall carry `de-forced-lines`, `data-lines` with its number of lines and, for a numbered heading's first part, `data-number` with the engine's number; each line that wraps shall end at its last character, marked `de-forced-lines__end`, which the stylesheet draws followed by a line feed, never cutting a character in two; a line that ends at a soft hyphen shall carry `de-forced-lines__hyphen` too, which the stylesheet draws as a hyphen before the line feed, as the engine counted it; a line that starts in from the content edge, as a centred or right-aligned one, shall start with `de-forced-lines__start` and `--de-line-indent`, except a numbered heading's first line, whose indent is the block's `--de-first-indent`, drawn as its `text-indent` before the number; an empty block takes its line's indent as its `--de-first-indent` too, and the empty line after a hard break starts with an empty `de-forced-lines__indent` element of that indent, so the caret of an empty centred or right-aligned line is drawn where its text will start; a wrapped justified line shall carry `de-forced-lines__justified` and the `--de-word-spacing` that fills it, spread over its spaces and no-break spaces, which Chromium's `word-spacing` both stretches. Spaces inside an inline atom, such as a mention, an abbreviation, a template variable's value, an inline embed or a signature, and inside a word other plugins draw in the line, are not stretched, since the engine laid each out at its own width: the reference stylesheet sets their `word-spacing` back to normal, in the editor and in a static drawing. The last line of a split top-level paragraph's or heading's part that a later part continues (`continuingParts`: the part of the same element id and the next part index, on the next page; a part inside a list, quote or other container keeps its last line ragged for now) is a wrapped line of the whole block, so it is drawn as one, justified and hyphenated, in the editor, the viewer and print alike, its height unchanged; a part whose next part starts at the hard break the split moved there (DOCE-PAGINATION-3.6) ends its last line as the block does. The block itself is drawn with `dir` set to its direction (DOCE-PAGINATION-9.12), aligned to its start with its end overhanging by 8px and its first line indented by `--de-first-indent` alone, whatever its custom style sets, in the body, the header, the footer and the footnote area alike. Inline code on a forced line shall be drawn with its padding on each of its line pieces (`box-decoration-break: clone` in the reference stylesheet), as the engine lays it out. A line that ends at a line feed, as each line of code but its last does, shall take no end mark, since the browser breaks there; a code block's lines start past its gutter, which its box draws as padding, so the gutter is no part of their indent (`inset` in the line table). The block's element decoration shall carry its lines (`forcedLines`) for a node view that draws beside them: a code block's gutter shall mark each of its lines `data-engine-lines` and break the hidden copy of its code line with a `br` where the lines wrap it, and nowhere else, so each number sits on its line's first row. Linked code's view shall draw its text inside the same line marks, its tokens inside them, and again when its lines change, its caption line `contenteditable="false"` as drawn beside the code, and number no row after a line feed that ends its code, which starts no line; the views and a static drawing from a layout (DOCE-PAGINATION-13.3) build code's tokens, line marks and gutter from the same data (`code-drawing.ts`), so they draw it alike. Numbered paragraphs are still drawn on the browser's lines. The decorations shall be drawn on the pages' own view and kept by node, a nested block's by node and its lines, since a cell's lines can move with another cell's text, so a keystroke lays out only the block it changed again and every other block keeps its decorations; every page is drawn again when what its blocks' lines were laid out with changes outside them: the footnotes numbered otherwise, the document's stored variable values, or a heading's number, a paragraph's numbering or which parts a later part continues by position, so a heading whose number another heading took is drawn with its new one though the numbers in order are the same, and a part whose next part comes to start, or stops starting, at a hard break draws its last line again.

A page whose template section scope changes shall draw its body, nested blocks and regions on their lines in the new scope, including when the page and block nodes are kept. A top-level list of contents on a kept page shall refresh its row lines and page number boxes when its measured list inputs or reserved digit allowance change (DOCE-PAGINATION-10.11). Pages with the same drawing inputs shall keep their decorations.

Implementation: `src/pagination/forced-lines.ts`, `src/pagination/forced-numbering.ts`, `src/pagination/forced-blocks.ts`, `src/pagination/forced-sets.ts`, `src/pagination/forced-regions.ts`, `src/pagination/nested-lines.ts`, `src/pagination/numbered-text.ts`, `src/pagination/text-engine.ts`, `src/layout-engine/line-marks.ts`, `src/engine/object-views.ts`, `src/engine/code-gutter.ts`, `src/engine/code-drawing.ts`, `src/engine/linked-code.ts`, `src/layout-engine/blocks/linked-code.ts`, `labs/reference/document.css`
Verification: `src/pagination/forced-lines.test.ts`, `src/pagination/prosemirror-internals.test.ts`, `src/engine/code-drawing.test.ts`, `src/pagination/pages-layout.test.ts`, `src/layout-engine/blocks/objects.test.ts`, `src/layout-engine/blocks/numbers.test.ts`, `src/model/pagination/container-split.test.ts`, `src/pagination/forced-regions.test.ts`, `src/pagination/text-engine.test.ts`, `src/layout-engine/line-marks.test.ts`, `src/engine/object-views.test.ts`, `e2e/text-layout.spec.ts`, `e2e/inline-geometry.spec.ts`, `e2e/layout-invariant.spec.ts`

### DOCE-PAGINATION-11.3 - The computed lines

The editor handle's `textLines()` shall give, page by page, each forced block (DOCE-PAGINATION-11.2), a top-level paragraph or heading or one in a table's cells, a list's items, a quote, a layout section's columns, a script block's output, an embed or a code figure's code, which says `nested`, or linked code, read as its own element with the lines of its code, or one in the page's header, footer or footnote area, which says `region` (`header`, `footer` or `footnotes`) and is whole on each page, with its element id, its part, its position, where its content starts in the whole block, and the lines the engine computed for it on that page, as offsets in the whole block with their text, as the page draws it: footnote markers' numbers and template variables' values in it, other inline atoms' text left out as the writer did not type it; or no lines and the reason when the browser draws it. In the web layout it shall give no pages.

Implementation: `src/pagination/text-lines.ts`, `src/components/document-editor/editor-handle.ts`
Verification: `src/pagination/forced-lines.test.ts`, `e2e/text-layout.spec.ts`

### DOCE-PAGINATION-11.4 - The guard on forced lines

`findWrappedLines(root)` shall give each forced block whose drawn lines differ in number from its computed ones, as when the browser wrapped a line by itself, with its element id and both counts. It reads the boxes of the block's text, of each hard break, so a line that holds only a break counts, and of each inline atom (`contenteditable="false"`) as a whole, never the parts an atom draws inside itself, and none of what is drawn beside the lines as a box of its own, such as linked code's caption line, and boxes that overlap by half the shorter one's height are on one line, so an atom taller than its text, a subscript, a superscript or inline code is counted on its line at every zoom. It reads every forced block's boxes, so tests and development call it, not each layout.

Implementation: `src/pagination/layout-validation.ts`
Verification: `src/pagination/layout-validation.test.ts`, `e2e/text-layout.spec.ts`, `e2e/layout-invariant.spec.ts`

### DOCE-PAGINATION-11.5 - Typing with the engine

The stress lab's typing measurement at 40 and 300 pages runs on the engine's pages, and each keystroke shall meet the typing budgets of DOCE-LABS-2.3.

Implementation: `labs/src/stress/stress-lab.tsx`, `e2e/budgets.ts`, `src/pagination/drawn-pages.ts`
Verification: `e2e/performance.spec.ts`

### DOCE-PAGINATION-11.6 - Pages near the screen

Only the pages near the screen, within half a screen above and below the editor's scrolling frame, measured against that frame and not the window so a page is drawn on forced lines before it scrolls into view, and the page holding the caret shall be drawn on forced lines; a page farther away keeps the browser's lines, which its size does not depend on, and gets its forced lines once it comes near. The pages shall be watched as they are drawn, without reading their boxes, and a page coming near or going away shall draw the pages again with no layout. The check of the pages a layout draws (DOCE-PAGINATION-5.9) shall read only the pages drawn on forced lines, and, until the pages near the screen are known, as at the editor's first layouts before and after the engine loads, only the pages whose own box is within half a screen of the frame and the caret's page, since reading what a far page holds lays out a page that would skip its layout. The reference stylesheet shall have the pages skip their layout while off screen (`content-visibility: auto`), so each keystroke walks no farther than the pages near it. The pages holding the selection's anchor and head shall carry `data-selection-page` (a view-only hook), and the reference stylesheet shall never have them skip their layout, since the browser moves a selection written into a page that skips its layout, as when a menu selects a split atom's first fragment on a page off screen, to that page's first text. A snapshot of the pages (`exportSnapshot`, `exportSnapshotAsync`) shall draw every page on forced lines while it is taken, then only those near the screen again; the editor handle's `drawAllLines(all)` does the same for a host or a test that reads every page (a `{ drawAll }` meta of the forced lines' key). The pages near the screen shall come back only once neither the host nor a snapshot asks for every page: a snapshot taken after `drawAllLines(true)` leaves every page drawn, and of two snapshots taken at once, the first to end leaves the other's pages drawn.

When a text edit leaves heading, paragraph and caption numbering unchanged, the forced lines shall keep that numbering and move its positions. Typing shall not read the document's blocks to count their numbers again.

Implementation: `src/pagination/drawn-pages.ts`, `src/pagination/forced-lines.ts`, `src/pagination/selection-pages.ts`, `src/pagination/layout-validation.ts`, `src/pagination/projection.ts`, `src/components/document-editor/editor-handle.ts`, `src/components/document-editor/all-lines.ts`, `src/components/document-editor/use-document-layout.ts`, `labs/reference/document.css`
Verification: `src/pagination/forced-lines.test.ts`, `src/pagination/selection-pages.test.ts`, `src/pagination/layout-validation.test.ts`, `src/components/document-editor/all-lines.test.ts`, `e2e/text-layout.spec.ts`, `e2e/linked-code-fragments.spec.ts`

### DOCE-PAGINATION-11.7 - The caret at a forced line's start

A caret at the position where a forced line ends and the next starts shall be drawn at the next line's start, as the browser draws one at its own wraps, unless the browser last drew it at the line's end, as after End or a click past the line's end: when the editor writes the selection there itself, after an edit or once the DOM under it is drawn again, it shall move the caret to the next line's start, so a vertical move keeps its line and column, also when the line's last character is drawn in an element inside its end mark, such as a reserved box or a link.

Implementation: `src/pagination/forced-caret.ts`
Verification: `src/pagination/forced-lines.test.ts`, `e2e/layout-invariant.spec.ts`, `src/pagination/prosemirror-internals.test.ts`

### DOCE-PAGINATION-11.8 - Offers on forced lines

An offered completion (DOCE-AUTOMATION-3) drawn in a forced block shall take no room on its line, its text overflowing from the caret, so the line keeps the engine's breaks; the reference stylesheet draws it so.

Implementation: `labs/reference/document.css`
Verification: `e2e/layout-invariant.spec.ts`

### DOCE-PAGINATION-11.9 - Numbers from the engine

The pages shall draw the numbers the engine laid them out with, not the stylesheet's counters, which each page's style containment (DOCE-PAGINATION-11.6) would start again: every heading on every page, drawn on forced lines or not, shall carry its number with its space as `data-number` (empty for one without, as a later part of a split heading), and each shown caption, linked code and display equation its label or number as `--de-number` (a caption's label with its separator, found by the id of the object it captions, so a later part of a split table shows the first part's; an equation's by its canonical position), which the reference stylesheet's generated content reads. The labels come from the canonical document under the engine's template (`captionNumbers`, `equationNumbers`), so every page draws the numbers a page without containment would. Measurement and drawing shall use the same equation lookup, including equations before the first table of contents. A projected equation with a unique element id shall keep room for its canonical number while its source is edited. If it is renumbered, the drawing shall use the clearance measured for the new number even when the page keeps the same node. A caption or equation in a repeated table header shall draw its original row's number without advancing the count.

No number is counted from text, so a transaction whose steps only edit text or marks inside one textblock, a heading's or a caption's too, keeps every number, and the drawn numbers only move with it (`keepsAllNumbers`); typing in a heading counts nothing again. The values of the variables in a document are found once for each block node, so a change elsewhere reads them again block by block, not node by node (DOCE-PAGINATION-7.19).

Implementation: `src/pagination/engine-numbers.ts`, `src/pagination/equation-numbers.ts`, `src/pagination/page-variables.ts`, `src/model/pagination/table-header-copies.ts`, `src/pagination/projection.ts`, `labs/reference/document.css`
Verification: `src/pagination/engine-numbers.test.ts`, `src/pagination/page-variables.test.ts`, `src/pagination/text-engine-inputs.test.ts`, `e2e/text-layout.spec.ts`, `e2e/equations-layout.spec.ts`

### DOCE-PAGINATION-11.10 - Headers, footers and footnote areas on the engine

Each section's page header and footer shall take the room the engine lays out for it (`measureRegion`, DOCE-PAGINATION-10.6): its height and its spacing to the content, none when it is empty; and the section's footnote area shall take each entry's height, with the space before the next, and the separator and spacing above them, from the engine's layout of the area (`footnoteAreaOf`). A region the engine cannot lay out takes none; nothing is read from what the view draws. A header or footer holding template variables shall be laid out with the text each shows, read from the page variables' decorations (`regionVariableTexts`, DOCE-PAGINATION-8.2, 9.5), kept by node and those texts, at most 1,024 for a node with the least recently used dropped first, so its room is the same at every device pixel ratio; one showing the page's number (`page.current`) or the page count (`page.total`) shall be laid out for each page with that page's own number, counted through the document, and the document's count, so a page whose longer number wraps its header, as page 10 after page 9 or page 100 after page 99, is left the taller header's room. Where a region shows the page count, the document shall be laid out again with the count it came to until the count it assumed is the count it laid out, or the rooms under both are the same; from the third pass, every page shall take the most room any count tried needs, so a count that flips between two values (as where `10` is narrower than `9`) draws whichever it comes to in a room that holds it, the same on every device; and the next layout shall start from the counts the last one took room for. A layout shall lay each such header and footer out once for each page number and page count it tries, however often its passes read the room. A layout whose page count still moves after its last pass shall say so (`onUnsettled`, "the page count moved after 3 passes"), as one whose lists of contents' digits do (DOCE-PAGINATION-10.11), and the projection counts each such layout (`stats().unsettled`). A section whose regions show neither keeps its pages whatever the numbers. The reference stylesheet shall draw what the engine lays out: footnote entries with no margins but the template's entry spacing between them, and the separator painted in the area's padding at exactly the template's thickness (`--doc-footnote-separator-thickness`, `--doc-footnote-separator-color`), never as a border, whose width a browser rounds to whole device pixels.

A section with no body blocks shall retain one sheet. Its header and footer shall be measured and included in the page count and in the numbering of later sheets.

Implementation: `src/pagination/text-engine.ts`, `src/pagination/region-lines.ts`, `src/pagination/layout-document.ts`, `src/pagination/page-regions.ts`, `src/pagination/footnote-area.ts`, `src/pagination/forced-regions.ts`, `src/layout-engine/blocks/text-blocks.ts`, `labs/reference/document.css`
Verification: `src/pagination/text-engine.test.ts`, `src/pagination/layout-document.test.ts`, `src/pagination/region-lines.test.ts`, `e2e/regression.spec.ts`, `e2e/region-page-numbers.spec.ts`

### DOCE-PAGINATION-11.11 - Words drawn that are not the content

The words another plugin draws in a text block as widgets that are not its content, each widget naming its word in its spec (`insertedText`, the text it belongs to as `insertedGroup`, and `alone` for a deleted block's text), such as the deleted words a version comparison marks up in place (DOCE-VERSIONS-2.1), shall be measured by the engine with the block's content. Each word with the white space after it is an item of its own in the block's font. It is laid out before the content at its offset, including a template variable. Container measurements, including table row boxes, include these words. On blocks drawn on the engine's lines (DOCE-PAGINATION-11.2), a line that starts among such words shall break between two of their widgets, by an empty widget of its own at the side between them that ends the line before and starts the line at its indent (`de-forced-lines__break`, or `de-forced-lines__indent` alone after a hard break). A deleted block's text shall be laid out on lines of its own, before the block's content or after it, broken from it as the comparison's break widget draws it. A paragraph splits at the latest fitting line start that advances through its content, leaves the widgets and lines at each offset together, and preserves the required lines on both sides. A paragraph with no such start moves whole. A word inserted outside a text block shall take no room: the top-level block holding it is laid out without it, and the word is reported (DOCE-PAGINATION-14.6). The kept lines and measurements shall be laid out again when the words, their widget boundaries or sides, or the blocks and offsets holding them change.

Implementation: `src/layout-engine/inserted-text.ts`, `src/layout-engine/runs.ts`, `src/layout-engine/lines.ts`, `src/layout-engine/line-marks.ts`, `src/model/pagination/text-split.ts`, `src/pagination/inserted-texts.ts`, `src/pagination/forced-lines.ts`, `src/pagination/forced-blocks.ts`, `src/pagination/forced-sets.ts`, `src/pagination/nested-lines.ts`, `src/pagination/object-boxes.ts`, `src/pagination/text-engine.ts`, `src/pagination/layout-document.ts`, `src/pagination/text-lines.ts`, `src/engine/version-decorations.ts`, `labs/reference/document.css`
Verification: `src/layout-engine/text-layout.test.ts`, `src/layout-engine/line-marks.test.ts`, `src/model/pagination/text-split.test.ts`, `src/engine/version-compare.test.ts`, `src/pagination/forced-lines.test.ts`, `src/pagination/text-engine.test.ts`, `src/pagination/text-engine-inputs.test.ts`, `e2e/inline-geometry.spec.ts`

### DOCE-PAGINATION-11.12 - Suggestions a markup hides

The engine shall lay the pages out in the editor's markup (`markup`, its `simple` markup as `final`): as if accepted, each suggested deletion's content takes no room, and as if rejected, each suggested insertion's, as the markup's stylesheet hides them and a print in that markup leaves them out (DOCE-EDITOR-6.16). Such content is left out of the block's runs, text and inline atoms alike; its block's lines still tile the content, the line table naming the hidden ranges (`hidden`), and each line's marks start and end on its first and last shown character and stretch only its shown spaces, so the pages draw the same lines with the content hidden. A block holding a suggestion is measured again in another markup and kept by it; the regions and containers laid out are forgotten when the markup changes, and the engine is kept. Another markup on the editor lays the pages out again. A layout handed over (`pagesLayout({ markup })`, DOCE-PAGINATION-13.2) or a snapshot (`exportSnapshot`, `exportSnapshotAsync`) in another markup shall lay the pages out in it, take what was asked and lay them out in the editor's markup again, all in one task, so the screen never shows the other markup; a print as if accepted of a long deletion then has no blank pages. Blocks the DOM measures, and suggested whole blocks, keep the room the stylesheet gives them.

If `pagesLayout({ markup })` or `exportSnapshot` cannot lay out the requested alternate markup immediately, as while the user is composing text, it shall return null. If `exportSnapshotAsync` cannot lay out the requested alternate markup when capturing the snapshot, it shall reject.

Implementation: `src/layout-engine/hidden-suggestions.ts`, `src/layout-engine/runs.ts`, `src/layout-engine/lines.ts`, `src/layout-engine/line-marks.ts`, `src/layout-engine/text-layout.ts`, `src/pagination/text-engine.ts`, `src/pagination/text-engine-holder.ts`, `src/components/document-editor/layout-markup.ts`, `src/components/document-editor/use-document-layout.ts`, `src/components/document-editor/start-paging.ts`, `src/components/document-editor/editor-handle.ts`, `labs/src/regression/regression-lab.tsx`
Verification: `src/layout-engine/text-layout.test.ts`, `src/layout-engine/line-marks.test.ts`, `src/pagination/text-engine.test.ts`, `src/components/document-editor/document-editor.test.tsx`, `e2e/suggestion-markup.spec.ts`

### DOCE-PAGINATION-11.13 - Template variables in the text

The engine shall lay out a block holding a template variable outside a header or footer (`bodyVariables`), so no block is left to the browser for one. A variable whose value is the same on every page, such as a document's title, owner or today's date, shall be laid out as the text the page variables draw in it, from the same values (`variables` on the text layout setting, the editor's own `variables` adapter, `fixedVariableText`), never broken inside, and as nothing when it shows none. A page's number or the page count (`page.current`, `page.total`, `PAGE_VARIABLES`), whose value would make the block's height depend on the page it lands on, shall instead take a box of a fixed width, the same on every page: as many widths of its font's `0` as a list of contents' page box keeps room for (DOCE-PAGINATION-10.11: 3 digits, or the digits of the page count when it has more pages), rounded up to the layout unit (`pageBoxWidth`), so a page number in the text now sits in a box of room for three digits. A layout of a document whose text holds one shall settle those digits with the page count as a list of contents' do, at most 3 passes, the room only growing. The line table lists each such box as a reserved box over the variable (DOCE-PAGINATION-12.4), which the pages, the viewer and print draw on the variable's own element with the other marks on its range (`de-forced-lines__reserved`, `--de-reserved-width`); the reference stylesheet keeps the variable inline, so its line end or indent stays outside the box, and draws its value in an inline block of that width, at its right, with tabular digits. A block's kept lines and measurements shall be laid out again when its variables' texts or the digits change.

Implementation: `src/layout-engine/body-variables.ts`, `src/layout-engine/page-box.ts`, `src/layout-engine/runs.ts`, `src/layout-engine/text-layout.ts`, `src/layout-engine/blocks/text-blocks.ts`, `src/pagination/body-variables.ts`, `src/pagination/page-variables.ts`, `src/pagination/text-engine.ts`, `src/pagination/nested-lines.ts`, `src/pagination/layout-document.ts`, `src/pagination/forced-sets.ts`, `src/pagination/text-engine-holder.ts`, `src/components/document-editor/start-paging.ts`, `src/document/print-lines.ts`, `src/document/print-pages.ts`, `labs/reference/document.css`
Verification: `src/layout-engine/text-layout.test.ts`, `src/pagination/body-variables.test.ts`, `src/pagination/text-engine-refusals.test.ts`, `src/document/print-pages.test.ts`

## DOCE-PAGINATION-12 - Widths from the font files

Under Pretext layout, text widths come from the served font files, shaped with HarfBuzz in WebAssembly, so every machine breaks lines in the same places (Charles, 2026-11-21: "Adopt as the standard"). Canvas stays in the labs only, as a comparison.

Known limits, open until a case needs them (the spike's report has the measurements):

- **Direction overrides.** U+202D and U+202E change the shaping direction in Canvas (about 0.24 px in one case). The measurer shapes their text left to right.
- **Kana kerning.** The DOM shapes a whole run, so Japanese text gets kana kerning there. Canvas shapes word by word and does not, and the measurer follows Canvas.
- **Bidi runs.** Chromium rounds each bidi run's piece of a line up to 1/64 px. Pretext does not, so a right-to-left paragraph that numbers split into many runs can break a word later than Chromium (about 1 in 50 such paragraphs in DOCE-LABS-7.3).
- **Script runs across items.** A rich item takes no script from the item before it, so a number in its own bold run after Hebrew letters is measured as Common text.
- **Probe characters.** Pretext measures a few characters besides the text, such as the kana and full-width punctuation it reads a CJK font's kerning from. A face set without them reports them as missing.
- **Fractional sizes.** The measurer copies Linux Chromium's arithmetic. On macOS and Windows the browser's own layout is about 0.06 px narrower per 30 characters at sizes such as 14.666667 px, and within 0.001 px at whole and half pixel sizes.

### DOCE-PAGINATION-12.1 - The font-file measurer

`createFontFileMeasurer({ wasm, faces, generics })` shall take harfbuzzjs's `harfbuzz.wasm` and the served faces (family, weight, style, optional `unicode-range`, and the bytes of a WOFF 1.0 or OpenType file) as bytes, fetch nothing, and give `createContext()`, a Canvas-shaped measuring context for Pretext's `setMeasureContext`. The reference text (55 strings at five sizes in nine Geist and KaTeX faces, the ellipsis no face has in its reserved box) shall measure to fingerprint `f43b1311`, and Pretext shall break 120 seeded paragraphs at nine widths into 7,403 lines with fingerprint `0811af10` (fork release 1.0.0-fe.5), in Node, a page and a worker, on Linux, Windows and macOS (DOCE-LABS-7.1). CI shall run the Node test on Linux and Windows on every pull request that reaches the layout engine, its font fixtures or the dependencies, and the required `check` shall fail when either fails; a weekly workflow shall run it on macOS and Windows and open or update one issue when it fails. The widths shall follow Linux Chromium's Canvas: glyph advances at the size floored to 1/64 px, kerning at the size floored to 1/100 px, each word's width a float32 and the words summed in float32. HarfBuzz shall shape with every OpenType feature it is given, however many, and a heap that cannot grow shall fail the allocation with an error rather than write through a null pointer. Loading the shaper and the files (`loadHostFonts`) shall never throw: an adapter that throws rather than rejects fails with `shaper-failed` or `files-failed`. The module shall not be exported or reached from an entry until the editor's Pretext layout uses it.

Implementation: `src/layout-engine/font-files/measurer.ts`, `src/layout-engine/font-files/harfbuzz.ts`, `src/layout-engine/font-files/host-fonts.ts`, `src/layout-engine/font-files/woff.ts`, `src/layout-engine/font-files/faces.ts`
Verification: `src/layout-engine/font-files/measurer.test.ts`, `src/layout-engine/font-files/harfbuzz.test.ts`, `src/layout-engine/font-files/host-fonts.test.ts`

### DOCE-PAGINATION-12.2 - Canvas words, fallback and missing glyphs

The measurer shall shape as Chromium's Canvas does: each space, and each zero-width space, soft hyphen, direction mark, embedding or override, Arabic letter mark, Mongolian vowel separator and byte order mark a word of its own, so no kerning reaches across them (joiners, the word joiner and the isolates do not end a word); a cut before a kana or ideograph after another character; ASCII whitespace as a space; line and paragraph separators drawn with the space glyph; default ignorables of no width; fallback grapheme by grapheme through the font's family list and each face's `unicode-range`; adjacent CJK punctuation trimmed with the font's `halt` feature; `fontKerning = 'none'` without kerning; and a letter spacing that turns ligatures off and follows each cluster. A cluster shall be drawn by the first face that draws it whole, as Blink asks (no .notdef once shaped, so a letter with an accent may come from one precomposed glyph), with variation selectors, tags and the default ignorables needing no glyph; an emoji presentation selector (U+FE0F) shall put the faces with color glyphs first, a text presentation selector (U+FE0E) shall leave them out, and without a selector the family list decides, whatever the character's default presentation. Each text shall be shaped in Blink's script runs (ScriptRunIterator): characters of no script join the run before them, or at the text's start the run after them, a closing bracket goes back to its opening bracket's run, and a number in a right-to-left run is shaped left to right; so the digits of `שלום 123` take the Hebrew run, in which HarfBuzz applies no kerning from a font without Hebrew positioning, as Chromium draws them. With fork release 1.0.0-fe.7, Pretext measures a word of digits or punctuation in right-to-left text after the letter whose run it is in. The widths of 21 such texts in Geist and the Noto subsets of `test/fixtures/fonts/` shall be within 2/64 px of Chromium 153's. Every character of a cluster no served face draws whole shall be recorded in `problems.missingGlyphs`, and the cluster takes its reserved width (DOCE-PAGINATION-12.4).

Every qualifying punctuation position shaped in a served face shall receive the `halt` feature, including in long words with other OpenType feature settings. The measurer shall assign graphemes to script runs in a single forward pass across Canvas word boundaries. Matching a closing bracket shall discard its opener and any intervening unmatched openers, with each opener considered for removal once.

Implementation: `src/layout-engine/font-files/measure-context.ts`, `src/layout-engine/font-files/harfbuzz.ts`, `src/layout-engine/font-files/cluster-faces.ts`, `src/layout-engine/font-files/script-runs.ts`, `src/layout-engine/font-files/faces.ts`
Verification: `src/layout-engine/font-files/measurer.test.ts`, `src/layout-engine/font-files/script-runs.test.ts`

### DOCE-PAGINATION-12.3 - Line metrics from the font files

The measurer's `measureText` shall also give `fontBoundingBoxAscent` and `fontBoundingBoxDescent`: the primary face's ascender and descender, as HarfBuzz reads them from the font's tables, at the font's size and rounded to whole pixels, as Linux Chromium's Canvas gives them, so a line's strut needs no Canvas either. The primary face is the first matched face whose `unicode-range` holds the space.

Implementation: `src/layout-engine/font-files/measure-context.ts`, `src/layout-engine/font-files/harfbuzz.ts`
Verification: `src/layout-engine/font-files/measurer.test.ts`

### DOCE-PAGINATION-12.4 - Reserved boxes

What the measurer cannot measure reliably shall take a fixed width that the measurer and every drawing of the pages agree on, so the layout never depends on it (Charles, 2026-11-22: "anything Pretext cannot reliably measure"). The measurer's `reserve(cluster, font)` (`ReserveCluster`) gives a cluster's reserved width in CSS pixels, or null when it measures the cluster. A control character, such as a code block's line feed or tab, is white space the lines lay out and takes none. The first case is a cluster no served face draws whole, which the browser draws from a system font: it takes `UNSERVED_CLUSTER_EMS` (1) of its font's size, one box per cluster, with no kerning or shaping across its edges. The contexts measure such a cluster at that width, and the text layout engine, given the same function as its `reserve` option, lists each such cluster of a block's text, a citation's identifier's included, in its line table (`reserved`: content range and width); a text atom or a template variable whose text holds one is drawn in one element the line marks cannot reach inside, so it takes one box over the whole node, as wide as its text. The line marks draw each one as an inner mark (`de-forced-lines__reserved` with `--de-reserved-width`), an element of its own inside a line's other marks, so a line's end or indent stays outside it; the reference stylesheet draws it as an inline block of that width with its real glyph centred, which may reach past the box without moving anything. A word another plugin draws in a text block that is not its content (DOCE-PAGINATION-11.11), such as a comparison's deleted word, is measured the same way: the pages' engine shall give its clusters that take a reserved width in the block's font (`insertedReserved`), by offset in the word, and the pages shall draw the word's widget with each such cluster inside a `de-forced-lines__reserved` box of its element, the element's text unchanged (`withReservedWords`, when the pages' decorations are built). The boxes are part of the widget's key, so a word whose boxes change, as when the engine is made, a face is served or its block's font changes, is drawn again. A widget drawn from a node rather than a function, or whose element's text is not its word, is drawn as it is. Another case Pretext cannot measure reliably shall take a reserved width through the same function and marks. Splitting a line mark at reserved boxes shall visit only the indexed edges inside it, even in a block with many missing glyphs.

Implementation: `src/layout-engine/reserved-boxes.ts`, `src/layout-engine/font-files/cluster-faces.ts`, `src/layout-engine/font-files/measure-context.ts`, `src/layout-engine/font-files/measurer.ts`, `src/layout-engine/text-layout.ts`, `src/layout-engine/line-marks.ts`, `src/pagination/forced-lines.ts`, `src/pagination/inserted-reserved.ts`, `src/pagination/canonical-decorations.ts`, `src/pagination/text-engine.ts`, `src/document/print-lines.ts`, `labs/reference/document.css`
Verification: `src/layout-engine/font-files/measurer.test.ts`, `src/layout-engine/text-layout.test.ts`, `src/layout-engine/text-boxes.test.ts`, `src/layout-engine/line-marks.test.ts`, `src/pagination/inserted-reserved.test.ts`, `src/pagination/text-engine.test.ts`, `src/document/print-pages.test.ts`, `e2e/inline-geometry.spec.ts`

### DOCE-PAGINATION-12.5 - The editor's served fonts

On pages, the editor shall ask its `fonts` adapter once for the shaper and the faces of the template's families (DOCE-HOST-1.14.1), keep its pages pending until both arrive, laying nothing out before the engine has loaded with them, and measure every width and line metric with them: the engine's `measureContext` from the font-file measurer, and `isFontServed` true only for a family with served faces. A template font whose first family no served face has, once the template's families have been asked for, shall be laid out and drawn as the served body family (the template's paragraph font, else the family served for `serif`, `sans-serif` or `monospace`) in the template the pages are drawn and laid out in (`servedFamiliesOnly`), so no style of the pages names it and the browser cannot draw a local font of that name, and the editor shall name it once in its missing-fonts banner (`fonts-missing`, DOCE-EDITOR-7.3). The editor shall also ask for the generic keywords `serif`, `sans-serif` and `monospace`, and lay out and draw its pages in the template with each generic family it names, including within fallback stacks, and its unset paragraph and code fonts, as the served family the host's `generics` says the keyword stands for (`servedTemplate`), since a generic keyword is drawn in whatever face the browser picks; a generic the host serves no family for is not served. Exports, scripts and the editor's handle keep the template as given, but a snapshot of the pages (`exportSnapshot`, `exportSnapshotAsync`) prints with the template they are drawn in, so a print draws every font as the pages do. A family a later template names shall be asked for once, drawn in the served body family until its faces arrive, and then laid out and drawn in its own faces, the engine made again. When its files fail to arrive (the host rejects, throws or answers without them), it shall be asked for again by a later ask that names it, one second after the first failure and twice as long after each next one, at most a minute, and drawn in the served body family meanwhile. A proposed registration the browser refuses to construct or load a face of (`FontFace` or `FontFace.load()`) shall contribute none of the faces of that family to measurement, drawing or `files()`. The document drops every face of the refused registration for all surfaces sharing it. If the family has no earlier usable registration, a generic that names it has no mapping to it, and the template draws it in the served body family and names it in the missing-fonts banner. If no family is usable, the editor shows the web layout with reason `no-faces`. The served files shall be added to the editor's document as faces of the families they serve, so the pages draw the bytes they were measured with and a local font of the same name never draws instead, and taken out when the editor goes. Without a shaper, without `files()`, when either fails, or when none of the faces can be read, the pages cannot be laid out: the editor shall show the document in the web layout (`data-layout="web"`), unpaged, in the browser's fallback fonts, with a danger banner that is not dismissed (`pages-unavailable`, "The pages cannot be laid out", with the reason and "The document shows without pages, in fallback fonts."), and the root says `data-text-layout="dom"` and why in `data-text-layout-reason` (`no-shaper`, `no-files`, `shaper-failed`, `files-failed`, `no-faces`). A projection with no engine to wait for, given none (`no-engine`), given served fonts that cannot be read (their reason) or an engine module that fails to load (`engine-failed`), shall fail its layout (`failed`), writing why to the layout's trace, rather than stay pending. The reference stylesheet turns `font-synthesis` off on the pages (DOCE-HOST-1.14.2), and draws a code block's `code` in the block's own font rather than the browser's default `code` font; every text of a page shall be drawn in a family the host serves, but MathML a math layouter does not draw, which the browser draws in its own `math` family in the box its layout, or the reserved box, gives it (DOCE-PAGINATION-12.9). The labs serve Arimo, Cousine and Tinos, faces with Arial's, Courier New's and Times New Roman's metrics, under those names, and the generic keywords as them; and Tinos as Georgia too, which their templates name.

The engine's holder settles its `loaded` whether or not the served fonts arrive: when they fail it holds no engine, and the pages show why from the fonts, so no rejection is left unhandled.

The editor shares overlapping requests for the same normalized family. A failed request may be retried with backoff. A request settling for a previous template still makes its faces available without changing the current template's missing-font report. An unset paragraph or code font uses the served body family when its generic has no mapping. If the template has no served body or generic family, its fallback is the first served family.

Implementation: `src/pagination/served-fonts.ts`, `src/document/font-registry.ts`, `src/pagination/served-template.ts`, `src/pagination/text-engine-holder.ts`, `src/pagination/text-engine.ts`, `src/pagination/projection-session.ts`, `src/pagination/ready-engine.ts`, `src/pagination/layout-readiness.ts`, `src/components/document-editor/use-pages-fonts.ts`, `src/components/document-editor/use-editor-layout.tsx`, `src/components/document-editor/use-host-reach.ts`, `src/components/document-editor/root-data.ts`, `labs/src/served-fonts.ts`, `labs/reference/document.css`
Verification: `src/pagination/served-fonts.test.ts`, `src/pagination/served-template.test.ts`, `src/components/document-editor/document-editor.test.tsx`, `src/pagination/text-engine.test.ts`, `src/pagination/projection-session.test.ts`, `e2e/text-layout.spec.ts`

### DOCE-PAGINATION-12.6 - Engines with different fonts on one page

Pretext keeps one width source for the whole page, so every way into an engine that measures (a block's height, a block's lines, a header's, footer's or footnote area's room) shall first set Pretext's width source to the engine's own. Two engines on one page measuring different files under one family name, in any order and interleaved, shall measure and keep every header, footer and body block as each does alone.

Implementation: `src/pagination/text-engine.ts`
Verification: `src/pagination/text-engine-fonts.test.ts`

### DOCE-PAGINATION-12.7 - A fonts adapter replaced while the editor shows

When the editor is given another `fonts` adapter while it shows, it shall load that adapter's shaper and faces and start its pages over with them, as a fresh editor given that adapter does: the same lines, the new faces drawn on the pages and the new files in its snapshots and layouts, with the writer's selection kept. The previous adapter's loading is abandoned: files it gives after it was replaced are never measured, laid out with or added to the document. The pages start over for each new adapter object, so a host keeps its adapter the same object while its fonts are.

A replaced adapter's `load()` result shall also be ignored when reporting unavailable font families.

Replacing the adapter or destroying the editor shall end the editor's wait for any pending browser registration and release its share of the faces. Any other surface sharing the registration shall still receive its browser load result.

Implementation: `src/components/document-editor/use-pages-fonts.ts`, `src/components/document-editor/banners.tsx`, `src/pagination/served-fonts.ts`, `labs/src/served-fonts.ts`, `labs/src/regression/regression-lab.tsx`
Verification: `src/components/document-editor/banners.test.tsx`, `src/pagination/served-fonts.test.ts`, `e2e/font-lifecycle.spec.ts`

### DOCE-PAGINATION-12.8 - Surfaces drawing other files under one family

The served faces an editor's pages and each `DocumentViewer` add to their document shall be held once for the whole document (`registerFaces`): a surface given the very files another surface drew under a family shares its faces, files being the same by their content (length and a hash of their bytes), whichever buffers hold them, and a face leaves the document once no surface draws it. A surface given other files under a family another surface holds shall draw them under a family of its own (the family's name with a suffix): the viewer in its template with that family renamed, the editor in its template renamed and measuring the renamed family with the same files, and its snapshots holding the faces under both names. No surface's text shall change width when another mounts or unmounts.

Family names and generated aliases shall be unique among different registrations in the same document. If a served family's original name is another family's drawing name, the snapshot shall include that served family's files only under its actual drawing name. A registration shall preserve the order of its family's files, with the last matching face taking precedence when equally matched subsets overlap, as in CSS. Within a batch an exact duplicate takes its last position. A repeat of an already served file in a later batch leaves its position unchanged. If a later batch adds faces to a family, the editor shall use all the family's faces together for measurement and drawing after the new registration is ready, and release its old registration after applying the new family name. If the new registration fails, the earlier usable registration stays available for both measurement and drawing. Other accepted families in the batch stay available.

Implementation: `src/document/font-registry.ts`, `src/pagination/served-faces.ts`, `src/pagination/served-fonts.ts`, `src/pagination/served-template.ts`, `src/layout-engine/font-files/faces.ts`, `src/components/document-viewer/document-viewer.tsx`, `src/components/document-editor/use-pages-fonts.ts`, `src/components/document-editor/editor-handle.ts`
Verification: `src/document/font-registry.test.ts`, `src/layout-engine/font-files/measurer.test.ts`, `src/pagination/served-fonts.test.ts`, `src/components/document-viewer/document-viewer.test.tsx`, `e2e/font-lifecycle.spec.ts`

### DOCE-PAGINATION-12.9 - Math with no layout

Typeset math shall take a reserved box when the math layouter (DOCE-PAGINATION-12.12) cannot load, refuses its MathML or has no glyph for a character it draws. The engine shall size the box without a system font, and every drawing shall use the same dimensions (DOCE-PAGINATION-12.4). An inline box measures one em per grapheme cluster its token elements draw (`mi`, `mn`, `mo`, `mtext` and `ms`, not the annotation that holds its source; `mathTreeText`, `clusterCount`) by one em, 0.8 em above the baseline and 0.2 em below. A display equation measures two ems tall across the line. Both use the font size the math is drawn at. The engine computes it with no DOM (`reservedMath`), records the characters without a glyph as missing glyphs (`ServedFonts.missing`, the measurer's `problems.missingGlyphs`) and tells refused math to `refused`, and every drawing draws the MathML centred in the box, free to reach past it without moving anything (DOCE-PAGINATION-12.11).

Implementation: `src/layout-engine/math-atoms.ts`, `src/utils/math-text.ts`, `src/pagination/served-fonts.ts`, `src/components/document-editor/start-paging.ts`
Verification: `src/layout-engine/math-atoms.test.ts`, `src/utils/math-text.test.ts`, `e2e/equations-layout.spec.ts`

### DOCE-PAGINATION-12.10 - Math sized from its layout, scaled to fit

With a math layouter (`TextLayoutSetting.mathLayouter`, a `MathLayouter`: DOCE-PAGINATION-12.12), the engine shall size typeset math, inline and display, from its layout and never from the DOM (`createMathAtomMeasurer`): the layouter lays the MathML the math views kept (`typesetMathOf`) out at the font size the math is drawn at (its text block's, with its marks, or the template's paragraph size for a display equation), into its width, ascent and descent and the SVG that draws it, after loading what it needs (`prepare`, which the pages wait for, DOCE-PAGINATION-10.8). A display equation's tag (KaTeX's four-cell table row, or a MathML `mlabeledtr`) shall be laid out apart from the equation (`splitTag`) and sit on its baseline at the line's end. Math the layouter returns no layout for, or whose layout has characters without a glyph (`missing`), shall take the reserved box of DOCE-PAGINATION-12.9, computed by the engine from its clusters and font size with no DOM (`reservedMath`): one em per cluster by one em inline, 0.8 em above the baseline, and two ems tall for a display equation; the characters shall be recorded as missing glyphs, and refused math is told to `refused`. An equation wider than its room shall be scaled down to fit with one uniform scale, as an image is: inline math only when wider than its block's whole line, a display equation when wider than its line less the room its line's end keeps for its tag, which keeps its size, or for its automatic number (`equationOf`, the number the pages draw as `--de-number`, DOCE-PAGINATION-11.9, measured in the equation's font), side by side when it has both, the tag before the number with an em between them, and an em between them and the equation, each the scope's text size, not a glyph's width (`end`, the tag's distance from the line's end `tagEnd`); the scale is the room over the width, never above 1 and with no floor (`fitScale`), and applies to the width, ascent and descent, each rounded up to the layout unit (`placeMath`). The engine shall record where it placed each such math node (`mathOf`), and count those scaled below `MATH_MIN_REPORTED_SCALE` (0.5) in its stats (`smallMath`), only among the math of the document it numbered last, so an equation edited or deleted since is not counted. A display equation's number is part of its block's key, so a renumbered equation is laid out again. If the editor’s built-in layouter fails to load, typeset math takes the reserved box. Without a layouter supplied to the engine, math takes the reserved box; until math is typeset, or while its glyphs load, its reserved box is provisional (DOCE-PAGINATION-12.13).

When the engine numbers a new document, it shall release the placements indexed by element id for equations the document deleted or replaced. A placement kept by node while that node lives may be indexed again when undo restores the node.

Implementation: `src/layout-engine/math-atoms.ts`, `src/layout-engine/math-tags.ts`, `src/layout-engine/runs.ts`, `src/layout-engine/text-layout.ts`, `src/layout-engine/blocks/objects.ts`, `src/layout-engine/atoms.ts`, `src/pagination/text-engine.ts`, `src/pagination/text-engine-holder.ts`, `src/pagination/text-engine-atoms.ts`, `src/pagination/node-numbers.ts`, `src/pagination/numbered-text.ts`
Verification: `src/layout-engine/math-atoms.test.ts`, `src/layout-engine/math-tags.test.ts`, `src/layout-engine/text-layout.test.ts`, `src/layout-engine/blocks/objects.test.ts`, `src/pagination/node-numbers.test.ts`, `src/pagination/text-engine-atoms.test.ts`, `src/pagination/text-engine-inputs.test.ts`

### DOCE-PAGINATION-12.11 - Math drawn from its layout

Every renderer shall draw math the engine placed (DOCE-PAGINATION-12.10) from that placement, so what is drawn is what was measured on every system. The pages shall decorate each such math node (`engineMath`) with `data-math-layout` (`laid`, or `reserved` for the reserved box) and its box and scale as `--de-math-width`, `--de-math-ascent`, `--de-math-descent` and `--de-math-scale`, a tag's box as `--de-math-tag-width`, `--de-math-tag-ascent` and `--de-math-tag-descent` and its distance from the line's end past an automatic number as `--de-math-tag-end`, and the room its line's end keeps as `--de-math-end` (`mathDrawingHooks`); the placements move with edits that leave every math node as it was, and are made again otherwise, and again whenever the engine places math anew after a state was made (`mathVersion`), as it does laying the pages out after each transaction. A math node the pages hold that is not the node the engine laid out but equals it, as math edited inside is, since the pages and the canonical state each make their own copy of it, takes the placement of the laid node with its element id (`mathPlaces`). The math views shall draw a laid equation's SVG (`de-math__drawing`, `aria-hidden`), sized to its box so its `viewBox` scales its paths, and a tag's (`de-math__tag`) at its own size, before the typeset MathML, which stays in the element for screen readers, copy and find. The drawing holds only `svg`, `g`, `path`, `rect` and `line` and their geometry, fill and stroke attributes (`MATH_DRAWING_ELEMENTS`, `MATH_DRAWING_ATTRIBUTES`), filled with `currentColor` or the colour the MathML set, so it follows the text colour and dark mode. The pages' layout shall carry each placement with its math (`PagesLayoutMath.drawing`), read from the engine that laid those pages out, and the viewer, static pages and a print drawn from the layout draw the same hooks and SVG through the snapshot's allow-list (`mathDrawingTrees`), needing no font files. The reference stylesheet gives the element exactly its box, inline on its baseline and a display equation across the line with the drawing centred, or moved towards the line's start as far as it must to stay clear of `--de-math-end`, so a scaled equation never runs into its tag or number, hides a laid equation's MathML from sight only (clipped, not `display: none`), and centres a reserved box's MathML in it as DOCE-PAGINATION-12.9 does. Selection and the caret's outline stay on the element.

Implementation: `src/engine/math-drawing.ts`, `src/engine/math-views.ts`, `src/pagination/engine-math.ts`, `src/pagination/text-engine-atoms.ts`, `src/pagination/text-layout-plugins.ts`, `src/pagination/pages-layout.ts`, `src/document/pages-layout.ts`, `src/document/print-pages.ts`, `labs/reference/document.css`
Verification: `src/engine/math-drawing.test.ts`, `src/engine/math-views.test.ts`, `src/pagination/engine-math.test.ts`, `src/pagination/text-engine-atoms.test.ts`, `src/pagination/pages-layout.test.ts`, `src/document/print-pages.test.ts`, `e2e/equations-layout.spec.ts`

### DOCE-PAGINATION-12.12 - Equations laid out and drawn by MathJax

The layout engine shall size and draw equations with one deterministic layouter, `createMathJaxLayouter()`, so an equation has the same box and the same drawing in every browser, in Node and on every system, and no browser MathML layout is read. The layouter typesets the MathML the editor's math renderer gives (a math tree) with MathJax 4's MathML input and SVG output and the STIX Two math font data (`@mathjax/src` and `@mathjax/mathjax-stix2-font`, dependencies of the package), with no DOM (its lite adaptor), no glyph cache shared between drawings (`fontCache: 'none'`) and no automatic line breaks: an equation never wraps.

- **Loading.** The layouter loads lazily, with the first pages the engine lays out, and resolves to null when MathJax cannot load, so math takes the reserved box (DOCE-PAGINATION-12.9). The font's glyph ranges past its base data load in `prepare(trees)`, which resolves once every given tree can be laid out, or returns null when nothing is left to load; asked again for a tree whose glyphs still load, it starts no second load. `layout` is synchronous and never lays an equation out from partial data: there is no provisional first layout that changes once a range arrives.
- **Host isolation.** Each layouter uses its own MathJax document and loads STIX Two glyph ranges on its own font instance. Initialization and range loading shall preserve the host’s MathJax handler list, loader and synchronous loading setting, even as several layouters initialize or load ranges concurrently.
- **Box.** `layout(tree, display, sizePx)` gives the natural box from the drawing's view box: its width, its ascent above the baseline and its descent below, in pixels for the font size, each rounded up to 1/64 px once. It never scales: an equation wider than its room is scaled down uniformly by the engine (DOCE-PAGINATION-12.10), from this natural box.
- **Drawing.** The drawing is an SVG tree of `svg`, `g`, `path`, `rect` and `line` elements with only geometry, fill and stroke attributes, its root carrying its view box and visible overflow, so every renderer draws the same shapes at any size.
- **Missing glyphs.** Characters the font has no glyph for are left out of the drawing and named in `missing`, so the engine gives that equation its fixed reserved size.
- **Refusals.** MathML MathJax refuses (an error node) lays nothing out: `layout` gives null.
- **Cache.** Layouts are kept per tree and display, the 2,000 most recently used, so each equation is typeset once and its box at another size is the same layout scaled. `key` names the MathJax version and the font, so stored layouts can be told apart when either changes.
- **Host builds.** MathJax's SVG output imports its default font through `#default-font`; a host's bundler maps it to `@mathjax/mathjax-stix2-font/mjs` (the labs build and the bundle check do), or MathJax's default font is bundled as well; the layouter draws with STIX Two either way.

MathJax and its STIX Two font data are Apache-2.0 (the packages' `license` fields); the STIX Two outlines the data is drawn from are under the SIL Open Font License 1.1, which allows bundling them with software.

Implementation: `src/layout-engine/math/mathjax-layouter.ts`, `src/components/document-editor/start-paging.ts`, `scripts/build-labs.mjs`
Verification: `src/layout-engine/math/mathjax-layouter.test.ts` (Node, on Linux and Windows for each pull request and weekly on macOS), `e2e/font-widths.spec.ts` (DOCE-LABS-7.5), `e2e/equations-layout.spec.ts`

### DOCE-PAGINATION-12.13 - Math measured before it is typeset

The engine can be asked for a block holding math before the math views have typeset it, or while the layouter still loads its glyphs: the pages' lines are drawn as soon as a transaction is applied, such as a paste or a collaborator's insertion, while the layout waits for the math (DOCE-PAGINATION-10.8, 14.4). Such math takes its reserved box (DOCE-PAGINATION-12.9) only for now: the box is provisional (`AtomSize.provisional`). The atom cache shall never keep a provisional size, and the engine shall keep no block, and no lines of a text block, laid out with one, so each is laid out again when next asked. Once any math given a provisional box can be laid out from its layout, the engine's `atomsVersion` moves and it forgets the regions and containers it kept, and the holder's version moves with it, never back when the engine is made again, so the forced lines and the math placements drawn with the provisional box are drawn again. Math typeset as invalid, refused by the layouter or missing a glyph keeps its reserved box for good: that box is final and kept.

Implementation: `src/layout-engine/atoms.ts`, `src/layout-engine/math-atoms.ts`, `src/pagination/text-engine.ts`, `src/pagination/text-engine-atoms.ts`, `src/pagination/text-engine-holder.ts`
Verification: `src/pagination/text-engine-provisional.test.ts`, `src/pagination/text-engine.test.ts`, `e2e/equations-layout.spec.ts`

## DOCE-PAGINATION-13 - Print and static pages on the engine's lines

What the pages draw with the text layout engine (DOCE-PAGINATION-11) reaches every output of the document: the pages' layout is handed over as data, and a print drawn from it, or from a snapshot of the pages, holds each page's computed lines.

### DOCE-PAGINATION-13.1 - Line marks

The hooks each line of a forced block takes (DOCE-PAGINATION-11.2) shall come from one function without a DOM, `lineMarks(block, lines, { prefixed })`, as ranges of the block's content with their hook class and measured property, in content order, a `prefixed` block's first line without its start mark, whose indent `firstLineIndent(lines)` gives as the block's measured property. A line that ends or starts with an inline node other than text, such as math, whose content no view draws, shall take its end or start mark on that whole node, never on offsets inside it, and the pages shall draw a mark on such a node on its own element (a node decoration), as a view draws inline decorations only on text. The pages' decorations and every static drawing of the pages shall draw these marks, so all of them draw the same lines: text right after inline math that ends a line starts the next line in the editor, the viewer and a print drawn from the layout.

Implementation: `src/layout-engine/line-marks.ts`, `src/pagination/forced-lines.ts`, `src/pagination/forced-sets.ts`
Verification: `src/layout-engine/line-marks.test.ts`, `src/pagination/forced-lines.test.ts`, `e2e/inline-geometry.spec.ts`, `e2e/equations-layout.spec.ts`

### DOCE-PAGINATION-13.2 - The pages' layout as data

The editor handle's `pagesLayout()` shall give the pages' layout as plain data (`PagesLayout`, version 1): the pages' document as ProseMirror JSON, how the pages number their footnotes, each forced block's position, number of lines, a numbered heading's number and its first line's indent (`style`), `direction: 'rtl'` when it is drawn right to left, `gutter: true` when it is code laid out beside a gutter of line numbers, its line marks (linked code's by offset in its code), for every page whether or not the view draws it now, and the value each variable shows, at its position, each math node's typeset presentation where the math views have typeset it (`math`, by position): its MathML as data, as the views kept it after the base library held it to MathML's allowed parts (`typesetMathOf`), or the text invalid math shows and the renderer's reason, the markup it was laid out in (`markup`, DOCE-PAGINATION-11.12: the editor's, or the one `pagesLayout({ markup })` asks for), and whether the layout is provisional (`provisional`): true while the pages are not settled, or a served face they draw with (DOCE-PAGINATION-12.8) is still loading in their document, so its page breaks may still move; a font the host page loads for itself does not make it provisional; a host prints or keeps it once false, as after `whenSettled()`. In the web layout it shall give null. The layout is a hand-over to what draws the pages with the same library version, not a stored format.

Implementation: `src/pagination/pages-layout.ts`, `src/document/font-registry.ts`, `src/document/pages-layout.ts`, `src/pagination/page-variables.ts`, `src/pagination/projection.ts`, `src/layout-engine/atoms.ts`, `src/components/document-editor/editor-handle.ts`, `src/engine/math-views.ts`, `src/engine/math-typeset.ts`
Verification: `src/pagination/pages-layout.test.ts`, `src/pagination/text-engine-inputs.test.ts`, `src/engine/math-views.test.ts`

### DOCE-PAGINATION-13.3 - Static pages on the computed lines

Drawn without a view, from a layout, each forced block shall carry `de-forced-lines`, `data-lines`, its `dir` and its number as the pages do, and its content shall be cut where its line marks start and end, each piece wrapped in the hooks of the marks covering it, inside the block's own marks, so a mark spanning a line end stays one element; an inline atom a mark covers takes its hooks on its own element. The drawing shall scan the line marks in content order across the block and keep only those that can reach the current piece. A text block that is empty or ends in no text ends with the line break a view adds (`ProseMirror-trailingBreak`). The markup of a forced block shall equal the pages view's. Math shall be drawn as the pages drew it, from the layout's `math` (DOCE-PAGINATION-13.2): on an element with the math views' hooks (`de-math`, `data-display`, `data-state`), its typeset MathML, held to the snapshot's allow-list, or what invalid math shows; math the layout holds no presentation for, not typeset yet, shows its source as `pending`. Inline and display math then take the sizes and the accessible MathML structure the editor shows, in the viewer and in a print drawn from the layout alike. A code block and linked code shall be drawn as the pages' views draw them (DOCE-PAGINATION-11.2): their text as its highlighted tokens inside their line marks, linked code's from its attributes, and, where the layout's block has a gutter, the gutter of line numbers before the code, numbered from its first line, each copy broken where the lines wrap it, the `pre` carrying `--de-code-gutter-digits`.

Implementation: `src/document/print-lines.ts`, `src/document/print-tree.ts`, `src/document/print-pages.ts`, `src/document/print-code.ts`, `src/engine/code-drawing.ts`
Verification: `src/document/print-pages.test.ts`, `e2e/equations-layout.spec.ts`

### DOCE-PAGINATION-13.4 - A print drawn from the layout

`renderLayoutPrintPage(layout, template, options)`, from the server-safe `./document` entry, shall draw a `PagesLayout` as a standalone HTML page without an editor or a DOM: every page with its own header, footer and footnote area, each variable with the value the pages showed, each section in its template scope (its properties and numbering restart) and on its sheet, the ordered lists' starts, each forced block on its computed lines (DOCE-PAGINATION-13.3), the root marked `data-text-layout="pretext"` around an element with the classes of the editor's view, a sheet break after every page but the last, and the links, numbers, images and allow-list of `renderPrintPage` (DOCE-EDITOR-6.27), with the suggestions as the layout's `markup` shows them (DOCE-EDITOR-6.16), which the root's `data-markup` carries; it takes no markup of its own, as the layout's room for the suggestions is that markup's. Printed to PDF, each sheet shall hold its page's computed lines, and print as the editor shows the page (DOCE-EDITOR-6.19) for documents without lists of contents or typeset math, which only a view draws; code and linked code print with their highlighting and gutters.

Implementation: `src/document/print-pages.ts`, `src/document/print-content.ts`, `labs/src/regression/regression-probe.ts`
Verification: `src/document/print-pages.test.ts`, `e2e/print-lines.spec.ts`

### DOCE-PAGINATION-13.5 - Snapshots on the computed lines

A print snapshot (DOCE-EDITOR-6.9) shall keep each forced block's hooks and the root's `data-text-layout`, so each sheet of its PDF holds its page's computed lines, and the print document, laid out for print, draws each forced block on exactly those lines, read from its characters' line boxes, so a line the browser wrapped by itself fails though its text is all there (as for the static render of DOCE-PAGINATION-13.4); a forced block shall keep the number its lines were laid out with rather than take the static number print gives other numbered elements (DOCE-EDITOR-6.22).

Implementation: `src/engine/snapshot.ts`, `src/engine/print-links.ts`, `src/document/print-content.ts`
Verification: `e2e/print-lines.spec.ts`

### DOCE-PAGINATION-13.6 - The read-only viewer

`DocumentViewer` shall show a `PagesLayout` read-only, without an editor, a measuring view or a layout of its own: `de-document-viewer` beside the editor's root class, `data-mode="reading"`, `data-markup` with the layout's markup, whose suggestions it shows as the print does, `data-layout="page"` and `data-text-layout="pretext"`, in the template's properties, around an element with the classes of the editor's view that holds every section and every page as an empty sheet of its section's size. A page in view and `overscan` pages on each side of it (1 by default, fractions rounded down, 0 for negative values or `NaN`, all with `Infinity`) shall be drawn as the print drawn from the layout draws them (DOCE-PAGINATION-13.4), marked `data-drawn`, and a page that leaves that range is emptied again, so the viewer scrolls the whole document with few pages drawn. A page's content shall be drawn as HTML, and its images' addresses asked of the host (`resolveImage`), only when the page first comes into that range, and kept for when it comes back: a viewer opened on 300 pages asks for no image before a page is in view, and a jump to page 150 asks for that page's images alone; the sheets, the numbers, links and anchors of the whole document are worked out when the viewer opens, so a page drawn alone keeps them. A page counts as in view one scrolling-frame height above or below the visible area, measured again if the frame resizes. The frame is the viewer's nearest scrolling ancestor, else the viewport of the document that contains the viewer. A change to the visible range draws and empties only the sheets that enter or leave it, keeping the other sheets untouched. Without an intersection observer in the viewer's window, all sheets draw. New `options` whose own enumerable field names and values are all the same as before shall not draw the pages again, so a host may pass them inline. Its heading, caption and equation numbers shall be the ones the engine laid the pages out with (DOCE-PAGINATION-13.7), so they are the editor's whichever pages are drawn. Each forced block shall show its computed lines, code beside the gutter the pages drew, and each page its computed blocks.

Implementation: `src/components/document-viewer/document-viewer.tsx`, `src/components/document-viewer/nearby-sheets.ts`, `src/document/print-pages.ts`, `labs/src/regression/regression-lab.tsx`, `labs/reference/document.css`
Verification: `src/components/document-viewer/document-viewer.test.tsx`, `src/document/print-pages.test.ts`, `e2e/document-viewer.spec.ts`

### DOCE-PAGINATION-13.7 - The engine's numbers in static pages

The pages' layout (DOCE-PAGINATION-13.2) shall hold each number the pages draw from the engine (DOCE-PAGINATION-11.9), by position: a heading's, and a caption's label or a display equation's number. A static drawing of the layout (the print, the viewer) shall draw them as the pages do, a heading's in `data-number` and the others in `--de-number`, and a print shall keep a number the engine drew rather than take the static number print gives other numbered elements (DOCE-EDITOR-6.22). Drawn from the layout, a page's numbers shall be the editor's whatever pages are drawn with it.

Implementation: `src/pagination/pages-layout.ts`, `src/pagination/engine-numbers.ts`, `src/document/print-pages.ts`, `src/document/print-content.ts`, `src/engine/print-links.ts`, `labs/reference/document.css`
Verification: `src/document/print-pages.test.ts`, `e2e/document-viewer.spec.ts`

### DOCE-PAGINATION-13.8 - Served faces in static pages

With served fonts (DOCE-HOST-1.14.1), the pages' layout shall hold the served faces the pages were measured and drawn with and the served family each generic keyword stands for (`fonts`), and null when the host serves none. A static drawing of the layout shall draw in them: the print drawn from the layout holds each face as an `@font-face` rule with its file inline, under its served family name. Print and viewer resolve the supplied template's fonts from the layout's faces and generic mappings using the same rules as the editor (DOCE-PAGINATION-12.5). The viewer adds the faces to its document while it shows the pages, applying that document's aliases after resolving the fonts (DOCE-PAGINATION-12.8), and takes the faces out again. The handle's snapshots (`exportSnapshot`, `exportSnapshotAsync`) shall hold the same faces inline before the host's stylesheets. A PDF printed from either (DOCE-EDITOR-6.26) shall embed only the served faces, with every page's computed lines on that page.

Implementation: `src/pagination/served-fonts.ts`, `src/pagination/text-engine-holder.ts`, `src/pagination/pages-layout.ts`, `src/pagination/served-template.ts`, `src/document/font-faces.ts`, `src/utils/base64.ts`, `src/document/print-pages.ts`, `src/components/document-viewer/document-viewer.tsx`, `src/components/document-editor/editor-handle.ts`, `src/document/headless-print.ts`
Verification: `src/document/font-faces.test.ts`, `src/utils/base64.test.ts`, `src/document/print-pages.test.ts`, `src/components/document-viewer/document-viewer.test.tsx`, `e2e/document-viewer.spec.ts`, `e2e/print-lines.spec.ts`

### DOCE-PAGINATION-13.9 - Links to pages the viewer has not drawn

A link inside the viewer's pages to an anchor of theirs (a reference to a heading or object, a footnote marker or its entry's number, an abbreviation) shall go to it whether or not its page is drawn: the page holding the anchor is drawn as a page in view is (DOCE-PAGINATION-13.6), the anchor is scrolled into view, and the host page's address is left as it was. The destination counts as in view until its fresh intersection report arrives or another link is followed. A report that it is out of view releases the temporary drawing, even when the scroll did not reach it. Each page drawn from a layout (`drawLayoutPages`) names the anchors it holds. Only a link's ordinary activation is taken over: the main button or Enter with no modifier key, on a click no one cancelled before; a click with Control, Meta, Shift or Alt, or with another button, is left to the browser. A fragment is read percent-decoded, and as written when it does not decode (a literal `%`), the first of the two that names an anchor of the pages.

Implementation: `src/document/print-pages.ts`, `src/components/document-viewer/document-viewer.tsx`
Verification: `src/components/document-viewer/document-viewer.test.tsx`, `e2e/document-viewer.spec.ts`

### DOCE-PAGINATION-13.10 - The pages' language in static pages

The pages' layout shall hold the language the pages were laid out and drawn in (`language`), the one their engine takes (DOCE-PAGINATION-9.7), empty for none. The print drawn from the layout shall carry it as its root's `lang`, as the editor's snapshot carries the language around its pages, and none when it is empty; the viewer shall carry it as its root's `lang`, empty when it is empty, so its pages are drawn in the editor's language whatever the language of the page that holds the viewer.

Implementation: `src/pagination/text-engine-holder.ts`, `src/pagination/pages-layout.ts`, `src/document/pages-layout.ts`, `src/document/print-content.ts`, `src/document/print-pages.ts`, `src/components/document-viewer/document-viewer.tsx`
Verification: `src/pagination/pages-layout.test.ts`, `src/document/print-pages.test.ts`, `src/components/document-viewer/document-viewer.test.tsx`, `e2e/print-lines.spec.ts`

### DOCE-PAGINATION-13.11 - Footnotes drawn on more than one page

A footnote marker the pages draw on more than one page, as a table's repeated header row draws it on each page it repeats on (DOCE-PAGINATION-4.5), shall be numbered in each static drawing of the layout (the print, the viewer) by the page each occurrence is on, under the template's footnote numbering, as the editor's pages number it, and its entry on each of those pages with it. Each page's first marker of the footnote shall link to the entry on its own page and that entry's number back to it: on the first page the footnote is drawn on under its canonical anchors (`fnref-<id>`, `fn-<id>`, DOCE-EDITOR-6.21), on the n-th page under `fnref-<id>~n` and `fn-<id>~n`, so a link goes to the page it is read on. A marker whose page holds no entry of its footnote links to the footnote's first entry; the part of an entry continued from the page before takes no anchor. A snapshot of the pages links them the same way. The footnote's id in the content is the same on every page.

Implementation: `src/engine/footnote-anchors.ts`, `src/document/print-content.ts`, `src/engine/print-links.ts`
Verification: `src/engine/footnote-anchors.test.ts`, `src/document/print-pages.test.ts`, `src/engine/print-links.test.ts`, `e2e/footnote-occurrences.spec.ts`

### DOCE-PAGINATION-13.12 - The layout's inputs and their key

The pages' layout shall record its layout inputs (`inputs`) as short keys with one key of them all (`inputsKey`, `layoutInputsKey`). The font keys shall cover the served faces in their precedence order, with each face's family, weight, style, range and byte hash, and the family each generic stands for. The template key shall hash the resolved template with its portable font family names, sorting object keys at every depth and preserving array order. The keys shall record the host node view types, refused text atom types, and which layout rules keep a heading with its block, end a page, provide a split function, or size a node with a `sizeKey` (DOCE-PAGINATION-14.1). The other keys shall record the installed Pretext and shaper glue releases, the math layouter's key, the language, the suggestion markup, whether code blocks are laid out beside their line numbers, the runtime's segmentation fingerprint (DOCE-PAGINATION-9.15), and the Unicode version of the bidi data.

Equal recorded inputs shall give the same key in any runtime, however they were built. A host can compare the keys of two layouts to learn which recorded input differs. Comparing page breaks also requires the same layout-generated text and the same behavior from custom layout rules, including split functions.

Implementation: `src/pagination/layout-inputs.ts`, `src/pagination/text-engine.ts`, `src/pagination/served-template.ts`, `src/components/document-editor/use-pages-fonts.ts`, `src/pagination/pages-layout.ts`, `src/document/pages-layout.ts`
Verification: `src/pagination/layout-inputs.test.ts`, `src/pagination/text-engine.test.ts`

### DOCE-PAGINATION-13.13 - A host page printed with a viewer on it

While the document that holds a `DocumentViewer` prints, including an iframe's document, from its window's `beforeprint` event to its `afterprint` event or while the `print` media query matches, which a print emulated without the events also changes, including when it already matches as the viewer mounts, the viewer shall draw every page, so none prints as an empty sheet; once the print is done, it shall draw again only the pages in view and their `overscan` neighbours (DOCE-PAGINATION-13.6).

Implementation: `src/components/document-viewer/document-viewer.tsx`
Verification: `src/components/document-viewer/document-viewer.test.tsx`, `e2e/document-viewer.spec.ts`

## DOCE-PAGINATION-14 - Sizes worked out ahead

Every size the pages are laid out with comes from the document's content laid out in the served fonts, from a size stored with an object, or from the host's layout rule, worked out before anything is drawn, so the pages are laid out once and alike on every machine. Nothing is laid out again because something finished drawing.

### DOCE-PAGINATION-14.1 - Host nodes sized by their rules

A layout rule's `size` shall give the box of a node of its type from the node alone (`SizeInput`): the width it is given (a block's width, or the line's width for an inline node), its template section, the pages' language and suggestion markup, and `text`, which measures text as the engine lays out a paragraph or code block of it in the served fonts (`width`, and `lines` wrapped at a width, with their count and height), never the browser. It returns a height, and for an inline node a width and a baseline (its bottom by default). The engine shall lay a block of that type out at that height with no margins of its own and no split measurement, ahead of its own layout of the type and though a host view draws it (such a block is not left to be measured as drawn), and an inline node at that box on its line. A sized block is moved whole: the page layout and a container's split shall never split it, whatever `split` its rule holds. A size shall be kept by node, the exact width, section and markup while the rules' sizes stay the same: rules handed in again with the same `size` functions and `sizeKey`s keep every size regardless of the rule types' order, and another function or `sizeKey` sizes every node of the rules anew; the layout's inputs key names the sized types and their `sizeKey`s (DOCE-PAGINATION-13.12), so a host changes a rule's `sizeKey` whenever its sizes change, the blocks laid out with the last ones laid out again. The first usable box of each type is checked with a second call on the same input; a rule that gives a different box is reported. The check uses the height and, for an inline node, its width and baseline with their defaults applied, regardless of property order or unrelated fields. A rule that throws, or gives no usable size (a height, width or baseline that is not a finite number of 0 or more), is a host error: its node takes no room, and the engine keeps the error by node type (`stats().sizeErrors`), the latest of the type's nodes that still fail: a node's error, kept by its element id so an edit of it replaces it, is cleared once that node sizes well, not when another node of the type does, and once the node is no longer in the document the engine numbered last (taken out, or, without an element id, edited), when the stats are next read; a type's errors go once the rules no longer size it. Reusing a kept size shall also report its failure or clear the node's error after a successful size.

Before reading cached lines or sizes, the engine shall check for updated host rules and markup. A host's inline size takes precedence over built-in text layout for an atom.

Implementation: `src/model/pagination/page-layout.ts`, `src/model/pagination/container-split.ts`, `src/layout-engine/rule-sizes.ts`, `src/layout-engine/blocks/block-layout.ts`, `src/layout-engine/runs.ts`, `src/pagination/host-rules.ts`, `src/pagination/layout-inputs.ts`, `src/pagination/text-engine.ts`, `src/pagination/text-engine-holder.ts`, `src/components/document-editor/start-paging.ts`
Verification: `src/pagination/text-engine.test.ts`, `src/model/pagination/page-layout.test.ts`, `src/pagination/layout-inputs.test.ts`, `src/layout-engine/text-layout.test.ts`, `e2e/layout-rules.spec.ts`, `src/layout-engine/rule-sizes.test.ts`

### DOCE-PAGINATION-14.2 - Sized nodes drawn in their box

Every renderer shall draw a node a layout rule sized in the box the engine laid it out at, so what it draws never moves the pages. The pages shall decorate each such node (`engineObjects`) with `de-object-box`, `data-object-box` (`inline` or `block`) and its box as `--de-object-height`, and for an inline node `--de-object-width` and `--de-object-baseline`, its baseline from the box's top (`objectBoxHooks`), read from the engine as it laid the pages out (`objectOf`); the boxes move with edits that leave every sized node as it was and are read again otherwise, and whenever the engine lays one out at another box after a state was made (`objectsVersion`). Math is placed the same way (`placementsPlugin`, DOCE-PAGINATION-12.11). The pages' layout shall carry each box by position (`PagesLayout.objects`, absent when there is none), and a viewer or print drawn from it shall put the same hooks on the node's element. The reference stylesheet gives the element exactly its box, clipping what it draws: an inline node on its line with its baseline at `--de-object-baseline`, and a block across its column with no margins of its own.

Implementation: `src/engine/object-box.ts`, `src/pagination/engine-placements.ts`, `src/pagination/engine-objects.ts`, `src/pagination/engine-math.ts`, `src/pagination/pages-layout.ts`, `src/document/print-pages.ts`, `labs/reference/document.css`
Verification: `src/pagination/engine-objects.test.ts`, `src/document/print-pages.test.ts`, `e2e/inline-geometry.spec.ts`

### DOCE-PAGINATION-14.3 - Signatures sized ahead

The library's layout rules (`createLayoutRules`) shall size a signature (`signatureSize`) from its node: its name laid out on one line in the font of the template's paragraphs, under the drawing of its strokes (`SIGNATURE_DRAWING`, 120 by 48 pixels) when it holds a vector, over the rule it is signed on (`SIGNATURE_RULE`, 1 pixel), as wide as the drawing or the name, whichever is wider, with its bottom on the line's baseline. The editor's engine shall size nodes by the library's rules with the host's over them (`engineRules`), each host rule replacing the library's for its type whole: a host's `signature` rule with its own `size` sizes signatures, and one without a `size` leaves them to be measured as drawn, as any atom no rule sizes. The reference stylesheet draws the signature in that box: the name in the paragraphs' font, centred, unbroken.

Implementation: `src/model/pagination/signature-size.ts`, `src/model/pagination/page-layout.ts`, `src/components/document-editor/start-paging.ts`, `labs/reference/document.css`
Verification: `src/model/pagination/signature-size.test.ts`, `src/components/document-editor/start-paging.test.ts`, `src/pagination/text-engine.test.ts`, `e2e/inline-geometry.spec.ts`

### DOCE-PAGINATION-14.4 - The one fixed size: what cannot be measured

There shall be no default sizes, with one stated exception (Charles, 2026-11-26): content the served fonts or the math layouter cannot lay out takes a fixed reserved box, the same for the engine and every drawing, and is reported. A grapheme cluster no served face draws whole takes 1 em of its font's size (`UNSERVED_CLUSTER_EMS`, DOCE-PAGINATION-12.4) and is recorded in `problems.missingGlyphs`; an equation the math layouter cannot lay out, because it failed to load, refused its MathML or has no glyph for a character it draws, takes the reserved box of DOCE-PAGINATION-12.9, its characters without a glyph recorded as missing glyphs and refused math told to `refused`. Nothing else takes a size that is not worked out from its content, a stored size or its host rule: math waiting to be typeset, or for the layouter to load or prepare, keeps the pages waiting (DOCE-PAGINATION-10.8) rather than taking a reserved box meanwhile.

Implementation: `src/layout-engine/reserved-boxes.ts`, `src/layout-engine/math-atoms.ts`, `src/utils/math-text.ts`, `src/pagination/math-wait.ts`
Verification: `src/layout-engine/font-files/measurer.test.ts`, `src/layout-engine/math-atoms.test.ts`, `src/pagination/projection-view.test.ts`

### DOCE-PAGINATION-14.5 - Inline images sized ahead

The library's layout rules shall size an inline image (`imageBox`) from its stored width and height, which every image has (DOCE-SCHEMA-3.14), its bottom on its line's baseline, narrowed to its line when wider and scaled whole; a template's own image shall stand across its line, which aligns it, at its image's height, so it sits on a line of its own as it is drawn. The pages draw each image in that box (DOCE-PAGINATION-14.2) and never measure one as drawn.

Implementation: `src/model/pagination/image-box.ts`, `src/model/pagination/page-layout.ts`, `src/model/schema/image-node.ts`
Verification: `src/model/pagination/image-box.test.ts`

### DOCE-PAGINATION-14.6 - What takes no room

Nothing is measured as drawn. A node the engine cannot lay out and nothing sizes shall take no room, never a made-up box, and be reported: a block kept from content the schema does not know (`kept_block`), a block a host's view draws that no rule sizes, words inserted outside a text block (their block is laid out without them, DOCE-PAGINATION-11.11), display math with no layout, and an inline atom nothing sizes. Each is counted in the engine's stats by why (`stats().textLayout`: `refused`, `reasons`) once each time it is laid out, not each time it is read: a top-level block that takes no room is kept by its node and key as a laid block is, the same object on every read until it changes, so the incremental layout does not take it for changed (DOCE-PAGINATION-11.1) and listed by its type and element id with why (`refusedNodes`, `type#id`, the last 100), so a host sees them in the projection's and the editor's stats; a host rule that fails is a host error, reported in `sizeErrors` (DOCE-PAGINATION-14.1).

Implementation: `src/pagination/text-engine-counts.ts`, `src/pagination/text-engine.ts`, `src/layout-engine/blocks/context.ts`, `src/layout-engine/blocks/objects.ts`, `src/pagination/host-rules.ts`
Verification: `src/pagination/text-engine-inputs.test.ts`, `src/layout-engine/blocks/objects.test.ts`, `src/pagination/text-engine.test.ts`
