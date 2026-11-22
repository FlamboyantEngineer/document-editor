# Pagination

The editor lays each section out on pages. A block that does not fit where it falls is split into fragments, one per page: nodes of the block's own type marked as parts by their part number (`splitPartIndex`) and their type's continuation attributes. The stored document and the editing document hold whole blocks only, so joining fragments back is part of the model, and a server joins them the way the editor does. Joins are steps on a transform, so the way from one page layout to another is a transform too, and positions map through it.

## DOCE-PAGINATION-1 - Fragments

### DOCE-PAGINATION-1.1 - Fragment rules

Each splittable node type shall have a fragment rule (`FRAGMENT_RULES`) naming the attribute values of a whole block; a node holding any other value shall be a fragment (`isFragment`). The rules shall cover paragraphs, code blocks, linked code, tables, quotes, bullet and ordered lists, list items and tables of contents.

Implementation: `src/model/pagination/fragments.ts`
Verification: `src/model/pagination/fragments.test.ts`

### DOCE-PAGINATION-1.2 - Joining fragments

`joinFragments(blocks)` shall join each run of fragments into one whole block, in order, by the steps `joinBlocks` and `joinAt` add to a transform. A node shall continue the block before it (`continuesFragment`) when both have the same type, at least one is a fragment, and they share an id or their part numbers follow on. Two whole blocks that share an id shall stay apart. A fragment whose other parts are missing shall become whole on its own. Paragraph fragments shall join their content.

Implementation: `src/model/pagination/fragments.ts`
Verification: `src/model/pagination/fragments.test.ts`

### DOCE-PAGINATION-1.3 - Code

A code block or linked code split at a line break shall join with that line break put back, and shall lose its continued marker and its fragment's first line number.

Implementation: `src/model/pagination/fragments.ts`
Verification: `src/model/pagination/fragments.test.ts`

### DOCE-PAGINATION-1.4 - Tables

A table's fragments shall join their rows in order, without the leading header rows a continuation repeats from the first fragment, so they appear once.

Implementation: `src/model/pagination/fragments.ts`
Verification: `src/model/pagination/fragments.test.ts`, `src/engine/suggested-tables.test.ts`

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

A script block's fragments shall join their output blocks as a quote's do. A layout section's fragments shall join column by column: each column of the later fragment shall join the column at its place in the earlier one, its facing blocks joining when they are one block's fragments, and a column that holds only the empty paragraph a split leaves (DOCE-PAGINATION-4.7) shall give way to the other side's blocks. The later fragment's content moves, so positions in it shall map to where it was.

Implementation: `src/model/pagination/fragments.ts`
Verification: `src/model/pagination/fragments.test.ts`, `src/model/pagination/container-split.test.ts`

## DOCE-PAGINATION-2 - Page layout

### DOCE-PAGINATION-2.1 - Filling pages

`layoutPages(blocks, { pageHeight })` shall lay a section's measured blocks (`LayoutBlock`) out on pages in order, each page taking the blocks that fit its content height less a safety margin of `PAGE_SAFETY_MARGIN_PX`, and every page at least one block (`layoutNextPage` fills one). No blocks shall lay out on no pages.

Implementation: `src/model/pagination/page-layout.ts`
Verification: `src/model/pagination/page-layout.test.ts`

### DOCE-PAGINATION-2.2 - Margins

Blocks on a page shall take their heights plus, between two blocks, the larger of their facing margins (`stackedHeight`); the first block's top margin and the last block's bottom margin shall not count. Measuring shall read the margins at the start and end of the block axis (`margin-block-start`, `margin-block-end`), and, for the node holding a table and its caption (`doc-table-figure`) that a stylesheet leaves a plain block with no border or padding on a side, take the margin its caption or its table passes through that side when it is larger, and the reference stylesheet shall zero those of a page's first and last block, and the end margin of the block ending a list's last item, so no margin inside a list, such as a nested list's, collapses out past the end of a page the list ends; the rule holds in any writing mode.

Implementation: `src/model/pagination/page-layout.ts`, `src/pagination/measure-cache.ts`, `labs/reference/document.css`
Verification: `src/model/pagination/page-layout.test.ts`, `src/pagination/measure-cache.test.ts`, `e2e/regression.spec.ts`

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

A measured code block shall split at the last line break whose lines fit with the block's height beyond its text, which each fragment repeats (`splitCode`, `planCodeSplit`). Neither fragment shall keep the line break, the second shall not be empty, and it shall be marked continued and number its lines on from the first.

Implementation: `src/model/pagination/text-split.ts`
Verification: `src/model/pagination/text-split.test.ts`

### DOCE-PAGINATION-3.4 - Linked code

Linked code shall split the same way by its code, its second fragment numbered on from its start line.

Implementation: `src/model/pagination/text-split.ts`
Verification: `src/model/pagination/text-split.test.ts`

### DOCE-PAGINATION-3.5 - Laid out and joined back

A measured paragraph laid out across pages shall split once per page, and its fragments shall join back into the whole paragraph (DOCE-PAGINATION-1.2).

Implementation: `src/model/pagination/text-split.ts`, `src/model/pagination/page-layout.ts`
Verification: `src/model/pagination/text-split.test.ts`

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

A measured table shall split after its last body row that fits with its height beyond its rows (`splitTableWith`), never inside its leading header rows, never between rows a cell spans (it moves whole when no other row fits), and not when it has one body row. Its second part shall repeat the header rows when its section's `styles.table.repeatHeader` asks for it, or the template's when the section sets none (`createLayoutRules({ repeatTableHeader })`, by default it does); a layout's `rules` may be given by section for it (`SectionLayoutRules`). A table with its caption (`table_figure`) splits as its table does, measured by its table's rows (`splitTableFigureWith`): the first part holds the caption, and each later part an empty caption, not edited, that shows the caption's text (`continuedText`), a part split again showing the text its own shows. Joining shall drop only header rows that repeat the first part's, and a later part's caption. In the reference stylesheet, a later part shall show the table's caption, with its continued suffix, only when it repeats the header rows.

Implementation: `src/model/pagination/table-split.ts`, `src/model/pagination/page-layout.ts`, `src/model/pagination/fragments.ts`, `src/pagination/layout-document.ts`, `src/components/document-editor/start-paging.ts`, `labs/reference/document.css`
Verification: `src/model/pagination/container-split.test.ts`, `e2e/regression.spec.ts`

### DOCE-PAGINATION-4.6 - Script blocks

A measured script block shall split its output between or through its blocks as a quote does, keep with a heading before it, and each fragment shall keep the block's script and settings.

Implementation: `src/model/pagination/page-layout.ts`, `src/model/pagination/container-split.ts`
Verification: `src/model/pagination/container-split.test.ts`, `e2e/layout-rules.spec.ts`

### DOCE-PAGINATION-4.7 - Layout sections

A measured layout section (`ContainerMeasurement`: where each column sits, each with its own blocks' layouts) shall split by splitting every column at the same height (`splitLayoutSection`): a column that fits stays whole on the first fragment, one whose blocks split there splits between or through them, and one with no block that fits moves whole to the second. A column with nothing on one side shall hold an empty paragraph there, marked `continuationPlaceholder` as an item's continuation marks it (DOCE-PAGINATION-4.3). A column's height shall be its blocks' span and its overhead, not the height a grid stretched it to beside a taller column. The section shall not split when no column has a block of its own that fits, or none has one left for the next page; a column that holds only a split's empty paragraph has none, so a section whose column starts with a block taller than a page stays whole on a page of its own rather than splitting page after page. It shall keep with a heading before it.

Implementation: `src/model/pagination/layout-section-split.ts`, `src/model/pagination/page-layout.ts`
Verification: `src/model/pagination/container-split.test.ts`, `e2e/layout-rules.spec.ts`

## DOCE-PAGINATION-5 - Measuring

### DOCE-PAGINATION-5.1 - Measured blocks

`measureChildBlocks(view, pos)` shall measure the blocks a node holds as an editor view laid them out, such as a page's content: each block's height and margins, divided by the view's on-screen `scale`; a text block's text between two content offsets, lazily, as a `TextMeasurement`; linked code's code by character; and where each child of a list, list item, quote or table sits, as a `ContainerMeasurement`, with the children measured the same way. Laid out with these measurements, every page's blocks shall fit its height.

Implementation: `src/pagination/measure-blocks.ts`
Verification: `e2e/pagination.spec.ts`

### DOCE-PAGINATION-5.2 - Containers and host rules

A measured container other than a table, including a script block, a layout section and a layout column, shall carry its `overhead`: how far its first child sits below its top, plus its bottom padding and border. A layout rule's `measure` shall measure its node type from the element it renders as (`MeasureInput`), in place of the built-in measuring, when the rules are passed to the measuring (`MeasureOptions.rules`, and through a projection's `rules`), so a host's own splittable type brings its measure, split and fragment rule. Blocks laid out from measurements shall split across pages, keep headings with what they head, and join back into the measured document.

Implementation: `src/pagination/measure-blocks.ts`, `src/pagination/layout-document.ts`, `src/model/pagination/page-layout.ts`, `labs/src/layout-rules.lab.ts`
Verification: `e2e/pagination.spec.ts`, `e2e/layout-rules.spec.ts`

### DOCE-PAGINATION-5.3 - Measurement cache

Given a cache (`createMeasureCache`), measuring shall reuse a block's measurement while its node is the same, at the node's new position, measure a changed block again, and measure everything again after `clear()`. A cached block that became or stopped being the first or last of its siblings, where styles zero a page's edge margins, shall read its margins again.

Implementation: `src/pagination/measure-blocks.ts`, `src/pagination/measure-cache.ts`
Verification: `src/pagination/measure-blocks.test.ts`

### DOCE-PAGINATION-5.4 - Measuring again what changed size

When the measuring view's content changes size after it was drawn, the pages shall be laid out again once a frame, measuring again only what changed: an element that dispatches the remeasure event (`REMEASURE_EVENT`, such as math once typeset) or an image that loads or fails shall forget the measurement of the block that holds it when that block's height moved by more than 0.01 px (`forgetMeasurement`), and lay nothing out when it did not; an element in no block of the view shall forget every measurement; and a change of the measuring container's width shall forget every measurement (`remeasureOn`), but a width of zero, as when the editor is hidden, shall change nothing. A block holding an image still loading measures provisionally and is not served from the cache, so the next layout measures it again. Measuring shall read styles and frames from the window its views mount in, never the global one.

Implementation: `src/pagination/measure-blocks.ts`, `src/pagination/measure-cache.ts`, `src/pagination/layout-triggers.ts`, `src/pagination/projection.ts`
Verification: `src/pagination/measure-blocks.test.ts`, `src/pagination/layout-triggers.test.ts`

### DOCE-PAGINATION-5.5 - Incremental layout

Given a layout memory (`createLayoutMemory`, `layoutDocument`'s `memory`), laying a section out again shall reuse what the change cannot reach (`layoutSectionIncrementally`): with its page height, its footnote area's measurements and the footnotes shown before it as they were, the pages before the first changed block that read no changed block, and, once a page after the change starts at the same unchanged block, with no fragment before it, at the same page index and with the same footnotes shown before it as a page did before, every page from there. A section that did not change reuses every page, and a block that kept its height lays out only the pages around it. The pages shall always be those a full layout gives. `onSection` tells how many pages each section laid out (`pagesLaidOut`).

Implementation: `src/pagination/incremental-layout.ts`, `src/pagination/layout-document.ts`, `src/pagination/projection-layout.ts`
Verification: `src/pagination/incremental-layout.test.ts`, `src/pagination/projection-view.test.ts`

### DOCE-PAGINATION-5.6 - Fonts

When font faces load in the measuring view's document, every block shall measure again and the pages be laid out again (`remeasureOn`). Given what the measurements wait for (`PagedProjectionOptions.ready`), the pages shall be laid out meanwhile but stay pending until it settles, loaded or failed, and then measure every block again. The document editor's `fonts` adapter (DOCE-HOST-1.14) shall be asked to load the families the template names (`templateFontFamilies`, `loadTemplateFonts`) within `FONT_TIMEOUT` milliseconds (five seconds), or the editor's `fontTimeout`, and the pages wait for it; the editor shows no pages without them (DOCE-EDITOR-4.29). After a delayed font loads, the pages shall hold their content.

Implementation: `src/pagination/layout-triggers.ts`, `src/pagination/fonts.ts`, `src/pagination/projection.ts`, `src/components/document-editor/use-document-layout.ts`
Verification: `src/pagination/layout-triggers.test.ts`, `src/pagination/fonts.test.ts`, `src/pagination/projection-view.test.ts`, `src/components/document-editor/banners.test.tsx`, `e2e/pagination.spec.ts`

### DOCE-PAGINATION-5.7 - Laying out at once

Typing or deleting text inside one textblock shall wait for the writer to pause (DOCE-PAGINATION-7.10), unless it changed its block's height (DOCE-PAGINATION-5.17); any other change to the canonical document, such as Enter, a page break, a footnote, a deletion across blocks, a paste or a drop, shall lay the pages out on the next frame without waiting (`wantsLayoutNow`), and so shall a transaction marked with `layoutNow`. This holds for input on the pages, for what the canonical plugins append to it, and for a change the host shows with the transaction that made it (DOCE-PAGINATION-7.12).

Implementation: `src/pagination/layout-latency.ts`, `src/pagination/projection-session.ts`, `src/pagination/projection.ts`
Verification: `src/pagination/layout-latency.test.ts`, `src/pagination/projection-view.test.ts`

### DOCE-PAGINATION-5.8 - The caret stays in place

When a layout moves the caret of a focused view of the pages on screen, as when its line moves onto the next page, the view's scrolling pane, or the document's, shall scroll by as much once the view draws the new pages, so the caret is back where the writer saw it (`caretPlace`, `keepCaretInPlace`). A view without focus is not scrolled.

Implementation: `src/pagination/caret.ts`, `src/pagination/projection-session.ts`, `src/pagination/projection.ts`
Verification: `src/pagination/caret.test.ts`

### DOCE-PAGINATION-5.9 - Checking the drawn pages

After each layout, the pages the view of the projection drew shall be checked (`findPageOverflow`): a page whose content, footnotes or footer reach more than a pixel below its content box overflows, unless it holds a single block, which may be taller than a page by design. A region or block drawn without a box, such as an empty region its styles hide, reaches nowhere, wherever the page is scrolled. The check runs once the view shows the laid-out pages, also when a layout left them as they were, and not between layouts, so typing does not read every page; its scale is the projection's `scale`. The pages that overflow are counted (`stats().overflowPages`), and once after each change, an overflow shall forget every measurement and lay the pages out again.

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

### DOCE-PAGINATION-5.13 - The measuring view follows the document

The hidden view that measures a whole document shall follow each new one by the smallest replacements (`followDocument`), node by node where the two pair up: a node whose attributes alone changed, such as a header numbered anew when a section gains a page, takes the new attributes and keeps its content, and within a node whose children no longer pair up, only the range that differs is replaced. Every block a change does not reach keeps its node, and with it its rendering and its cached measurement, even when a fresh join of the pages builds it anew.

Implementation: `src/pagination/ghost-view.ts`
Verification: `src/pagination/ghost-view.test.ts`

### DOCE-PAGINATION-5.14 - A block that changed size after it was measured

Each element a block of the measuring view was measured from shall be followed with a resize observer of the view's window (`watchBlockSizes`). When one changes size after it was measured, for a reason the measuring cannot see, such as a host's node view that fills in late or a late style, growing or shrinking, its block alone shall be forgotten when its height moved by more than 0.01 px (`forgetDrifted`), and the pages laid out again once a frame. A first or same-size notification, a block whose node changed since, which its own change lays out, and an element of no size, hidden or gone, shall lay nothing out; an element gone shall no longer be followed.

Implementation: `src/pagination/measure-cache.ts`, `src/pagination/layout-triggers.ts`, `src/pagination/projection.ts`
Verification: `src/pagination/measure-blocks.test.ts`, `src/pagination/layout-triggers.test.ts`, `e2e/pagination.spec.ts`

### DOCE-PAGINATION-5.15 - Images in the measuring view

An image still loading whose box is already fixed, by its width and height attributes or an aspect ratio, shall not make its block provisional, so the block is kept at once. A lazy image in a block being measured shall load at once (`loading` set to `eager`), since the measuring view sits out of sight, where a lazy image never loads; once it loads, its block measures again only when its height moved (DOCE-PAGINATION-5.4).

Implementation: `src/pagination/measure-blocks.ts`
Verification: `src/pagination/measure-blocks.test.ts`, `e2e/pagination.spec.ts`

### DOCE-PAGINATION-5.16 - A block drawn as no element

A block the measured view draws as no element, such as one whose host node view renders none, shall still be laid out, one line of its parent's text tall (its line height, or 24 px when that says none), with no margins, so it is never left out of the pages.

Implementation: `src/pagination/measure-blocks.ts`
Verification: `src/pagination/measure-blocks.test.ts`

### DOCE-PAGINATION-5.17 - Typing that changes a block's height

After typing or deleting text inside one textblock, by the writer or a remote one, the pages shall read, on the next frame, the height the block holding the selection is drawn at on its page and compare it with the height the latest layout gave it (`PageMetric.blocks`). When it moved by more than half a pixel, as when a paragraph gains or loses a line, the pages shall be laid out on that frame, not once the writer pauses. When the writer pauses, the pages shall not be laid out at all when everything typed since the latest layout was text typed or deleted inside paragraphs that had text before and after it, none split across pages, each drawn at the height the layout gave it: they stay as they are, the next layout measures the changed blocks, and the layout state settles as after a layout. Any other change, a block that moved, a heading, an emptied or newly filled paragraph or a split one, lays them out as before. The probe reads one block and the list of pages, never the blocks of other pages, and reads frames from the window the pages mount in.

Implementation: `src/pagination/typing-probe.ts`, `src/pagination/projection-session.ts`, `src/pagination/projection.ts`
Verification: `src/pagination/projection-view.test.ts`, `e2e/pagination.spec.ts`, `e2e/budget-counters.performance.spec.ts`

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

## DOCE-PAGINATION-7 - Showing a document on pages

### DOCE-PAGINATION-7.1 - Laying the pages out

A projection (DOCE-PAGINATION-7.10) shall keep its pages laid out: its ghost, mounted in `measureIn`, renders the whole canonical document and follows it by the smallest replacement, so unchanged blocks keep their rendering and cached measurements; after each change, once the writer pauses for `settle` milliseconds (150 by default, and never more than four times as long after the first change; 0 for every change) and no pointer button is down on the pages, so a layout never lands in the middle of a drag (a press ends on a button's release, a drag's end or drop, or the window losing focus), then on the next frame and never during composition, the pages shall be laid out from it (`layoutDocument`), unless typing kept its blocks at their heights (DOCE-PAGINATION-5.17) and the projection stepped onto them (DOCE-PAGINATION-6.3) in a transaction marked as a layout's (`isPaginationTransaction`) and kept out of the undo history. `refresh({ remeasure })` shall lay the pages out again, forgetting measurements and starting the ghost's plugins over after a width or style change or a change to a value a plugin shows. The ghost shall render with the `nodeViews` and `plugins` the pages render with, and the `ghostPlugins` beside them, so blocks and regions measure as they show. A projection made again, as when the host remounts the editor, gets a new ghost that measures everything again, and a layout due as a projection goes lays nothing out.

Implementation: `src/pagination/projection.ts`, `src/pagination/projection-session.ts`, `src/pagination/projection-layout.ts`, `src/pagination/layout-document.ts`, `src/pagination/layout-triggers.ts`
Verification: `e2e/pagination.spec.ts`, `e2e/document-editor.spec.ts`, `src/pagination/layout-triggers.test.ts`

### DOCE-PAGINATION-7.2 - Room for footnotes

Each page shall leave room for the footnote entries it holds: their measured heights, each with the space before the next but the page's last without it, and the area's own height beyond them (`measureFootnotes`, `footnoteAreaHeight`). An entry shall be on the first page that cites it, unless footnotes are numbered on each page, when each page holds the entries of every footnote it cites. The view of the pages numbers them (`createFootnoteNumbers`, DOCE-FOOTNOTES-2.2): through the document, or from 1 on each page; the numbers follow a change mirrored onto the pages at once, before the pages are laid out again. The ghost view measures with the numbers through the document, which a page's own numbers never outgrow in digits, so a line holding a marker is never measured narrower than the pages draw it and no layout waits on the numbers it draws. A page that holds none leaves no room, and a footnote inserted where its page is full moves the block that no longer fits on before the writer types in it.

Implementation: `src/pagination/layout-document.ts`, `src/pagination/measure-footnotes.ts`, `src/model/pagination/page-projection.ts`, `src/pagination/projection.ts`, `src/engine/footnote-numbers.ts`
Verification: `e2e/pagination.spec.ts`, `e2e/split-paragraphs.spec.ts`, `src/pagination/measure-footnotes.test.ts`, `e2e/objects.spec.ts`, `src/engine/footnote-numbers.test.ts`

### DOCE-PAGINATION-7.3 - A caret in a moving footnote

A selection in a footnote entry that moves to another page shall move with it, at the same place in the entry's text: the selection is the canonical one, which a layout does not move, mirrored onto the page that shows the entry.

Implementation: `src/pagination/selection-mirror.ts`, `src/pagination/projection-session.ts`
Verification: `e2e/pagination.spec.ts`

### DOCE-PAGINATION-7.4 - Layout debugging

Each layout shall keep, until the next change, how each page was filled (`pageMetrics(state)`, `PageMetric`, from `layoutDocument`'s `onPage`): the height it has for its blocks, what they take with facing margins collapsed (`used`) and with every margin counted (`stacked`), the room its header, footer and footnote area take, and each block's height and where it starts below the content's top (`tops`). `createPageDebug({ shown, sheet })` shall show the parts `shown` names (`PageDebugParts`), every length with three decimals (`debugLength`): with `pages`, each page carries its sheet's and its content's width and height when `sheet` gives its section's sheet (`PageDebugSheet`), its header's and footer's room, what its blocks take, collapsed and stacked, the height left and the device pixel ratio of the window it is drawn in (`data-debug-paper`, `data-debug-content`, `data-debug-header`, `data-debug-footer`, `data-debug-used`, `data-debug-stacked`, `data-debug-free`, `data-debug-dpr`); with `blocks`, each region of a page and each block on it carries its node type (`data-debug-type`), and each block its measured height and top (`data-debug-height`, `data-debug-top`), and `data-debug-overflow` when it reaches below the page's room. The document editor's `debug` shows them (DOCE-EDITOR-6.13).

Implementation: `src/pagination/layout-marks.ts`, `src/pagination/layout-document.ts`, `src/pagination/page-debug.ts`, `src/components/document-editor/use-document-layout.ts`
Verification: `src/pagination/page-debug.test.ts`, `e2e/document-editor.spec.ts`

### DOCE-PAGINATION-7.5 - Stats

A projection's `stats()` shall count what its layouts did since it was made (`PaginationStats`), its first layout, run while it is made, included: the layouts run (`layouts`); the blocks measured in the measuring view (`blocksMeasured`), those the cache did not hold (`cacheMisses`) and those taken from it (`cacheHits`); the sections laid out with at least one block measured again (`sectionsRelaid`) and from cached measurements alone (`sectionsReused`); the pages broken from their blocks rather than reused from the layout before (`pagesLaidOut`, DOCE-PAGINATION-5.5); the pages drawn taller than they are (`overflowPages`, DOCE-PAGINATION-5.9); the blocks forgotten alone because their element changed size after they were measured (`blocksDrifted`, DOCE-PAGINATION-5.14); and the pages a layout kept as they were (`pagesReused`) and built anew (`pagesRebuilt`). The transaction a layout moves the projection with carries the counts as they stood after it (`layoutStats(tr)`); any other transaction carries none.

Implementation: `src/pagination/layout-marks.ts`, `src/pagination/pagination-stats.ts`, `src/pagination/measure-cache.ts`, `src/pagination/layout-document.ts`
Verification: `src/pagination/projection-view.test.ts`

### DOCE-PAGINATION-7.6 - Layout state

`layoutState()` shall say whether the pages are `pending`, `settled` or `failed`, and `onLayoutStateChange` tell of each change. A projection is pending from its start, and again on each change, each layout asked for and each `refresh`. Two frames after a layout, once the views that follow the pages have drawn, it is settled when no layout is asked for and no edit waits for one. A layout that throws fails, and so does a layout due after eight layouts in a row moved the pages with no change or `refresh` in between: that layout does not run, and the next change or `refresh` lays the pages out again. `whenSettled()` shall resolve with `settled` or `failed` once no layout is pending.

Implementation: `src/pagination/projection-session.ts`, `src/pagination/layout-readiness.ts`, `src/pagination/layout-triggers.ts`
Verification: `src/pagination/projection-view.test.ts`

### DOCE-PAGINATION-7.7 - The layout

`pageMap(state)` shall give the layout of the document a state shows (`PageMap`), made once for each document and joined by `FRAGMENT_RULES`, or, for a canonical state a projection shows, its pages' layout (DOCE-PAGINATION-7.17); `createPageMap(paged, rules)` shall make one for any paged document. `pages()` shall list its pages in order (`LaidOutPage`): each with its number through the document from 1, its section's index from 0, and its page node and where it starts in the paged document. `pageAt(pos)` shall give the page holding a position in the canonical whole document (DOCE-PAGINATION-6.1), the page after a break that falls inside a block by default and the page before it with `assoc` -1, or null where no page holds it; a footnote entry's position gives the page that shows the entry. `pageOf(elementId)` shall give the first page holding the element with that id, or null. Reading the pages and elements shall not join the pages; the first position mapped does, once.

Implementation: `src/pagination/page-map.ts`, `labs/src/pagination.lab.ts`
Verification: `src/pagination/page-map.test.ts`, `e2e/pagination.spec.ts`

### DOCE-PAGINATION-7.8 - Positions between the pages and the canonical document

`toCanonical(pos)` and `toProjection(pos)` shall map a position between the paged document (the projection) and its canonical whole document (`canonical`) through the page transform's steps, so every position in the content's text maps exactly both ways. A projection position at the end of a textblock shall keep to the text before it unless `assoc` says otherwise; a canonical position where a page break falls inside a block shall map after the break, or before it with `assoc` -1. Positions the transform moves or drops shall be found again at the same offset: inside a footnote entry, in the entry of the same footnote, and inside a header row a table continuation repeats, in the canonical table's row. A position found in neither shall map to null.

Implementation: `src/pagination/page-map.ts`, `src/pagination/page-positions.ts`
Verification: `src/pagination/page-map.test.ts`

### DOCE-PAGINATION-7.9 - Positions kept exact between layouts

The projection map (`ProjectionMap`) shall map positions between a projection and its canonical document as DOCE-PAGINATION-7.8 does, and stay exact as both change between layouts. An edit made on both documents shall extend it by the projection step inverted and the canonical step, paired as mirrors, so positions inside newly inserted content map across. A canonical step mirrored onto the projection shall be placed by its ends; a replacement inside one textblock whose range crosses a page break shall be mirrored page by page, so the pages between keep their footnotes, header and footer; and an edit to a header row a split table repeats shall be made on every copy. On generated documents and layouts, every character shall map both ways, and keep doing so through generated edits made on either side and mirrored onto the other.

Implementation: `src/pagination/projection-map.ts`, `src/pagination/projection-steps.ts`, `src/pagination/page-positions.ts`
Verification: `src/pagination/projection-map.test.ts`

### DOCE-PAGINATION-7.10 - The paged projection

`createProjectionView({ mount, measureIn, state, pageHeight })` shall show a canonical state, the whole document with each section on one page and whole blocks, on pages: a read-only projection view mounted in `mount` shows the paged document, and a hidden ghost view in `measureIn` renders the canonical document, with the same `nodeViews` and `plugins`, to measure it. `mountGhost` shall mount the ghost instead (`MeasuringView`: the view, how it shows a state, drawn before it returns, and how it goes), such as a view that renders React node views; by default it is a plain view (`mountMeasuringView`). After an edit, once the writer pauses (`settle`, as DOCE-PAGINATION-7.1) and never during composition, the pages shall be laid out from the ghost and the projection stepped onto them, with the canonical selection on the side of a page break nearest the projection's. The projection's document shall change only by a layout or by a canonical change mirrored onto it: any other change is input (DOCE-PAGINATION-7.11), or is refused and drawn again when a step does not map onto the canonical state or, taken as the browser made it, would cross a region of a page. Its pages shall always join into the canonical document. `stats()` shall count the layouts (`layouts`), the refused changes (`refused`) and the canonical changes that could not be mirrored and laid the pages out at once (`relaid`); `onLayout` shall be told of each layout. A projection that starts, or starts again, shall start from the canonical selection and dispatch nothing to the canonical state until a view shows its pages.

Implementation: `src/pagination/projection-view.ts`, `src/pagination/projection-layout.ts`, `src/pagination/ghost-view.ts`, `labs/src/spikes/spike-projection.lab.tsx`
Verification: `src/pagination/projection-view.test.ts`, `src/pagination/projection-session.test.ts`, `e2e/spike-projection.spec.ts`

### DOCE-PAGINATION-7.11 - Input on the pages

Input on the projection shall run on the canonical state, which holds the undo history. Enter, Backspace, Delete, paste and the commands given as `keys` shall run as commands on the canonical state (`run`), with the projection's selection mirrored there first; Backspace and Delete delete one character where the browser would, a whole grapheme cluster (a flag, a family emoji, a letter with its accents), as an arrow key at a page break steps over one. Changes the browser makes in the DOM (typing, composition, spellcheck replacements) shall be mapped step by step onto the canonical state and paired with their mirror, so the writer's DOM is not drawn again under them; a selection that only followed such an edit follows it on the canonical state too. An arrow key at a page break inside a split block shall move the caret a character on the canonical text. A cell selection dragged across the parts of a split table shall select cells of the canonical table and be drawn on every part (`selectedCell`); while the pages still show the caret a canonical cell selection is drawn with, as when a menu or the toolbar runs a command on the cells and the document takes the focus back, the cell selection stands and is not replaced by that caret; the drag ends when the button is released, is no longer down as the pointer moves, or the press turns into a native drag, and when the projection goes; and a column resized on one part shall set the canonical table's column, so every part follows; `resizeColumns: false` leaves resizing to the canonical plugins. Each canonical transaction input makes shall go to `dispatch`, and be applied to the canonical state the projection holds with what the canonical plugins append to it, which is shown on the pages at once; beside another writer in a shared room, typing, Enter, Backspace, a mark, undo, redo and paste on the pages each reach the canonical state, the pages and the other writer once. A copy, a cut and a drag shall take the content of the canonical selection the pages' selection stands for, whole blocks with no page, header or footer between them; a slice that is not the selection's, as a dragged node's, shall be taken as the blocks its pages hold. A pasted or dropped slice that holds more than one page of a section, as another view of pages copied it, shall be taken as the blocks of its pages' content, the parts of a split block joined (`contentSlice`), so no paste adds a page to a section.

Implementation: `src/pagination/projection-input.ts`, `src/pagination/selection-mirror.ts`, `src/pagination/graphemes.ts`, `src/pagination/cell-drag.ts`, `src/pagination/projection-view.ts`, `src/pagination/canonical-clipboard.ts`, `src/model/pagination/page-slice.ts`
Verification: `src/pagination/projection-view.test.ts`, `e2e/spike-projection.spec.ts`, `src/pagination/canonical-clipboard.test.ts`, `src/model/pagination/page-slice.test.ts`, `src/pagination/cell-drag.test.ts`, `src/pagination/graphemes.test.ts`, `e2e/table-selection.spec.ts`, `e2e/shared-room.spec.ts`

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

A projection shall tell how its layouts go. `layoutState()`, `whenSettled()` and `onLayoutStateChange` behave as in DOCE-PAGINATION-7.6, including failing when a layout throws or layouts keep moving the pages with no change in between. `refresh({ remeasure })` behaves as in DOCE-PAGINATION-7.1. The ghost's content changing size shall measure again (DOCE-PAGINATION-5.4). `stats()` shall count what its layouts did (DOCE-PAGINATION-7.5), beside `refused` and `relaid`. Each layout's projection transaction shall be marked as a layout's (`isPaginationTransaction`, `layoutStats`), shall record its pages' metrics (`pageMetrics`), and shall be handed to `onLayout`.

Implementation: `src/pagination/projection.ts`, `src/pagination/projection-session.ts`, `src/pagination/projection-layout.ts`
Verification: `src/pagination/projection-view.test.ts`

### DOCE-PAGINATION-7.17 - DocumentEditor on the projection

DocumentEditor shall keep `state` as the whole document, each section on one page, and render a paged projection of it (DOCE-PAGINATION-7.10) measured by a ghost view. The ghost shall render the host's React node views (`nodeViews`, read when the pages mount) as the pages do, under the editor's context (`useDocumentEditor`), so a block they draw takes the room it shows; it mounts once React has committed, as a React root of its own. The ghost shall run the editor's plugins except proofing and search, whose marks take no room, and any plugin whose spec says `measured: false`, such as the shared document's sync (DOCE-COLLAB-4.1), whose view must run once. Input on the pages shall become canonical transactions that pass through the editor's dispatch body (suggestions, proofing) to `onStateChange`; a transaction the host does not commit, or one made on a state the host no longer holds, shall be taken back off the pages: one the host does not commit back to the state before it, not to the state React last drew, which may predate a selection the pages have sent since, as a key extending it. Each state the host commits shall be shown on the pages (DOCE-PAGINATION-7.12). The toolbar, menus, dialogs, table handles, the host's events and the editor's own view props shall see the canonical view (DOCE-PAGINATION-7.14), and layouts shall be told as the pagination's are (DOCE-PAGINATION-7.16). The editor's plugin views shall run on the canonical view and be updated when the pages are drawn again as well as when the state changes, so a code block's highlights (DOCE-OBJECTS-3.3) are painted on the pages shown, every part of a split block included. The layout's plugins that read the pages, page debugging (DOCE-PAGINATION-7.4) and page variables (DOCE-PAGINATION-8.2), shall run on the pages, and draw them again when what they show changes. The pages shall wait for the template's fonts (DOCE-PAGINATION-5.6), and each layout shall start from what the one before found. `pageMap` of a canonical state the projection shows shall be the layout of its pages, so what counts pages, such as the status bar, counts the pages shown. A canonical caret at a page break shall go to the side of the break that stands for its position, so a caret after the line break a split code block dropped sits at its continuation's start. A caret at a code fragment's end shall stand for the place before that line break, so Delete there removes it. The browser's selection not reported yet shall be read before a layout draws the pages again (DOCE-EDITOR-1.4), but only while the pages show the canonical document, so a change that could not be mirrored keeps the caret it placed. A state of another schema, as a document swapped in or a template previewed, shall start the projection over.

Implementation: `src/components/document-editor/use-paged-projection.ts`, `src/pagination/canonical-plugins.ts`, `src/engine/code-highlighting.ts`, `src/components/document-editor/start-paging.ts`, `src/components/document-editor/use-document-layout.ts`
Verification: `src/components/document-editor/use-paged-projection.test.ts`, `e2e/projection-editor.spec.ts`, `e2e/regression.spec.ts`

### DOCE-PAGINATION-7.18 - The pages' layout without joining them

The layout of a canonical document a projection shows (`pageMap`, DOCE-PAGINATION-7.17) shall map its positions through the map the projection keeps between its pages and that document (DOCE-PAGINATION-7.9), so reading pages and positions on each keystroke joins no pages; `createPageMap(paged, rules, positions)` shall do so for any paged document whose positions are known. Only a document the pages do not show exactly, as while an edit typed on the pages is on its way to the canonical state, shall map through the page transform, and a document shown before keeps the pages it was shown on. Joining a section's pages shall join them in pairs, round after round, so each block is copied a number of times that grows with the log of the pages, and the fragments that meet shall then join in time linear in the blocks; measuring a parent's blocks shall find each block's element from the one before it.

Implementation: `src/pagination/page-map.ts`, `src/pagination/projection-session.ts`, `src/model/pagination/fragments.ts`, `src/model/pagination/page-transform.ts`, `src/pagination/block-elements.ts`
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

A click or key that comes right after the editor takes focus, on the pages or in the web layout, shall keep its selection on a busy page. The view takes focus itself and makes one check of the selection the browser shows, twenty milliseconds on, in place of the engine's own: when a press on the view brought focus or input came after it, the check reads the browser's selection, so that nothing draws the view's older selection back over a key the browser has acted on but not yet reported; a focus with no input, such as one from the keyboard or the host, keeps the view's selection, as before.

Implementation: `src/utils/dom-selection.ts`, `src/components/document-editor/editor-body.tsx`
Verification: `src/utils/dom-selection.test.ts`, `e2e/caret-keys.spec.ts`, `e2e/presence.spec.ts`

### DOCE-PAGINATION-7.23 - Inline atoms at a paragraph's edge

On the pages, text typed with the caret after an inline atom that ends its paragraph, such as an abbreviation, shall go after the atom, in what the pages show and in the document; and Backspace at the start of a paragraph holding only one inline atom shall join it into the paragraph before, keeping that paragraph's text and exactly one atom.

Implementation: `src/components/document-editor/pages-view.tsx`
Verification: `e2e/references.spec.ts`

### DOCE-PAGINATION-7.24 - The first key after a click

The first key or character the writer types right after a click, on the pages or in the web layout, shall act at the caret the click placed, without waiting for the browser to report it: whether the click brought focus or the editor had it, and before any selection change from the click reaches the document.

Implementation: `src/utils/dom-selection.ts`, `src/components/document-editor/use-editor-engine.ts`, `src/components/document-editor/pages-view.tsx`
Verification: `src/utils/dom-selection.test.ts`, `e2e/caret-keys.spec.ts`

## DOCE-PAGINATION-8 - Page headers and footers

### DOCE-PAGINATION-8.1 - Room for headers and footers

`pageHeight` shall be a section's page height inside its margins. Each page of a section shall leave room for its header and footer as the measuring view renders them, with their margins, so content never runs into them; a region the view hides shall take none.

Implementation: `src/pagination/layout-document.ts`
Verification: `e2e/page-regions.spec.ts`

### DOCE-PAGINATION-8.2 - Page variables

`createPageVariables({ value })` shall show the value of each variable in a page header or footer inside it: `page.current` the page's number, `page.total` the document's page count, and any other key the host's `value`, or nothing. `refreshPageVariables(view)` shall show the values again after a host value changed, outside the undo history.

Implementation: `src/pagination/page-variables.ts`
Verification: `src/pagination/page-variables.test.ts`, `e2e/page-regions.spec.ts`

### DOCE-PAGINATION-8.3 - Variables in the text

The plugin shall show the variables in the document's text too, `page.current` by the page they are on, counted through the document, and `page.total` the document's page count; and `date.current` shall show today's date (`now`), written long in the plugin's `locale`, wherever it is.

Implementation: `src/pagination/page-variables.ts`
Verification: `src/pagination/page-variables.test.ts`

### DOCE-PAGINATION-8.4 - Variables in the editor

`DocumentEditor` shall show page variables in both layouts, and in the view it measures in, with the values of the host's `variables` adapter (DOCE-HOST-1.12); when the adapter says a value changed, it shall show the values again, outside the undo history, and lay the pages out again. Page numbers shall be read from the layout's pages (`createPageMap`).

Implementation: `src/components/document-editor/use-document-layout.ts`, `src/pagination/page-variables.ts`
Verification: `src/components/document-editor/document-editor.test.tsx`

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

## DOCE-PAGINATION-9 - Text layout engine

The text layout engine (`src/layout-engine/`) lays a text block's lines out from its template typography with Pretext, without the DOM. Its line table is the one result calculation, editing, the viewer and print share: the renderer draws exactly its lines. It measures in Chromium's profile. Until the editor lays out with it, behind a `textLayout: 'pretext'` option that is off by default, the editor measures as DOCE-PAGINATION-5 says.

### DOCE-PAGINATION-9.1 - The line table

`createTextLayout(options).layoutText(node, place)` shall lay a paragraph, a heading, a code block or a footnote entry out at the place's width and return its line table (`LineTable`): at least one line, an empty block's line as tall as its leading; each line's start and end as content offsets, which tile the content (a line ends where the next starts, the last at the content size); its width without the spaces that hang past its end, where it starts from the left content edge, its top and its height; and whether it wraps, ends at a hard break or ends the block. The table's height is its lines' together, and its `overhead` the block's padding above and below. Lengths are CSS pixels at a zoom of 1. The engine shall count the text runs it found prepared and those it prepared (`stats()`).

Implementation: `src/layout-engine/line-table.ts`, `src/layout-engine/text-layout.ts`, `src/layout-engine/lines.ts`
Verification: `src/layout-engine/text-layout.test.ts`

### DOCE-PAGINATION-9.2 - Typography from the template

A text block's typography (`typography(node, scope)`) shall be its template scope's (a section's styles over the template's): a paragraph the paragraph style, a heading its level's, the document's title the title style, a code block the code style; a custom style (`className`) over a paragraph shall set what it sets, its weight and slant else normal, and over a heading only its size and slant. Unset values shall take the reference stylesheet's fallbacks: a serif 12px paragraph at a line height of 1.5, headings from 2em down to 0.9em at 1.2, a 24px title, monospace code at 1.4 with 8px of padding. Relative lengths shall resolve against the paragraph's size (`rem` against 16px), lengths snap to the nearest 1/64 px, and a leading, the size times the line height, is truncated to 1/64 px, as Chromium's line box is. A family the host serves (`fontStacks`) shall be measured in the stack it names.

Implementation: `src/layout-engine/typography.ts`
Verification: `src/layout-engine/typography.test.ts`

### DOCE-PAGINATION-9.3 - Marks

Text shall be measured in its marks' fonts, applied outermost first in the schema's mark order: strong text a bolder weight (CSS `bolder`), emphasis italic, inline code the code style's family and size (the size around it when the style sets none) with 3px of padding on each side of each line it reaches, a line that ends inside it fitting without its end padding as Chromium fits a cloned box, and subscript and superscript at the size around them divided by 1.2. Each text node shall be measured as its own item, as Chromium rounds each element's piece of a line to its layout unit, kerning still counting across neighbours in the same font; a line ending in a link or underlined text shall fit its last letter's full width, as Chromium places a decorated line's end exactly. Marks that change only decoration change nothing. The renderer draws sub- and superscripts without growing the line and inline code with its padding on every line (`box-decoration-break: clone`).

Implementation: `src/layout-engine/typography.ts`, `src/layout-engine/runs.ts`
Verification: `src/layout-engine/typography.test.ts`, `src/layout-engine/text-layout.test.ts`

### DOCE-PAGINATION-9.4 - White space and hard breaks

Text shall be laid out as `white-space: pre-wrap` with `overflow-wrap: break-word`, as the pages draw it: runs of spaces and tabs kept, spaces hanging at a line's end, and a word longer than a line broken. Each hard break shall end a line, and a block that ends with one shall have an empty last line after it.

Implementation: `src/layout-engine/runs.ts`, `src/layout-engine/lines.ts`
Verification: `src/layout-engine/text-layout.test.ts`

### DOCE-PAGINATION-9.5 - Prefixes and inline atoms

A place's `prefix`, such as a heading's number with its space, shall be laid out in the block's font before the content on its first line, taking no content offset. A template variable shall be laid out as its text on one line. Any other inline node shall take the box its `measureAtom` option gives it, drawn on one line, and sit on the baseline at its own baseline, or at its bottom when it gives none. A line shall be as tall as the block's strut (the font's ascent and descent rounded to whole pixels, with half the rest of the leading above and half below), grown by the atoms that reach above or below it. Without a size the block shall not be laid out, and the reason is given.

Implementation: `src/layout-engine/runs.ts`, `src/layout-engine/lines.ts`, `src/layout-engine/metrics.ts`, `src/layout-engine/text-layout.ts`
Verification: `src/layout-engine/text-layout.test.ts`

### DOCE-PAGINATION-9.6 - Alignment and padding

A line shall start at the block's left padding plus, when the block is centred, half the room its line leaves, and when right-aligned, all of it; a justified line starts at the edge. A code block's lines shall be laid out inside its 8px padding.

Implementation: `src/layout-engine/lines.ts`, `src/layout-engine/text-layout.ts`
Verification: `src/layout-engine/text-layout.test.ts`

### DOCE-PAGINATION-9.7 - Served fonts and language

Given `isFontServed`, a block whose font's first family, or whose inline code's, is not served shall not be laid out, with the reason, so no system font decides a line. Lines shall break by the rules of the document's `language`.

Implementation: `src/layout-engine/text-layout.ts`, `src/layout-engine/lines.ts`
Verification: `src/layout-engine/text-layout.test.ts`

### DOCE-PAGINATION-9.8 - Splitting at computed lines

A line table as a text measurement (`lineTableMeasurement(table, offset)`) shall give a range's height and lines from the lines it touches, and carry the lines, so a paragraph splits at the start of its first line that does not fit, keeping at least two lines in each fragment and the trailing lines it is asked for.

Implementation: `src/layout-engine/text-layout.ts`, `src/model/pagination/text-split.ts`
Verification: `src/layout-engine/text-layout.test.ts`, `src/model/pagination/text-split.test.ts`

### DOCE-PAGINATION-9.9 - Heading and paragraph numbers

`documentNumbers(doc, template)` shall give, by block position, each numbered heading's number with the space after it, as its scope's heading numbering shows it (`numberedHeadings`), and each numbered paragraph's number, level and level positions, counted as the paragraph numbering counts them (DOCE-NUMBERING-6). A heading's number shall be laid out as its place's `prefix`. A paragraph given its `number` shall start its first line at the number position, with the number in a box as wide as the gap to the text position or as the number and a space, whichever is wider, and its other lines at the text position: the level's, or after the indentation (20pt a level below the first, else the paragraph style's), the number position and the room the label reserves in widths of the font's zero.

Implementation: `src/layout-engine/numbers.ts`, `src/engine/paragraph-numbering.ts`, `src/layout-engine/text-layout.ts`, `src/layout-engine/lines.ts`
Verification: `src/layout-engine/numbers.test.ts`

### DOCE-PAGINATION-9.10 - Footnote entries

A footnote entry's typography shall be its scope's footnote text style (`resolveFootnoteSettings`), with no margins of its own (the footnote area sets entries apart): unset, the paragraph's family at 10px, a weight of 400 and a line height of 1.4. A place's `footnoteNumber` shall be laid out before the content on the first line, in the marker style (unset: the entry's family at 0.85 of its size, a weight of 600, upright), followed by the numbering suffix and a quarter of the marker size; a marker family that is not served refuses the block. The renderer draws the number and the entry text in these fonts, so an entry's inherited family is the paragraph's, not the page's.

Implementation: `src/layout-engine/typography.ts`, `src/layout-engine/footnote-marker.ts`, `src/layout-engine/text-layout.ts`, `src/layout-engine/runs.ts`
Verification: `src/layout-engine/footnote-marker.test.ts`

## DOCE-PAGINATION-10 - Block geometry and measured atoms

Behind the editor's `textLayout: 'pretext'` option, block geometry lays blocks out with no DOM, from the text layout engine's lines (DOCE-PAGINATION-9), the atom cache and the template's numbers, in the shapes the DOM measuring gives the page layout (DOCE-PAGINATION-5.1), so the page packer and the splitters read them unchanged. The rendered document follows these numbers: a stylesheet that draws blocks otherwise changes `blockMetrics` with it.

### DOCE-PAGINATION-10.1 - The atom cache

`createAtomCache({ measure })` shall size what only the browser can size (an equation, an unsized image, an embed, a block drawn from stored markup) through the host's measurer once, and keep the size by the atom's content: its type, the attributes that show (element ids, authors and split parts left out), its marks, its content and the width it is laid out in, to Chromium's layout unit. `measureAtom(node)` shall give an inline atom's size and baseline, for the text layout engine; `measureBlockAtom(node, width)` a block atom's. An atom the measurer cannot size shall have no size, and the cache shall keep the most recently used atoms up to its limit.

Implementation: `src/layout-engine/atoms.ts`
Verification: `src/layout-engine/atoms.test.ts`

### DOCE-PAGINATION-10.2 - Measuring atoms in the DOM, and sizes that may change

`createDomAtomMeasurer({ host })` shall draw an atom in the host element, as the schema's markup or the host's `render`, at the width it is laid out in, read its box, and remove it; an inline atom shall stand on a line, its baseline read from an empty image beside it. An atom with an image that still loads without a fixed box shall have a provisional size: the block holding it shall be laid out as provisional, and when the images have loaded the cache shall keep the final size and tell its listeners (`subscribe`). A failed load shall keep the size drawn while loading, as final.

Implementation: `src/layout-engine/atoms.ts`, `src/layout-engine/dom-atoms.ts`
Verification: `src/layout-engine/atoms.test.ts`, `src/layout-engine/dom-atoms.test.ts`, `src/layout-engine/blocks/objects.test.ts`

### DOCE-PAGINATION-10.3 - Text blocks and containers

`createBlockLayout({ text, atoms, metrics, labelOf })` shall give each block its height, margins and the measurement its split reads (`layoutBlock(node, { width, scope, region })`), or name the node it cannot lay out yet and why, the same each time. A text block shall take its lines and margins from the text layout, a caption its label (`labelOf`) before its text; a paragraph in a list item or a table cell, and any block in a header or footer, no margins. Children shall stack with adjoining margins collapsed to the larger, a container without padding or border at an edge letting its first or last child's margin through as its own, as the stylesheet's block flow does. A list shall indent its items by the template's indentation with the template's spacing, the last block of its last item without a bottom margin, and a checklist item keep its blocks' margins inside it; a quote shall stand 40px in on each side with 16px margins, the browser's own; an embed's content and a script block's output shall stack as they stand; a layout section shall set its columns side by side at their preset's tracks less the 4px gaps, each column padded 5px inside a 1px border, its edge blocks without their outer margins, and as tall as the tallest. Containers shall carry where each child sits and their `overhead` (`ContainerMeasurement`).

Implementation: `src/layout-engine/blocks/block-layout.ts`, `src/layout-engine/blocks/context.ts`, `src/layout-engine/blocks/stack.ts`, `src/layout-engine/blocks/text-blocks.ts`, `src/layout-engine/blocks/containers.ts`, `src/layout-engine/blocks/metrics.ts`, `src/layout-engine/blocks/types.ts`
Verification: `src/layout-engine/blocks/containers.test.ts`, `src/layout-engine/blocks/block-layout.test.ts`

### DOCE-PAGINATION-10.4 - Figures, code, equations and rules

A figure shall take the image box its stored size fixes (narrowed to the width at its own height, or scaled to the width when set to the page's width) or else its measured atom, and its caption across the content width unless switched off, with the paragraph's bottom spacing. Code with its caption shall be one box padded as the code is, holding the caption above or below the code with 4px of space either side of a 1px rule, measured by its code's lines. A display equation shall be a measured atom with 6px margins; a horizontal rule 2px tall with 8px margins; a page break no height; a kept block or a dynamic template a measured atom.

Implementation: `src/layout-engine/blocks/objects.ts`
Verification: `src/layout-engine/blocks/objects.test.ts`

### DOCE-PAGINATION-10.5 - Tables

A table's columns shall keep their stored widths, columns without one sharing what is left equally, with one outer border added to the sum; a table without a width for every column shall span its place; an aligned table's columns without a width shall take 100px, and one set to the page's width shall be scaled to it; a table too wide shall be scaled to fit. The rendered table takes these widths. Each cell shall be laid out in its columns' width less its padding and the halves of its side borders (none in a header or footer), each row shall be as tall as its tallest single-row cell or a cell's row height, a cell spanning rows adding what it lacks to the last row it spans, with half a border above the first row and below the last; the border class shall set which lines are drawn. A table's caption shall stand above or below it within the table's width, 2px padded, unless switched off. The table shall be measured by its rows, for the table split.

Implementation: `src/layout-engine/blocks/tables.ts`, `src/layout-engine/blocks/table-columns.ts`
Verification: `src/layout-engine/blocks/tables.test.ts`

### DOCE-PAGINATION-10.6 - Headers, footers and footnote areas

`layoutRegion(node, place)` shall give a page header or footer its blocks stacked without margins, at least the template's height for it, and the template's spacing between it and the content; and a footnote area its entries under the separator (none when switched off) and the template's spacing to content, the entries the template's entry spacing apart. An empty region shall take no height.

Implementation: `src/layout-engine/blocks/regions.ts`
Verification: `src/layout-engine/blocks/regions.test.ts`

### DOCE-PAGINATION-10.7 - Numbers counted by the engine

A page out of view is not drawn, so a CSS counter there counts nothing. `blockNumbers(doc, template)` shall give, by node, each shown caption's label with the `-` after it (numbered by kind as the lists of contents number it, each section by its scope, restarting where a section restarts numbering; a caption switched off gets none and counts out), each ordered list item's marker (from the list's start, each list on its own, in the template's list format, prefix and suffix, else `1. `), and each footnote marker's and entry's number. The atom cache shall keep an atom by the text a view draws in it (`shownOf`), and the DOM measurer shall draw that text in a leaf atom, so a footnote marker is measured with its number; block geometry shall lay each footnote entry out with its number (`footnoteOf`), which the text layout engine draws before it (DOCE-PAGINATION-9.10). Heading and paragraph numbers come from the text layout engine (DOCE-PAGINATION-9).

Implementation: `src/layout-engine/blocks/numbers.ts`, `src/layout-engine/atoms.ts`, `src/layout-engine/dom-atoms.ts`, `src/layout-engine/blocks/text-blocks.ts`
Verification: `src/layout-engine/blocks/numbers.test.ts`, `src/layout-engine/atoms.test.ts`, `src/layout-engine/dom-atoms.test.ts`, `src/layout-engine/blocks/regions.test.ts`

## DOCE-PAGINATION-11 - The layout engine on the pages

Behind the editor's `textLayout: 'pretext'` option, off by default, the pages are laid out and drawn with the text layout engine (DOCE-PAGINATION-9, DOCE-PAGINATION-10) in place of the DOM's measuring. The engine's module loads only when the option is on. The web layout keeps the DOM's lines.

### DOCE-PAGINATION-11.1 - Measuring with the engine

With the option on, the paged projection shall load the engine with its first layout and make it again for each template the pages are laid out with. Each top-level block of a section's page content shall take its height, margins and split measurement from the engine, in the section's content width, kept by node, its heading or paragraph number and its section; a block with a layout rule of its own, or one the engine cannot lay out yet, shall be measured in the DOM as before, with the reason counted in the projection's `stats().textLayout`. When atoms that were still loading settle, the engine shall forget what it kept and the pages be laid out again. The engine shall take text widths from one injectable source (`measureContext`), by default a Canvas measuring unhinted (`geometricPrecision`), and fit lines in the device pixels of the window the pages show in; the pages shall then draw their text unhinted too (`text-rendering: geometricPrecision` in the reference stylesheet), since hinted widths differ by script.

Implementation: `src/pagination/text-engine.ts`, `src/pagination/text-engine-holder.ts`, `src/pagination/measure-blocks.ts`, `src/pagination/layout-document.ts`, `src/pagination/projection.ts`
Verification: `src/pagination/text-engine.test.ts`, `src/pagination/measure-blocks.test.ts`, `e2e/text-layout.spec.ts`

### DOCE-PAGINATION-11.2 - Forced lines

With the option on, the pages shall draw each top-level paragraph and heading the engine lays out on the engine's lines, so the browser chooses no line break in them. The block shall carry `de-forced-lines`, `data-lines` with its number of lines and, for a numbered heading's first part, `data-number` with the engine's number; each line that wraps shall end at its last character, marked `de-forced-lines__end`, which the stylesheet draws followed by a line feed, never cutting a character in two; a line that starts in from the content edge, as a centred or right-aligned one, shall start with `de-forced-lines__start` and `--de-line-indent`; a wrapped justified line shall carry `de-forced-lines__justified` and the `--de-word-spacing` that fills it. Numbered paragraphs are still drawn on the browser's lines. The decorations shall be drawn on the pages' own view and kept by node, so a keystroke lays out only the block it changed again and every other block keeps its decorations.

Implementation: `src/pagination/forced-lines.ts`, `labs/reference/document.css`
Verification: `src/pagination/forced-lines.test.ts`, `e2e/text-layout.spec.ts`

### DOCE-PAGINATION-11.3 - The computed lines

The editor handle's `textLines()` shall give, page by page, each top-level paragraph and heading with its element id, its part, its position, where its content starts in the whole block, and the lines the engine computed for it on that page, as offsets in the whole block with their text; or no lines and the reason when the browser draws it. Without the option it shall give no pages.

Implementation: `src/pagination/text-lines.ts`, `src/components/document-editor/editor-handle.ts`
Verification: `src/pagination/forced-lines.test.ts`, `e2e/text-layout.spec.ts`

### DOCE-PAGINATION-11.4 - The guard on forced lines

`findWrappedLines(root)` shall give each forced block whose drawn lines differ in number from its computed ones, as when the browser wrapped a line by itself, with its element id and both counts. It reads every forced block's boxes, so tests and development call it, not each layout.

Implementation: `src/pagination/layout-validation.ts`
Verification: `src/pagination/layout-validation.test.ts`, `e2e/text-layout.spec.ts`

### DOCE-PAGINATION-11.5 - Typing with the engine

The stress lab's typing measurement shall also run with the option on at 40 and 300 pages and record each keystroke's time. Until the pages' DOM walk per key is reduced, these times are recorded and not yet held to the typing budgets.

Implementation: `labs/src/stress/stress-lab.tsx`, `e2e/budgets.ts`
Verification: `e2e/performance.spec.ts`
