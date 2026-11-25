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

A code block or linked code split at a line break shall join with that line break put back, and shall lose its continued marker and its fragment's first line number.

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

Blocks on a page shall take their heights plus, between two blocks, the larger of their facing margins (`stackedHeight`); the first block's top margin and the last block's bottom margin shall not count. Measuring shall read the margins at the start and end of the block axis (`margin-block-start`, `margin-block-end`), truncated to 1/64 px as Chromium lays them out where a computed style gives the length it resolves (`layoutMargin`: 9.333px is 9.328125px), and, for any block that a stylesheet leaves a plain block with no border or padding on a side, take the margin its first or last child in its flow passes through that side when it is larger, down through children that pass theirs (a table's caption or table, a script's output, a template block's markup), skipping hidden, inline, floated and positioned children, and the reference stylesheet shall zero those of a page's first and last block and of a block whose margin passes through to that edge, the first or last block of a quote, a list or a list item there (to three levels), last in the sheet so no block's own margin wins over it, and the end margin of the block ending a list's last item, so no margin inside a list, such as a nested list's, collapses out past the end of a page the list ends; the rule holds in any writing mode.

Implementation: `src/model/pagination/page-layout.ts`, `src/pagination/measure-cache.ts`, `src/pagination/measure-scale.ts`, `labs/reference/document.css`
Verification: `src/model/pagination/page-layout.test.ts`, `src/pagination/measure-cache.test.ts`, `src/pagination/measure-scale.test.ts`, `e2e/regression.spec.ts`, `e2e/pretext-pagination-stress.spec.ts`

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

A measured code block shall split at the last line break whose lines fit with the block's height beyond its text, which each fragment repeats (`splitCode`, `planCodeSplit`). Neither fragment shall keep the line break, the second shall not be empty, and it shall be marked continued and number its lines on from the first. A later fragment's caption, which shows the caption's text and holds none (DOCE-PAGINATION-1.1), shall be as tall as that text and the continued suffix are laid out after its label: the code figure's measurement carries how much taller that is than the caption (`continuedCaption`), which the held split adds to each later fragment's height and to the height it repeats (DOCE-PAGINATION-11.2); the reference stylesheet hides its empty text's trailing break, which would start a second line.

Implementation: `src/model/pagination/text-split.ts`
Verification: `src/model/pagination/text-split.test.ts`

### DOCE-PAGINATION-3.4 - Linked code

Linked code shall split the same way by its code, its second fragment numbered on from its start line. Its box shall take the code's margins and its code none, so the margins are measured, packed and dropped at a page's edges as a code block's are.

Implementation: `src/model/pagination/text-split.ts`
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

A measured table shall split after its last body row that fits with its height beyond its rows (`splitTableWith`), never inside its leading header rows, never between rows a cell spans (it moves whole when no other row fits), and not when it has one body row. Its second part shall repeat the header rows when its section's `styles.table.repeatHeader` asks for it, or the template's when the section sets none (`createLayoutRules({ repeatTableHeader })`, by default it does); a layout's `rules` may be given by section for it (`SectionLayoutRules`). When a header cell spans into the body, the continuation shall omit the header group so its body rows keep their original grid. A continuation split again shall keep the actual number of repeated header rows, including zero even if it starts with a body row made of header cells. The continuation draws the source table's column widths while keeping each body cell's stored attributes. A table with its caption (`table_figure`) splits as its table does, measured by its table's rows (`splitTableFigureWith`): the first part holds the caption, and each later part holds an empty caption. When it repeats header rows, the later part shows the original caption through `continuedText`. A later part without repeated headers shall have null `continuedText` and no caption height, including when its first body row is made of header cells or the part is split again. Joining shall drop only header rows that repeat the first part's, and a later part's caption. In the reference stylesheet, a later part shall show the table's caption, with its continued suffix, only when it repeats the header rows. A held table's measurement shall carry its caption's box (`caption`, from the DOM measuring and from block geometry alike), which each later part with repeated header rows shall keep, and, from block geometry, how much taller a later part's caption, showing the caption's text and the continued suffix, is (`continuedCaption`), which each later part showing its caption takes too, and one without repeated headers does not.

Implementation: `src/model/pagination/table-split.ts`, `src/pagination/measure-blocks.ts`, `src/layout-engine/blocks/tables.ts`, `src/model/pagination/page-layout.ts`, `src/model/pagination/fragments.ts`, `src/pagination/layout-document.ts`, `src/components/document-editor/start-paging.ts`, `labs/reference/document.css`
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

Given a layout memory (`createLayoutMemory`, `layoutDocument`'s `memory`), laying a section out again shall reuse what the change cannot reach (`layoutSectionIncrementally`): with its page height, each page's measured header and footer heights, its footnote area's measurements and the footnotes shown before it as they were, the pages before the first changed block that read no changed block, and, once a page after the change starts at the same unchanged block, with no fragment before it, at the same page index and with the same footnotes shown before it as a page did before, every page from there. A section that did not change reuses every page, and a block that kept its height lays out only the pages around it. The pages shall always be those a full layout gives. `onSection` tells how many pages each section laid out (`pagesLaidOut`).

Implementation: `src/pagination/incremental-layout.ts`, `src/pagination/layout-document.ts`, `src/pagination/projection-layout.ts`
Verification: `src/pagination/incremental-layout.test.ts`, `src/pagination/layout-document.test.ts`, `src/pagination/projection-view.test.ts`

### DOCE-PAGINATION-5.6 - Fonts

When font faces load in the measuring view's document, every block shall measure again and the pages be laid out again (`remeasureOn`). With `textLayout: 'pretext'`, the text layout engine shall be made again and the widths it measured forgotten, as they were measured in the fallback font (`holdTextEngine`). Given what the measurements wait for (`PagedProjectionOptions.ready`), the pages shall be laid out meanwhile but stay pending until it settles, loaded or failed, and then measure every block again. The document editor's `fonts` adapter (DOCE-HOST-1.14) shall be asked to load the individual families the template names, including each in a fallback stack in order (`templateFontFamilies`, `loadTemplateFonts`) within `FONT_TIMEOUT` milliseconds (five seconds), or the editor's `fontTimeout`, and the pages wait for it; the editor shows no pages without them (DOCE-EDITOR-4.29). After a delayed font loads, the pages shall hold their content.

Implementation: `src/pagination/layout-triggers.ts`, `src/pagination/text-engine-holder.ts`, `src/pagination/fonts.ts`, `src/pagination/projection.ts`, `src/components/document-editor/use-document-layout.ts`
Verification: `src/pagination/layout-triggers.test.ts`, `src/pagination/text-engine.test.ts`, `src/pagination/fonts.test.ts`, `src/pagination/projection-view.test.ts`, `src/components/document-editor/banners.test.tsx`, `e2e/pagination.spec.ts`

### DOCE-PAGINATION-5.7 - Laying out at once

Typing or deleting text inside one textblock shall wait for the writer to pause (DOCE-PAGINATION-7.10), unless it changed its block's height (DOCE-PAGINATION-5.17); any other change to the canonical document, such as Enter, a page break, a footnote, a deletion across blocks, a paste or a drop, shall lay the pages out on the next frame without waiting (`wantsLayoutNow`), and so shall a transaction marked with `layoutNow`. This holds for input on the pages, for what the canonical plugins append to it, and for a change the host shows with the transaction that made it (DOCE-PAGINATION-7.12).

Implementation: `src/pagination/layout-latency.ts`, `src/pagination/projection-session.ts`, `src/pagination/projection.ts`
Verification: `src/pagination/layout-latency.test.ts`, `src/pagination/projection-view.test.ts`

### DOCE-PAGINATION-5.8 - The caret stays in place

When a layout moves the caret of a focused view of the pages on screen, as when its line moves onto the next page, the view's scrolling pane, or the document's, shall scroll by as much once the view draws the new pages, so the caret is back where the writer saw it (`caretPlace`, `keepCaretInPlace`). A view without focus is not scrolled.

Implementation: `src/pagination/caret.ts`, `src/pagination/projection-session.ts`, `src/pagination/projection.ts`
Verification: `src/pagination/caret.test.ts`

### DOCE-PAGINATION-5.9 - Checking the drawn pages

After each layout, the pages the view of the projection drew shall be checked (`findPageOverflow`): a page whose content, footnotes or footer reach more than a pixel below its content box overflows, unless it holds a single block, which may be taller than a page by design. A region or block drawn without a box, such as an empty region its styles hide, reaches nowhere, wherever the page is scrolled. The check runs once the view shows the laid-out pages, also when a layout left them as they were, and not between layouts, so typing does not read every page; its scale is the projection's `scale`. The pages that overflow are counted (`stats().overflowPages`), and once after each change, an overflow shall forget every measurement and lay the pages out again. With `textLayout: 'pretext'`, the blocks the engine laid out keep their layout, as laying them out again gives the same lines; the measurements forgotten are the browser's, of the blocks the engine refused and of inline atoms, so a fresh layout of the document overflows the same pages.

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

The hidden view that measures a whole document shall follow each new one by the smallest replacements (`followDocument`), node by node where the two pair up: a node whose attributes alone changed, such as a header numbered anew when a section gains a page, takes the new attributes and keeps its content, and within a node whose children no longer pair up, only the range that differs is replaced. Every block a change does not reach keeps its node, and with it its rendering and its cached measurement, even when a fresh join of the pages builds it anew. The view shall then hold exactly the document it follows: the change goes in as a remote one, out of the history, so no plugin that derives writes from the writer's own edits (such as the page regions' reset) writes into it, and a state some plugin still changed is replaced by a new state of the document, so the layout and its map never describe another document than the canonical one.

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

### DOCE-PAGINATION-6.7 - Joining as the pages meet

Joining a section's pages (DOCE-PAGINATION-6.1) shall give the same whole document and the same mapping of every position as joining the pages first and then their blocks' fragments in reading order, at a cost that grows with the blocks times the log of the pages rather than with the blocks times the fragments. The pages join in pairs, round after round; each run of fragments joins where its two pages meet, read from the pages before any step, and a page whose one block continues on both sides holds back the join after it until the rounds are done, so every join meets the next fragment as the page split it. A page without blocks, or two fragments of one block on one page, takes the joins in reading order. Repaginating (DOCE-PAGINATION-6.3) copies the target's attributes in one walk over the joined pages.

Implementation: `src/model/pagination/page-transform.ts`, `src/model/pagination/repaginate.ts`
Verification: `src/model/pagination/page-transform.test.ts`

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

Each layout shall keep, until the next change, how each page was filled (`pageMetrics(state)`, `PageMetric`, from `layoutDocument`'s `onPage`): the height it has for its blocks, what they take with facing margins collapsed (`used`) and with every margin counted (`stacked`), the room its header, footer and footnote area take, and each block's height and where it starts below the content's top (`tops`). `createPageDebug({ shown, sheet })` shall show the parts `shown` names (`PageDebugParts`), every length with three decimals (`debugLength`): with `pages`, each page carries its sheet's and its content's width and height when `sheet` gives its section's sheet (`PageDebugSheet`), its header's and footer's room, what its blocks take, collapsed and stacked, the height left and the device pixel ratio of the window it is drawn in (`data-debug-paper`, `data-debug-content`, `data-debug-header`, `data-debug-footer`, `data-debug-used`, `data-debug-stacked`, `data-debug-free`, `data-debug-dpr`); with `blocks`, each region of a page and each block on it carries its node type (`data-debug-type`), and each block its measured height and top (`data-debug-height`, `data-debug-top`), and `data-debug-overflow` when it reaches below the page's room. They shall show the latest layout, also one that kept the same pages, as after an atom's final size. The document editor's `debug` shows them (DOCE-EDITOR-6.13).

Implementation: `src/pagination/layout-marks.ts`, `src/pagination/layout-document.ts`, `src/pagination/page-debug.ts`, `src/components/document-editor/use-document-layout.ts`
Verification: `src/pagination/page-debug.test.ts`, `e2e/document-editor.spec.ts`

### DOCE-PAGINATION-7.5 - Stats

A projection's `stats()` shall count what its layouts did since it was made (`PaginationStats`), its first layout, run while it is made, included: the layouts run (`layouts`); the blocks measured in the measuring view (`blocksMeasured`), those the cache did not hold (`cacheMisses`) and those taken from it (`cacheHits`); the sections laid out with at least one block measured again (`sectionsRelaid`) and from cached measurements alone (`sectionsReused`); the pages broken from their blocks rather than reused from the layout before (`pagesLaidOut`, DOCE-PAGINATION-5.5); the pages drawn taller than they are (`overflowPages`, DOCE-PAGINATION-5.9); the blocks forgotten alone because their element changed size after they were measured (`blocksDrifted`, DOCE-PAGINATION-5.14); and the pages a layout kept as they were (`pagesReused`) and built anew (`pagesRebuilt`). The transaction a layout moves the projection with carries the counts as they stood after it (`layoutStats(tr)`); any other transaction carries none.

Implementation: `src/pagination/layout-marks.ts`, `src/pagination/pagination-stats.ts`, `src/pagination/measure-cache.ts`, `src/pagination/layout-document.ts`
Verification: `src/pagination/projection-view.test.ts`

### DOCE-PAGINATION-7.6 - Layout state

`layoutState()` shall say whether the pages are `pending`, `settled` or `failed`, and `onLayoutStateChange` tell of each change. A projection is pending from its start, and again on each change, each layout asked for and each `refresh`. Two frames after a layout, once the views that follow the pages have drawn, it is settled when no layout is asked for and no edit waits for one. A layout that throws fails, and so does a layout due after eight layouts in a row moved the pages with no change or `refresh` in between: that layout does not run, and the next change or `refresh` lays the pages out again. `whenSettled()` shall resolve with `settled` or `failed` once no layout is pending. Destroying the projection shall resolve outstanding readiness requests with `failed` without reporting a layout failure through `onLayoutStateChange`.

Implementation: `src/pagination/projection-session.ts`, `src/pagination/layout-readiness.ts`, `src/pagination/layout-triggers.ts`
Verification: `src/pagination/projection-view.test.ts`

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

`createProjectionView({ mount, measureIn, state, pageHeight })` shall show a canonical state, the whole document with each section on one page and whole blocks, on pages: a read-only projection view mounted in `mount` shows the paged document, and a hidden ghost view in `measureIn` renders the canonical document, with the same `nodeViews` and `plugins`, to measure it. `mountGhost` shall mount the ghost instead (`MeasuringView`: the view, how it shows a state, drawn before it returns, and how it goes), such as a view that renders React node views; by default it is a plain view (`mountMeasuringView`). After an edit, once the writer pauses (`settle`, as DOCE-PAGINATION-7.1) and never during composition, the pages shall be laid out from the ghost and the projection stepped onto them, with the canonical selection on the side of a page break nearest the projection's. The projection's document shall change only by a layout or by a canonical change mirrored onto it: any other change is input (DOCE-PAGINATION-7.11), or is refused and drawn again when a step does not map onto the canonical state or, taken as the browser made it, would cross a region of a page. A refused change made during a composition, as one typed with an input method into a page header, makes the browser drop the composition without ending it: once that composition sends nothing for a second (`DROPPED_COMPOSITION_MS`) and has not ended, the view shall be told it ended and the pages laid out, so they never wait for it for good. Its pages shall always join into the canonical document. `stats()` shall count the layouts (`layouts`), the refused changes (`refused`) and the canonical changes that could not be mirrored and laid the pages out at once (`relaid`); `onLayout` shall be told of each layout. A projection that starts, or starts again, shall start from the canonical selection and dispatch nothing to the canonical state until a view shows its pages.

Implementation: `src/pagination/projection-view.ts`, `src/pagination/projection-layout.ts`, `src/pagination/ghost-view.ts`, `src/pagination/dropped-composition.ts`, `labs/src/spikes/spike-projection.lab.tsx`
Verification: `src/pagination/projection-view.test.ts`, `src/pagination/projection-session.test.ts`, `src/pagination/dropped-composition.test.ts`, `e2e/spike-projection.spec.ts`, `e2e/editing-layout.spec.ts`

### DOCE-PAGINATION-7.11 - Input on the pages

Input on the projection shall run on the canonical state, which holds the undo history. Enter, Backspace, Delete, paste and the commands given as `keys` shall run as commands on the canonical state (`run`), with the projection's selection mirrored there first; Backspace and Delete delete one character where the browser would, a whole grapheme cluster (a flag, a family emoji, a letter with its accents) of any length, as an arrow key at a page break steps over one: a family of four people with skin tones (19 UTF-16 units) or a letter with 40 accents is one character, its boundaries the ones the whole text block has. Changes the browser makes in the DOM (typing, composition, spellcheck replacements) shall be mapped step by step onto the canonical state and paired with their mirror, so the writer's DOM is not drawn again under them; a selection that only followed such an edit follows it on the canonical state too. An arrow key at a page break inside a split block shall move the caret a character on the canonical text. A cell selection dragged across the parts of a split table shall select cells of the canonical table and be drawn on every part (`selectedCell`); while the pages still show the caret a canonical cell selection is drawn with, as when a menu or the toolbar runs a command on the cells and the document takes the focus back, the cell selection stands and is not replaced by that caret; the drag ends when the button is released, is no longer down as the pointer moves, or the press turns into a native drag, and when the projection goes; and a column resized on one part shall set the canonical table's column, so every part follows; `resizeColumns: false` leaves resizing to the canonical plugins. Each canonical transaction input makes shall go to `dispatch`, and be applied to the canonical state the projection holds with what the canonical plugins append to it, which is shown on the pages at once; beside another writer in a shared room, typing, Enter, Backspace, a mark, undo, redo and paste on the pages each reach the canonical state, the pages and the other writer once. A copy, a cut and a drag shall take the content of the canonical selection the pages' selection stands for, whole blocks with no page, header or footer between them; a slice that is not the selection's, as a dragged node's, shall be taken as the blocks its pages hold. A pasted or dropped slice that holds more than one page of a section, as another view of pages copied it, shall be taken as the blocks of its pages' content, the parts of a split block joined (`contentSlice`), so no paste adds a page to a section.

Implementation: `src/pagination/projection-input.ts`, `src/pagination/selection-mirror.ts`, `src/pagination/graphemes.ts`, `src/layout-engine/graphemes.ts`, `src/pagination/cell-drag.ts`, `src/pagination/projection-view.ts`, `src/pagination/canonical-clipboard.ts`, `src/model/pagination/page-slice.ts`
Verification: `src/pagination/projection-view.test.ts`, `e2e/spike-projection.spec.ts`, `src/pagination/canonical-clipboard.test.ts`, `src/model/pagination/page-slice.test.ts`, `src/pagination/cell-drag.test.ts`, `src/pagination/graphemes.test.ts`, `src/layout-engine/graphemes.test.ts`, `e2e/layout-invariant.spec.ts`, `e2e/table-selection.spec.ts`, `e2e/shared-room.spec.ts`

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

DocumentEditor shall keep `state` as the whole document, each section on one page, and render a paged projection of it (DOCE-PAGINATION-7.10) measured by a ghost view. The ghost shall render the host's React node views (`nodeViews`, read when the pages mount) as the pages do, under the editor's context (`useDocumentEditor`), so a block they draw takes the room it shows; it mounts once React has committed, as a React root of its own. The ghost shall run the editor's plugins except proofing and search, whose marks take no room, and any plugin whose spec says `measured: false`, such as the shared document's sync (DOCE-COLLAB-4.1), whose view must run once. Input on the pages shall become canonical transactions that pass through the editor's dispatch body (suggestions, proofing) to `onStateChange`; a transaction the host does not commit, or one made on a state the host no longer holds, shall be taken back off the pages: one the host does not commit back to the state before it, not to the state React last drew, which may predate a selection the pages have sent since, as a key extending it. Each state the host commits shall be shown on the pages (DOCE-PAGINATION-7.12). The toolbar, menus, dialogs, table handles, the host's events and the editor's own view props shall see the canonical view (DOCE-PAGINATION-7.14), and layouts shall be told as the pagination's are (DOCE-PAGINATION-7.16). The editor's plugin views shall run on the canonical view and be updated when the pages are drawn again as well as when the state changes, so a code block's highlights (DOCE-OBJECTS-3.3) are painted on the pages shown, every part of a split block included. The layout's plugins that read the pages, page debugging (DOCE-PAGINATION-7.4) and page variables (DOCE-PAGINATION-8.2), shall run on the pages, and draw them again when what they show changes. The pages shall wait for the template's fonts (DOCE-PAGINATION-5.6), and each layout shall start from what the one before found. `pageMap` given the editor's canonical state and view shall give the layout of that view's pages, so the status bar, properties and contents show the pages of their own view. A canonical caret at a page break shall go to the side of the break that stands for its position, so a caret after the line break a split code block dropped sits at its continuation's start. A caret at a code fragment's end shall stand for the place before that line break, so Delete there removes it. The browser's selection not reported yet shall be read before a layout draws the pages again (DOCE-EDITOR-1.4), but only while the pages show the canonical document, so a change that could not be mirrored keeps the caret it placed. A state of another schema, as a document swapped in or a template previewed, shall start the projection over.

Implementation: `src/components/document-editor/use-paged-projection.ts`, `src/pagination/canonical-plugins.ts`, `src/engine/code-highlighting.ts`, `src/components/document-editor/start-paging.ts`, `src/components/document-editor/use-document-layout.ts`
Verification: `src/components/document-editor/use-paged-projection.test.ts`, `e2e/projection-editor.spec.ts`, `e2e/regression.spec.ts`

### DOCE-PAGINATION-7.18 - The pages' layout without joining them

The layout of a canonical document a projection shows (`pageMap`, DOCE-PAGINATION-7.17) shall map its positions through the map the projection keeps between its pages and that document (DOCE-PAGINATION-7.9), so reading pages and positions on each keystroke joins no pages; `createPageMap(paged, rules, positions)` shall do so for any paged document whose positions are known. Only a document the pages do not show exactly, as while an edit typed on the pages is on its way to the canonical state, shall map through the page transform, and a document shown before keeps the pages that projection showed it on. Two views sharing the same immutable document shall keep independent page counts, current pages and contents numbers, including after one view is detached. Joining a section's pages shall join them in pairs, round after round, so each block is copied a number of times that grows with the log of the pages, and the fragments that meet shall then join in time linear in the blocks; measuring a parent's blocks shall find each block's element from the one before it.

Implementation: `src/pagination/page-map.ts`, `src/pagination/projection-session.ts`, `src/pagination/projection-attachment.ts`, `src/model/pagination/fragments.ts`, `src/model/pagination/page-transform.ts`, `src/pagination/block-elements.ts`
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

`createTextLayout(options).layoutText(node, place)` shall lay a paragraph, a heading, a code block, a footnote entry or a caption out at the place's width and return its line table (`LineTable`): at least one line, an empty block's line as tall as its leading; each line's start and end as content offsets, which tile the content (a line ends where the next starts, the last at the content size); its width without the spaces that hang past its end, where it starts from the left content edge, its top and its height; and whether it wraps, ends at a hard break or ends the block. The table's height is its lines' together, and its `overhead` the block's padding above and below. Lengths are CSS pixels at a zoom of 1. The engine shall count the text runs it found prepared and those it prepared (`stats()`). It shall keep a block's prepared runs for as long as the block's node lives, however many blocks the document has, so laying the whole document out again, as when atoms settle, prepares nothing that did not change; and it shall tell Pretext the document's language only when it differs from the last one told, since telling it forgets every width Pretext measured.

Implementation: `src/layout-engine/line-table.ts`, `src/layout-engine/text-layout.ts`, `src/layout-engine/lines.ts`
Verification: `src/layout-engine/text-layout.test.ts`

### DOCE-PAGINATION-9.2 - Typography from the template

A text block's typography (`typography(node, scope)`) shall be its template scope's (a section's styles over the template's): a paragraph the paragraph style, a heading its level's, the document's title the title style, a code block the code style; a custom style (`className`) over a paragraph shall set what it sets, its weight and slant else normal, and over a heading only its size and slant. Unset values shall take the reference stylesheet's fallbacks: a serif 12px paragraph at a line height of 1.5, headings from 2em down to 0.9em at 1.2, a 24px title, monospace code at 1.4 with 8px of padding. Relative lengths shall resolve against the paragraph's size, and the paragraph's own relative size once against the default 12px (`rem` against 16px), as the page content takes the paragraph's size (DOCE-TEMPLATES-5.2), lengths snap to the nearest 1/64 px, and a leading, the size times the line height, and a margin are truncated to 1/64 px, as Chromium keeps its line box and a block's margins. A family the host serves (`fontStacks`) shall be measured in the stack it names.

Implementation: `src/layout-engine/typography.ts`
Verification: `src/layout-engine/typography.test.ts`

### DOCE-PAGINATION-9.3 - Marks

Text shall be measured in its marks' fonts, applied outermost first in the schema's mark order: strong text a bolder weight (CSS `bolder`), emphasis italic, inline code the code style's family and size (the size around it when the style sets none) with 3px of padding on each side of each line it reaches, a line that ends inside it fitting without its end padding as Chromium fits a cloned box, and subscript and superscript at the size around them divided by 1.2. Each text node shall be measured as its own item, as Chromium rounds each element's piece of a line to its layout unit, kerning still counting across neighbours in the same font; a line ending in a link or underlined text shall fit its last letter's full width, as Chromium places a decorated line's end exactly. Marks that change only decoration change nothing. The renderer draws sub- and superscripts, footnote markers included, without growing the line (`line-height: 0` in the reference stylesheet, in both layout modes) and inline code with its padding on every line (`box-decoration-break: clone`).

Implementation: `src/layout-engine/typography.ts`, `src/layout-engine/runs.ts`, `labs/reference/document.css`
Verification: `src/layout-engine/typography.test.ts`, `src/layout-engine/text-layout.test.ts`, `e2e/inline-geometry.spec.ts`

### DOCE-PAGINATION-9.4 - White space and hard breaks

Text shall be laid out as `white-space: pre-wrap` with `overflow-wrap: break-word`, as the pages draw it: runs of spaces and tabs kept, spaces hanging at a line's end, and a word longer than a line broken. Each hard break shall end a line, and a block that ends with one shall have an empty last line after it. Each identifier of a citation (DOCE-REFERENCES-1.13) shall be one unbreakable piece, laid out whole on one line, as the stylesheet keeps it.

Implementation: `src/layout-engine/runs.ts`, `src/layout-engine/lines.ts`, `src/model/citation-identifiers.ts`
Verification: `src/layout-engine/text-layout.test.ts`, `e2e/inline-geometry.spec.ts`

### DOCE-PAGINATION-9.5 - Prefixes and inline atoms

A place's `prefix`, such as a heading's number with its space, shall be laid out in the block's font before the content on its first line, taking no content offset. A template variable's value is drawn inside it by the page variables (DOCE-PAGINATION-8.2). Where the place gives the text each variable shows, by its key (`variables`), as for a header or footer drawn once with known values, the variable shall be laid out as that text in its font with its marks, never broken inside, and as nothing when it shows none. Elsewhere it shall be laid out as the `bodyVariables` option says (DOCE-PAGINATION-11.13); a block holding one shall be refused (`template variable`), so the browser draws it, without that option, or in a header or footer without `variables`. A footnote marker, a mention and a glossary reference (`TEXT_ATOMS`), unless the `textAtoms` option leaves the type out, as for one a host draws itself, shall be laid out as the text the page draws in it, in its font with its marks, never broken inside: the marker's number from the `textAtoms.footnoteOf` option at `font-size: smaller` (nothing for a marker without one), the mention's `@` and name, and the glossary reference's display text with its last letter's full width at a line end, as an underlined link's; a type in `textAtoms.refused` shall not be laid out, with its reason. Any other inline node shall take the box its `measureAtom` option gives it, which is told the text block holding it and the block's section, drawn on one line, and sit on the baseline at its own baseline, or at its bottom when it gives none; an atom aligned to the line's top or bottom (`align`) shall make its line at least as tall as itself and no taller. A line shall be as tall as the block's strut, grown by the atoms and the text in another font that reach above or below it. A font's box is its ascent and descent, rounded to whole device pixels at the `scale` option's device pixel ratio as Chromium rounds them (a pixel moves from the ascent to a descent that rounding shortened where Chromium positions glyphs at subpixels: unhinted text, as the pages draw theirs, at every ratio, and hinted text, as the `hinted` option says a lab draws, at ratios other than 1), with half the rest of its leading above, truncated to whole device pixels, and the rest below; the block's strut takes the block's leading, and text in another font the leading of its own size at the block's line height, which it inherits. Subscript and superscript do not grow the line. Without a size the block shall not be laid out, and the reason is given.

Implementation: `src/layout-engine/runs.ts`, `src/layout-engine/text-atoms.ts`, `src/layout-engine/lines.ts`, `src/layout-engine/metrics.ts`, `src/layout-engine/text-layout.ts`
Verification: `src/layout-engine/text-layout.test.ts`

### DOCE-PAGINATION-9.6 - Alignment and padding

A line shall start at the block's left padding plus, when the block is centred, half the room its line leaves, and when right-aligned, all of it; a justified line starts at the edge. A code block's lines shall be laid out inside its 8px padding and, with the `codeLineNumbers` option, beside its gutter of line numbers, as the reference stylesheet draws it: as many widths of the code font's zero as its highest line number (from its `codeLineStart`) has digits, at least three, and 14px more, truncated to the layout unit, in from the left of each line, in a table cell too. The pages' engine takes the option from the state's object views, on when they number all code (`lineNumbers: 'all'`, the default), and is made again when that changes.

Implementation: `src/layout-engine/lines.ts`, `src/layout-engine/text-layout.ts`, `src/engine/object-views.ts`, `src/pagination/text-engine-holder.ts`
Verification: `src/layout-engine/text-layout.test.ts`, `e2e/inline-geometry.spec.ts`

### DOCE-PAGINATION-9.7 - Served fonts and language

Given `isFontServed`, a block whose font's first family, or whose inline code's, is not served shall not be laid out, with the reason, so no system font decides a line. Lines shall break, and text be shaped, by the rules of the document's `language`. The pages' engine shall take the language the pages are drawn in: the `lang` of the element they are in or its nearest ancestor with one, empty for none, which Chromium lays out under its default language; the engine shall be made again when that language changes. Pretext's language shall be set only when text of another language is prepared, since setting it drops Pretext's caches.

Implementation: `src/layout-engine/text-layout.ts`, `src/layout-engine/lines.ts`, `src/pagination/text-engine-holder.ts`, `src/pagination/text-engine.ts`
Verification: `src/layout-engine/text-layout.test.ts`, `src/pagination/text-engine.test.ts`, `e2e/font-widths.spec.ts`

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

### DOCE-PAGINATION-9.11 - Captions

A figure, table or code caption's typography shall be its object's caption text font in its scope (`figure`, `table` or `codeBlock` caption settings), unset values the paragraph's, at the paragraph's line height and with no margins of its own (its place in the object is the block layout's); a table caption shall be aligned as its caption settings say, others left. A place's `label`, the caption's label, number and separator, shall be laid out before the text on the first line, in the caption label font, unset values the caption text's (`captionLabelFont`); a label family that is not served refuses the block. The renderer draws a caption's label and text in these fonts and at this line height, not in the page's inherited font. The engine shall lay figure, table and code captions out; a code caption at its code figure's content width, at the left of the box whatever its alignment, as the stylesheet draws it inside the code's padding. A later part's caption, which holds no text and shows the first part's (`continuedText`), shall be laid out over that text followed by its kind's continued suffix in its scope (`continuedCaption`, a table's or code's, with its space, as the stylesheet draws it), its line table carrying that text (`text`), which its offsets are in. Where a line breaks inside the label or right after it, as in a narrow cell, the line table shall carry the label's part on each line it starts (`label`), each ending in a line feed but a last one that shares its line with the content.

Implementation: `src/layout-engine/typography.ts`, `src/layout-engine/text-layout.ts`, `src/layout-engine/continued-caption.ts`, `src/layout-engine/lines.ts`
Verification: `src/layout-engine/caption-typography.test.ts`, `src/layout-engine/text-layout.test.ts`

### DOCE-PAGINATION-9.12 - Paragraph direction

A text block's direction shall come from its text alone, as Unicode's paragraph rule (UAX #9, P2 and P3) and `dir="auto"` decide it: its first strongly directional character, in its text and the text its mentions and glossary references show, by its Bidi_Class in the Unicode version of Chromium's ICU (17.0, generated into `src/layout-engine/bidi-classes.ts` by `scripts/bidi-classes.mjs`, with the defaults of unassigned code points): R or AL makes it right to left, L left to right, and every other class, numbers and neutrals and marks, is passed over; isolate controls are read through, as Chromium's `dir="auto"` reads them; a block without one is left to right. Every code point shall get the class Chromium's `dir="auto"` gives it. Nothing is stored. Lines break in the text's order whatever the direction, so the engine's lines are the same in both, and each line's start is measured from the block's start edge: the template's left and right alignments are its start and end. The pages shall draw each forced block with `dir` set to its direction, and a split block's later parts with the first part's (the part of the same element id that is not continued), so the browser never decides it from other text, such as an equation's letters; the stylesheet aligns a forced block to its start and lets its end overhang (DOCE-PAGINATION-11.2). Words drawn in a block that are not its content, such as a comparison's deleted words (DOCE-PAGINATION-11.11), do not decide its direction and are drawn in it. Blocks the pages do not draw on forced lines, such as captions, which the engine lays out with the same lines in either direction, and the DOM text layout, keep the browser's own direction.

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

## DOCE-PAGINATION-10 - Block geometry and measured atoms

Behind the editor's `textLayout: 'pretext'` option, block geometry lays blocks out with no DOM, from the text layout engine's lines (DOCE-PAGINATION-9), the atom cache and the template's numbers, in the shapes the DOM measuring gives the page layout (DOCE-PAGINATION-5.1), so the page packer and the splitters read them unchanged. The rendered document follows these numbers: the template's, and the stylesheet's own, which it states for the engine to read (DOCE-PAGINATION-10.8).

### DOCE-PAGINATION-10.1 - The atom cache

`createAtomCache({ measure })` shall size what only the browser can size (an equation, an unsized image, an embed, a block drawn from stored markup) through the host's measurer once, and keep the size by the atom's content: its type, the attributes that show (element ids, authors and split parts left out), its marks, its content (but not a figure's caption, which the engine lays out as text, so typing in a caption keeps the image's size), the width it is laid out in, to Chromium's layout unit, its section and, for an inline atom, the type and shown attributes of the text block holding it, whose font it takes. `measureAtom(node, { parent, scope })` shall give an inline atom's size, baseline and line alignment, for the text layout engine; `measureBlockAtom(node, width, scope)` a block atom's. An atom the measurer cannot size shall have no size, and the cache shall keep the most recently used atoms up to its limit.

Implementation: `src/layout-engine/atoms.ts`
Verification: `src/layout-engine/atoms.test.ts`

### DOCE-PAGINATION-10.2 - Measuring atoms in the DOM, and sizes that may change

`createDomAtomMeasurer({ host })` shall draw an atom in the host element, as the schema's markup or the host's `render`, at the width it is laid out in, read its box, and remove it; an inline atom shall stand on a line, its baseline read from an empty image beside it. An atom that is, or holds, an image that still loads without a fixed box shall have a provisional size: the block holding it shall be laid out as provisional, and when the images have loaded the cache shall keep the final size and tell its listeners (`subscribe`) of every node that asked for it meanwhile, so two elements showing one image are both laid out again. A failed load shall keep the size drawn while loading, as final. A measurer that cannot tell an atom's final size (it settles with none) shall have the cache forget the atom and tell its listeners, so it is measured again when next asked.

Implementation: `src/layout-engine/atoms.ts`, `src/layout-engine/dom-atoms.ts`
Verification: `src/layout-engine/atoms.test.ts`, `src/layout-engine/dom-atoms.test.ts`, `src/layout-engine/blocks/objects.test.ts`

### DOCE-PAGINATION-10.3 - Text blocks and containers

`createBlockLayout({ text, atoms, metrics, labelOf })` shall give each block its height, margins and the measurement its split reads (`layoutBlock(node, { width, scope, region })`), or name the node it cannot lay out yet and why, the same each time. A text block shall take its lines and margins from the text layout, a caption its label (`labelOf`) before its text; a paragraph in a list item or a table cell, and any block in a header or footer, no margins. Children shall stack with adjoining margins collapsed to the larger, a container without padding or border at an edge letting its first or last child's margin through as its own, as the stylesheet's block flow does. A list shall indent its items by the template's indentation with the template's spacing, the last block of its last item without a bottom margin, and a checklist item keep its blocks' margins inside it; a quote shall stand in on each side by the stylesheet's quote indent, with its quote spacing as margins (DOCE-PAGINATION-10.8); an embed's content and a script block's output shall stack as they stand, an empty script block keeping a line and a half of the document's text size and no margins, with its message laid over it; a layout section shall set its columns side by side at their preset's tracks less the stylesheet's column gaps, a preset's tracks standing when fewer columns fill them, as the stylesheet's grid template keeps them, each column padded inside a border of the stylesheet's sizes, its edge blocks without their outer margins, and as tall as the tallest. Containers shall carry where each child sits and their `overhead` (`ContainerMeasurement`).

Implementation: `src/layout-engine/blocks/block-layout.ts`, `src/layout-engine/blocks/context.ts`, `src/layout-engine/blocks/stack.ts`, `src/layout-engine/blocks/text-blocks.ts`, `src/layout-engine/blocks/containers.ts`, `src/layout-engine/blocks/metrics.ts`, `src/layout-engine/blocks/types.ts`
Verification: `src/layout-engine/blocks/containers.test.ts`, `src/layout-engine/blocks/block-layout.test.ts`

### DOCE-PAGINATION-10.4 - Figures, code, equations and rules

A figure shall take the image box its stored size fixes (narrowed to the width at its own height, or scaled to the width when set to the page's width) or else its measured atom (the figure as drawn without its caption), and its caption across the content width unless switched off, with the paragraph's bottom spacing. Code with its caption shall be one box padded as the code is, holding the caption above or below the code with the stylesheet's caption gap either side of its caption rule, measured by its code's lines. Linked code shall be laid out as code with its caption, the caption derived from its address and the code its stored lines, and labelled as code. A display equation shall be a measured atom with the stylesheet's equation spacing as margins; a horizontal rule as tall as the stylesheet's rule height, with its rule spacing as margins; a page break no height; a kept block or a dynamic template a measured atom.

Implementation: `src/layout-engine/blocks/objects.ts`
Verification: `src/layout-engine/blocks/objects.test.ts`

### DOCE-PAGINATION-10.5 - Tables

A table's columns shall keep their stored widths, columns without one sharing what is left equally, with one outer border added to the sum; a table without a width for every column shall span its place, a column without one never taking less than an equal share of it, the stored columns being scaled into the rest; an aligned table's columns without a width shall take 100px, and one set to the page's width shall be scaled to it; a table too wide shall be scaled to fit. The rendered table uses the same column proportions in the editor, viewer and print (`proportionColumns`, `table-layout: fixed` and available column room in the reference stylesheet). Tables in the page body, header and footer share the same sizing and collapsed borders. A fully specified table that fits shall keep its column widths. When it needs to shrink, its rendered columns shall scale to its local width less the outer border and the caption shall span the fitted table. Rendering keeps the stored widths, which a column resize may change starting from the widths it sees (DOCE-TABLES-2.4, DOCE-TABLES-3.7). This is an accepted difference from the DOM's measuring, whose automatic layout sizes columns by their content: tables with long or uneven columns take more rows, so their documents take more pages (in the regression lab: long-mixed 25 to 30, table-both-header-modes 10 to 12, table-long-headerless 10 to 11, table-long-single-header 11 to 14, table-long-repeated-header 13 to 15). Each cell shall be laid out in its columns' width less its padding and the halves of its side borders (none in a header or footer), each row shall be as tall as its tallest single-row cell or a cell's row height, a cell spanning rows adding what it lacks to the last row it spans, with half a border above the first row and below the last; the border class shall set which lines are drawn. A table's caption shall stand above or below it within the table's width, padded by the stylesheet's caption padding, unless switched off. The table shall be measured by its rows, for the table split.

Implementation: `src/layout-engine/blocks/tables.ts`, `src/layout-engine/blocks/table-columns.ts`, `src/model/schema/table-nodes.ts`, `labs/reference/document.css`
Verification: `src/layout-engine/blocks/tables.test.ts`, `e2e/table-widths.spec.ts`

### DOCE-PAGINATION-10.6 - Headers, footers and footnote areas

`layoutRegion(node, place)` shall give a page header or footer its blocks stacked without margins, at least the template's height for it, and the template's spacing between it and the content; and a footnote area its entries under the separator (none when switched off) and the template's spacing to content, the entries the template's entry spacing apart. An empty region shall take no height.

Implementation: `src/layout-engine/blocks/regions.ts`
Verification: `src/layout-engine/blocks/regions.test.ts`

### DOCE-PAGINATION-10.7 - Numbers counted by the engine

A page out of view is not drawn, so a CSS counter there counts nothing. `captionNumbers(doc, template)` shall give, by node, each shown caption's label with the `-` after it (numbered by kind as the lists of contents number it, each section by its scope, restarting where a section restarts numbering; a caption switched off gets none and counts out; a later part's caption, which a split makes again with no element id, the label of the caption it repeats, `repeatedCaptionOf`), and the labels in order as one key. The pages' node numbers (`numbersByNode`) shall give each footnote marker's and entry's number, by its footnote's id, in the order the markers first cite them. The atom cache shall keep an atom by the text a view draws in it (`shownOf`), and the DOM measurer shall draw that text in a leaf atom, so a footnote marker is measured with its number; block geometry shall lay each footnote entry out with its number (`footnoteOf`), which the text layout engine draws before it (DOCE-PAGINATION-9.10). Heading and paragraph numbers come from the text layout engine (DOCE-PAGINATION-9).

Implementation: `src/layout-engine/blocks/numbers.ts`, `src/pagination/node-numbers.ts`, `src/layout-engine/atoms.ts`, `src/layout-engine/dom-atoms.ts`, `src/layout-engine/blocks/text-blocks.ts`
Verification: `src/layout-engine/blocks/numbers.test.ts`, `src/pagination/node-numbers.test.ts`, `src/layout-engine/atoms.test.ts`, `src/layout-engine/dom-atoms.test.ts`, `src/layout-engine/blocks/regions.test.ts`

### DOCE-PAGINATION-10.8 - Atoms measured as the pages draw them

`createDrawnAtomMeasurer({ view, host, scale })` shall measure an atom as the pages' measuring view draws it, with the host's node views and the plugins that render (typeset math, template blocks, signatures), in its section's scope and its block's font: a block atom's box where the view draws it, a figure's without its caption, and the margins it is drawn with, its content's that pass through its edges among them, which the engine takes where they are wider than the stylesheet's; an inline atom's box where the view draws it on one line, grown by the boxes of the elements it holds, as typeset math overhangs the font box of the element around it while growing its line, its baseline from a copy drawn on a line of its own in copies of its ancestors beside an empty image, and its alignment when it is aligned to the line's top or bottom; all divided by the view's scale. An atom the view does not draw has no size. An atom the view still draws, such as math not yet typeset (`data-state="pending"`) or one with images that still load, shall have a provisional size, read again once the view tells it changed (`de-remeasure`) and its images have loaded, or measured again when next asked if it left the view first; a copy whose images have not loaded or failed yet, as the drawn ones have, shall be read again once they have. Images are waited for ten seconds at most, as one out of sight that loads lazily may never load; math still typesetting is waited for as long as the view draws it, so the pages stay provisional (DOCE-PAGINATION-13.2) until it is typeset and are then laid out again at its typeset size, checking once a second whether it left the view. The wait always ends: math removed while it typesets stops being waited for within a second, and the math views (`createMathViews`) show math whose renderer has not answered within `timeout` (30 seconds by default, `DEFAULT_MATH_TIMEOUT`) as invalid, with `timeoutMessage` and the deadline as its reason, and ask the pages to measure it again, so the layout settles at the invalid math's size; an answer that comes later is still drawn and measured again.

Implementation: `src/pagination/drawn-atoms.ts`, `src/engine/math-views.ts`
Verification: `src/pagination/drawn-atoms.test.ts`, `src/engine/math-views.test.ts`, `src/pagination/text-engine-inputs.test.ts`, `e2e/equations-layout.spec.ts`

### DOCE-PAGINATION-10.9 - The stylesheet's own block numbers

The numbers no template setting changes shall be the stylesheet's, stated as custom properties where the page content is drawn and used by its rules: `--de-quote-indent` and `--de-quote-spacing` (a quote's inline and block margins), `--de-rule-height` and `--de-rule-spacing`, `--de-code-padding`, `--de-code-caption-gap` and `--de-code-caption-rule`, `--de-table-caption-padding`, `--de-equation-spacing`, and a layout section's `--de-columns-gap`, `--de-columns-after`, `--de-column-padding` and `--de-column-border`. Each is a length in an absolute unit (px, pt, pc, in, cm, mm, Q) or in `em`, the page content's text size, which the engine counts as the scope's paragraph size. The reference stylesheet states 40px, 1em, 2px, 0.5em, 8px, 4px, 1px, 2px, 6px, 4px, 4px, 5px and 1px, the browser's own quote and rule margins among them. The pages' engine shall read them where it measures its atoms, inside the page content, once for each engine it makes (`readSheetNumbers`), and lay blocks out with them (`blockMetrics(template, scope, numbers)`), so a host stylesheet that states other values changes the drawing and the layout together; a property left out, or stated as anything else (a percentage, `calc()`, `rem`), counts as the reference value.

Implementation: `src/layout-engine/blocks/sheet-numbers.ts`, `src/layout-engine/blocks/metrics.ts`, `src/pagination/text-engine.ts`, `labs/reference/document.css`
Verification: `src/layout-engine/blocks/sheet-numbers.test.ts`

### DOCE-PAGINATION-10.10 - Sizes measured the same on every screen

Chromium rounds a font's ascent and descent, borders and line boxes to device pixels, so a block the browser sizes (a figure, a table, code, an equation, a contents list) measures differently at each device pixel ratio. The pages' measuring element shall publish the inverse of its window's device pixel ratio as `--de-measure-zoom`, again when the ratio changes, as when the window moves to another screen, and the reference stylesheet shall zoom it by that. The view inside it then lays out as on a screen of ratio 1. Every size measured there, by the DOM's measuring and by the drawn-atom measurer (DOCE-PAGINATION-10.8), shall be divided by the zoom the browser draws it at (`measuredZoom`) and snapped to Chromium's layout unit, 1/64 px (`unzoom`), which drops the remainder of dividing by an inexact zoom such as 1/1.25, so the planned pages are the same on every screen; a host stylesheet without the zoom still measures right, at its screen's ratio. A change of ratio shall measure every block and atom again.

Implementation: `src/pagination/measure-scale.ts`, `src/pagination/ghost-measuring.ts`, `src/pagination/projection-layout.ts`, `src/pagination/drawn-atoms.ts`, `src/pagination/measure-blocks.ts`, `src/pagination/measure-cache.ts`, `src/pagination/measure-footnotes.ts`, `src/pagination/layout-document.ts`, `labs/reference/document.css`
Verification: `src/pagination/measure-scale.test.ts`, `e2e/layout-invariant.spec.ts` (DOCE-LABS-8.8, the planned heights at ratios 1.25 to 3)

### DOCE-PAGINATION-10.11 - Lists of contents and their page boxes

A list of contents block (`toc_block`) shall be laid out from what it shows (`contentsOf`, read from the contents plugin of the view that measures the pages, with the host's kinds and labels, or from the document's own catalog of the default kinds without one): its title, or under it what it shows when it lists nothing (DOCE-PAGINATION-9.14), 8px above the rows, then a row per entry (DOCE-PAGINATION-9.13) at its level's indentation (16px a level after the first by default), its spacing before and after collapsed between rows as the stylesheet's block flow does, a group's heading 6px below the row before it, the list's padding at its sides and its spacing above and below it (12px below by default). Each row's page box shall keep room for a fixed number of its level font's `0`, whatever its page reads, so no row's height depends on the page numbers the layout comes to: 3 digits (`PAGE_DIGITS`), or the digits of the document's page count when it has more pages. A layout of a document with a list shall start from 3 digits and pass again with one more as long as the pages it comes to need more, at most 3 times, saying why it stopped (`onUnsettled`) when they still do; the pages are then the same however the document was laid out before. Under `textLayout: 'pretext'` the pages shall draw each row's page box at the width the engine kept for it (`--de-contents-page-width`, in px, from `contentsDrawn`), its number at its end, and break each row's text, and the list's title and what it shows when it lists nothing, only where the engine broke their lines (`data-engine-lines`, a line break between lines). A list's rows are measured for the contents split as the DOM's measuring gives them.

Implementation: `src/layout-engine/blocks/contents.ts`, `src/engine/contents-look.ts`, `src/engine/contents-view.ts`, `src/pagination/contents-lists.ts`, `src/pagination/contents-drawn.ts`, `src/pagination/forced-lines.ts`, `src/pagination/layout-document.ts`, `src/pagination/text-engine.ts`, `labs/reference/document.css`
Verification: `src/pagination/contents-pages.test.ts`, `src/pagination/text-engine-refusals.test.ts`

## DOCE-PAGINATION-11 - The layout engine on the pages

Behind the editor's `textLayout: 'pretext'` option, off by default, the pages are laid out and drawn with the text layout engine (DOCE-PAGINATION-9, DOCE-PAGINATION-10) in place of the DOM's measuring. The engine's module loads only when the option is on. The web layout keeps the DOM's lines.

### DOCE-PAGINATION-11.1 - Measuring with the engine

With the option on, the paged projection shall load the engine with its first layout and make it again for each template the pages are laid out with. Each top-level block of a section's page content shall take its height, margins and split measurement from the engine, in the section's content width, kept by node, its heading or paragraph number, the numbers of the footnote markers it holds, the caption labels and equation numbers it and its descendants show (`blockLabelKeys`), and its section. An insertion, deletion, move or undo that renumbers a caption or equation shall lay out its block again, including an equation inside an unchanged table; a block with a layout rule of its own, one a host draws with a node view of its own or holding one (`nodeViews`, DOCE-PAGINATION-7.17), whose room only drawing it tells, or one the engine cannot lay out yet, shall be measured in the DOM as before, with the reason counted in the projection's `stats().textLayout`. The engine shall measure atoms as the measuring view draws them (DOCE-PAGINATION-10.8), lay out as text the text atoms the host draws with no node view of its own, number footnote markers and entries through the document as the measuring view does, by footnote id, and give captions their labels (`captionNumbers`); footnote markers are laid out as text too, since a superscript no longer raises its line (DOCE-PAGINATION-9.3), so no text atom is left to the DOM (`REFUSED_TEXT_ATOMS` is empty), and blocks holding a template variable always are (DOCE-PAGINATION-9.5). A block's lines (`lines(node, { scope, prefix, number })`) shall be those its `measureBlock` laid it out on for the same prefix and number, kept by them and its footnote markers' numbers. When atoms that were still loading settle, the engine shall forget what it kept and the pages be laid out again. The engine shall take text widths from one injectable source (`measureContext`): in the editor, the font files the host serves (DOCE-HOST-1.14.1, DOCE-PAGINATION-12.5), and only outside the editor, as in unit tests, a Canvas measuring unhinted (`geometricPrecision`); and its font metrics from the same source, and fit lines at a layout scale of 1 on every screen and zoom, never reading the device pixel ratio, so every device computes the same lines and the pages are drawn on them; the pages shall then draw their text unhinted too (`text-rendering: geometricPrecision` in the reference stylesheet), since hinted widths differ by script.

Implementation: `src/pagination/text-engine.ts`, `src/pagination/block-label-keys.ts`, `src/pagination/text-engine-holder.ts`, `src/pagination/served-fonts.ts`, `src/pagination/measure-blocks.ts`, `src/pagination/layout-document.ts`, `src/pagination/projection.ts`, `src/layout-engine/text-atoms.ts`
Verification: `src/pagination/text-engine.test.ts`, `src/pagination/text-engine-inputs.test.ts`, `src/pagination/text-engine-captions.test.ts`, `src/pagination/measure-blocks.test.ts`, `e2e/text-layout.spec.ts`

### DOCE-PAGINATION-11.2 - Forced lines

With the option on, the pages shall draw each top-level paragraph and heading the engine lays out on the engine's lines, so the browser chooses no line break in them, and each paragraph and heading in a table's cells, a list's items, a quote, a layout section's columns, a script block's output or an embed on the lines the engine laid it out on with its table, list, quote, section or container, in its cell's, item's, quote's, column's or container's width (`nestedLines`, `forcedBlocksOf`), and a code figure's code on the lines the engine laid it out on with its figure, beside its gutter of line numbers, and linked code on the lines of the code block it is laid out as, top-level or in its container (`linkedCodeFigure`), numbered from its first line, and the caption of a figure, a table or a code figure on the lines the engine laid it out on with what holds it, after the label the pages draw before its content (`--de-number`, DOCE-PAGINATION-11.9), its first line's indent drawn before that label, laid out with the labels the pages show, as a split part's own copy of its holder shows the whole one's: a later part's caption shows the first part's text and the continued suffix, which it does not hold, drawn before its empty content in `de-forced-lines__text` with the line marks of the text the engine laid it out over (DOCE-PAGINATION-9.11), and a caption whose lines break inside its label or right after it draws the label in its parts (`de-forced-lines__label`, `labelParts`), each part after the first starting its line at its indent and each that ends its line followed by a `br`, in the caption label font, instead of the label the stylesheet generates, and its content's lines that start in the label take no indent of their own; the reference stylesheet then draws neither the generated label nor the generated text and suffix. A caption the pages do not show, one switched off or a later part's without repeated header rows, is no forced block; a numbered paragraph or heading inside them, or one with words other plugins insert in it, is left to the browser, and the empty placeholder a split leaves at the start of a list item's continuation, which takes no room (DOCE-PAGINATION-4.3), is not drawn. Each text block of a drawn page's header, footer and footnote area shall be drawn on the lines the engine laid it out on with its region (`regionLines`, DOCE-PAGINATION-11.10), with the texts its template variables show on that page, read from the page variables' decorations (`regionVariableTexts`, `forcedRegions`); a footnote entry's first line holds the number the view draws before its content, as the engine laid it out. The block shall carry `de-forced-lines`, `data-lines` with its number of lines and, for a numbered heading's first part, `data-number` with the engine's number; each line that wraps shall end at its last character, marked `de-forced-lines__end`, which the stylesheet draws followed by a line feed, never cutting a character in two; a line that ends at a soft hyphen shall carry `de-forced-lines__hyphen` too, which the stylesheet draws as a hyphen before the line feed, as the engine counted it; a line that starts in from the content edge, as a centred or right-aligned one, shall start with `de-forced-lines__start` and `--de-line-indent`, except a numbered heading's first line, whose indent is the block's `--de-first-indent`, drawn as its `text-indent` before the number; a wrapped justified line shall carry `de-forced-lines__justified` and the `--de-word-spacing` that fills it, spread over its spaces and no-break spaces, which Chromium's `word-spacing` both stretches. The block itself is drawn with `dir` set to its direction (DOCE-PAGINATION-9.12), aligned to its start with its end overhanging by 8px, whatever its custom style sets. Inline code on a forced line shall be drawn with its padding on each of its line pieces (`box-decoration-break: clone` in the reference stylesheet), as the engine lays it out. A line that ends at a line feed, as each line of code but its last does, shall take no end mark, since the browser breaks there; a code block's lines start past its gutter, which its box draws as padding, so the gutter is no part of their indent (`inset` in the line table). The block's element decoration shall carry its lines (`forcedLines`) for a node view that draws beside them: a code block's gutter shall mark each of its lines `data-engine-lines` and break the hidden copy of its code line with a `br` where the lines wrap it, and nowhere else, so each number sits on its line's first row. Linked code's view shall draw its text inside the same line marks, its tokens inside them, and again when its lines change, its caption line `contenteditable="false"` as drawn beside the code, and number no row after a line feed that ends its code, which starts no line; the views and a static drawing from a layout (DOCE-PAGINATION-13.3) build code's tokens, line marks and gutter from the same data (`code-drawing.ts`), so they draw it alike. Numbered paragraphs are still drawn on the browser's lines. The decorations shall be drawn on the pages' own view and kept by node, a nested block's by node and its lines, since a cell's lines can move with another cell's text, so a keystroke lays out only the block it changed again and every other block keeps its decorations.

Implementation: `src/pagination/forced-lines.ts`, `src/pagination/forced-blocks.ts`, `src/pagination/forced-sets.ts`, `src/pagination/forced-regions.ts`, `src/pagination/nested-lines.ts`, `src/pagination/numbered-text.ts`, `src/layout-engine/line-marks.ts`, `src/engine/object-views.ts`, `src/engine/code-gutter.ts`, `src/engine/code-drawing.ts`, `src/engine/linked-code.ts`, `src/layout-engine/blocks/linked-code.ts`, `labs/reference/document.css`
Verification: `src/pagination/forced-lines.test.ts`, `src/engine/code-drawing.test.ts`, `src/pagination/pages-layout.test.ts`, `src/layout-engine/blocks/objects.test.ts`, `src/layout-engine/blocks/numbers.test.ts`, `src/model/pagination/container-split.test.ts`, `src/pagination/forced-regions.test.ts`, `src/pagination/text-engine.test.ts`, `src/layout-engine/line-marks.test.ts`, `src/engine/object-views.test.ts`, `e2e/text-layout.spec.ts`, `e2e/inline-geometry.spec.ts`, `e2e/layout-invariant.spec.ts`

### DOCE-PAGINATION-11.3 - The computed lines

The editor handle's `textLines()` shall give, page by page, each forced block (DOCE-PAGINATION-11.2), a top-level paragraph or heading or one in a table's cells, a list's items, a quote, a layout section's columns, a script block's output, an embed or a code figure's code, which says `nested`, or linked code, read as its own element with the lines of its code, or one in the page's header, footer or footnote area, which says `region` (`header`, `footer` or `footnotes`) and is whole on each page, with its element id, its part, its position, where its content starts in the whole block, and the lines the engine computed for it on that page, as offsets in the whole block with their text, as the page draws it: footnote markers' numbers and template variables' values in it, other inline atoms' text left out as the writer did not type it; or no lines and the reason when the browser draws it. Without the option it shall give no pages.

Implementation: `src/pagination/text-lines.ts`, `src/components/document-editor/editor-handle.ts`
Verification: `src/pagination/forced-lines.test.ts`, `e2e/text-layout.spec.ts`

### DOCE-PAGINATION-11.4 - The guard on forced lines

`findWrappedLines(root)` shall give each forced block whose drawn lines differ in number from its computed ones, as when the browser wrapped a line by itself, with its element id and both counts. It reads the boxes of the block's text, of each hard break, so a line that holds only a break counts, and of each inline atom (`contenteditable="false"`) as a whole, never the parts an atom draws inside itself, and none of what is drawn beside the lines as a box of its own, such as linked code's caption line, and boxes that overlap by half the shorter one's height are on one line, so an atom taller than its text, a subscript, a superscript or inline code is counted on its line at every zoom. It reads every forced block's boxes, so tests and development call it, not each layout.

Implementation: `src/pagination/layout-validation.ts`
Verification: `src/pagination/layout-validation.test.ts`, `e2e/text-layout.spec.ts`, `e2e/layout-invariant.spec.ts`

### DOCE-PAGINATION-11.5 - Typing with the engine

The stress lab's typing measurement shall also run with the option on at 40 and 300 pages, and each keystroke shall meet the typing budgets of DOCE-LABS-2.3 there too.

Implementation: `labs/src/stress/stress-lab.tsx`, `e2e/budgets.ts`, `src/pagination/drawn-pages.ts`
Verification: `e2e/performance.spec.ts`

### DOCE-PAGINATION-11.6 - Pages near the screen

With the option on, only the pages near the screen, within half a screen above and below the editor's scrolling frame, measured against that frame and not the window so a page is drawn on forced lines before it scrolls into view, and the page holding the caret shall be drawn on forced lines; a page farther away keeps the browser's lines, which its size does not depend on, and gets its forced lines once it comes near. The pages shall be watched as they are drawn, without reading their boxes, and a page coming near or going away shall draw the pages again with no layout. The check of the pages a layout draws (DOCE-PAGINATION-5.9) shall read only the pages drawn on forced lines, and, until the pages near the screen are known, as at the editor's first layouts before and after the engine loads, only the pages whose own box is within half a screen of the frame and the caret's page, since reading what a far page holds lays out a page that would skip its layout. The reference stylesheet shall have the pages skip their layout while off screen (`content-visibility: auto`), so each keystroke walks no farther than the pages near it. The pages holding the selection's anchor and head shall carry `data-selection-page` (a view-only hook), and the reference stylesheet shall never have them skip their layout, since the browser moves a selection written into a page that skips its layout, as when a menu selects a split atom's first fragment on a page off screen, to that page's first text. A snapshot of the pages (`exportSnapshot`, `exportSnapshotAsync`) shall draw every page on forced lines while it is taken, then only those near the screen again; the editor handle's `drawAllLines(all)` does the same for a host or a test that reads every page (a `{ drawAll }` meta of the forced lines' key). The pages near the screen shall come back only once neither the host nor a snapshot asks for every page: a snapshot taken after `drawAllLines(true)` leaves every page drawn, and of two snapshots taken at once, the first to end leaves the other's pages drawn.

When a text edit leaves heading, paragraph and caption numbering unchanged, the forced lines shall keep that numbering and move its positions. Typing shall not read the document's blocks to count their numbers again.

Implementation: `src/pagination/drawn-pages.ts`, `src/pagination/forced-lines.ts`, `src/pagination/selection-pages.ts`, `src/pagination/layout-validation.ts`, `src/pagination/projection.ts`, `src/components/document-editor/editor-handle.ts`, `src/components/document-editor/all-lines.ts`, `src/components/document-editor/use-document-layout.ts`, `labs/reference/document.css`
Verification: `src/pagination/forced-lines.test.ts`, `src/pagination/selection-pages.test.ts`, `src/pagination/layout-validation.test.ts`, `src/components/document-editor/all-lines.test.ts`, `e2e/text-layout.spec.ts`, `e2e/linked-code-fragments.spec.ts`

### DOCE-PAGINATION-11.7 - The caret at a forced line's start

A caret at the position where a forced line ends and the next starts shall be drawn at the next line's start, as the browser draws one at its own wraps, unless the browser last drew it at the line's end, as after End or a click past the line's end: when the editor writes the selection there itself, after an edit or once the DOM under it is drawn again, it shall move the caret to the next line's start, so a vertical move keeps its line and column.

Implementation: `src/pagination/forced-caret.ts`
Verification: `src/pagination/forced-lines.test.ts`, `e2e/layout-invariant.spec.ts`

### DOCE-PAGINATION-11.8 - Offers on forced lines

An offered completion (DOCE-AUTOMATION-3) drawn in a forced block shall take no room on its line, its text overflowing from the caret, so the line keeps the engine's breaks; the reference stylesheet draws it so.

Implementation: `labs/reference/document.css`
Verification: `e2e/layout-invariant.spec.ts`

### DOCE-PAGINATION-11.9 - Numbers from the engine

With the option on, the pages shall draw the numbers the engine laid them out with, not the stylesheet's counters, which each page's style containment (DOCE-PAGINATION-11.6) would start again: every heading on every page, drawn on forced lines or not, shall carry its number with its space as `data-number` (empty for one without, as a later part of a split heading), and each shown caption, linked code and display equation its label or number as `--de-number` (a caption's label with its separator, found by the id of the object it captions, so a later part of a split table shows the first part's; an equation's by its canonical position), which the reference stylesheet's generated content reads. The labels come from the canonical document under the engine's template (`captionNumbers`, `equationNumbers`), so every page draws the numbers a page without containment would. Measurement and drawing shall use the same equation lookup, including equations before the first table of contents. A projected equation with a unique element id shall keep room for its canonical number while its source is edited. If it is renumbered, the drawing shall use the clearance measured for the new number even when the page keeps the same node. A caption or equation in a repeated table header shall draw its original row's number without advancing the count.

Implementation: `src/pagination/engine-numbers.ts`, `src/pagination/equation-numbers.ts`, `src/model/pagination/table-header-copies.ts`, `src/pagination/projection.ts`, `labs/reference/document.css`
Verification: `src/pagination/engine-numbers.test.ts`, `src/pagination/text-engine-inputs.test.ts`, `e2e/text-layout.spec.ts`, `e2e/equations-layout.spec.ts`

### DOCE-PAGINATION-11.10 - Headers, footers and footnote areas on the engine

With the option on, each section's page header and footer shall take the room the engine lays out for it (`measureRegion`, DOCE-PAGINATION-10.6): its height and its spacing to the content, none when it is empty; and the section's footnote area shall take each entry's height, with the space before the next, and the separator and spacing above them, from the engine's layout of the area (`footnoteAreaOf`), as `measureFootnotes` gives them from the view. A region the view draws at no height, such as one a web layout hides, shall take none; one the engine cannot lay out shall be measured in the view as before. A header or footer holding template variables shall be laid out with the text each shows as the view draws it (DOCE-PAGINATION-8.2, 9.5), kept by node and those texts, at most 1,024 for a node with the least recently used dropped first, so its room is the same at every device pixel ratio; one showing the page's number (`page.current`) or the page count (`page.total`) shall be laid out for each page with that page's own number, counted through the document, and the document's count, so a page whose longer number wraps its header, as page 10 after page 9 or page 100 after page 99, is left the taller header's room. Where a region shows the page count, the document shall be laid out again with the count it came to until the count it assumed is the count it laid out, or the rooms under both are the same; from the third pass, every page shall take the most room any count tried needs, so a count that flips between two values (as where `10` is narrower than `9`) draws whichever it comes to in a room that holds it, the same on every device; and the next layout shall start from the counts the last one took room for. A section whose regions show neither keeps its pages whatever the numbers. The reference stylesheet shall draw what the engine lays out: footnote entries with no margins but the template's entry spacing between them, and the separator painted in the area's padding at exactly the template's thickness (`--doc-footnote-separator-thickness`, `--doc-footnote-separator-color`), never as a border, whose width a browser rounds to whole device pixels.

Implementation: `src/pagination/text-engine.ts`, `src/pagination/region-lines.ts`, `src/pagination/layout-document.ts`, `src/pagination/page-regions.ts`, `src/pagination/measure-footnotes.ts`, `src/layout-engine/blocks/text-blocks.ts`, `labs/reference/document.css`
Verification: `src/pagination/text-engine.test.ts`, `src/pagination/layout-document.test.ts`, `src/pagination/region-lines.test.ts`, `e2e/regression.spec.ts`, `e2e/region-page-numbers.spec.ts`

### DOCE-PAGINATION-11.11 - Words drawn that are not the content

With the option on, the words another plugin draws in a text block as widgets that are not its content, each widget naming its word in its spec (`insertedText`, the text it belongs to as `insertedGroup`, and `alone` for a deleted block's text), such as the deleted words a version comparison marks up in place (DOCE-VERSIONS-2.1), shall be laid out by the engine on the block's lines with its content, each word with the white space after it an item of its own in the block's font, so the block keeps the engine's lines and the height it measured. A line that starts among such words shall break between two of their widgets, by an empty widget of its own at the side between them that ends the line before and starts the line at its indent (`de-forced-lines__break`, or `de-forced-lines__indent` alone after a hard break). A deleted block's text shall be laid out on lines of its own, before the block's content or after it, broken from it as the comparison's break widget draws it. A top-level block holding such a word outside a text block shall be measured in the DOM, with the reason counted. The kept lines and measurements shall be laid out again when the words change.

Implementation: `src/layout-engine/inserted-text.ts`, `src/layout-engine/runs.ts`, `src/layout-engine/lines.ts`, `src/layout-engine/line-marks.ts`, `src/pagination/inserted-texts.ts`, `src/pagination/forced-lines.ts`, `src/pagination/text-engine.ts`, `src/pagination/layout-document.ts`, `src/pagination/text-lines.ts`, `src/engine/version-decorations.ts`, `labs/reference/document.css`
Verification: `src/layout-engine/text-layout.test.ts`, `src/layout-engine/line-marks.test.ts`, `src/engine/version-compare.test.ts`, `e2e/inline-geometry.spec.ts`

### DOCE-PAGINATION-11.12 - Suggestions a markup hides

With the option on, the engine shall lay the pages out in the editor's markup (`markup`, its `simple` markup as `final`): as if accepted, each suggested deletion's content takes no room, and as if rejected, each suggested insertion's, as the markup's stylesheet hides them and a print in that markup leaves them out (DOCE-EDITOR-6.16). Such content is left out of the block's runs, text and inline atoms alike; its block's lines still tile the content, the line table naming the hidden ranges (`hidden`), and each line's marks start and end on its first and last shown character and stretch only its shown spaces, so the pages draw the same lines with the content hidden. A block holding a suggestion is measured again in another markup and kept by it; the regions and containers laid out are forgotten when the markup changes, and the engine is kept. Another markup on the editor lays the pages out again. A layout handed over (`pagesLayout({ markup })`, DOCE-PAGINATION-13.2) or a snapshot (`exportSnapshot`, `exportSnapshotAsync`) in another markup shall lay the pages out in it, take what was asked and lay them out in the editor's markup again, all in one task, so the screen never shows the other markup; a print as if accepted of a long deletion then has no blank pages. Blocks the DOM measures, and suggested whole blocks, keep the room the stylesheet gives them.

Implementation: `src/layout-engine/hidden-suggestions.ts`, `src/layout-engine/runs.ts`, `src/layout-engine/lines.ts`, `src/layout-engine/line-marks.ts`, `src/layout-engine/text-layout.ts`, `src/pagination/text-engine.ts`, `src/pagination/text-engine-holder.ts`, `src/components/document-editor/layout-markup.ts`, `src/components/document-editor/use-document-layout.ts`, `src/components/document-editor/start-paging.ts`, `src/components/document-editor/editor-handle.ts`, `labs/src/regression/regression-lab.tsx`
Verification: `src/layout-engine/text-layout.test.ts`, `src/layout-engine/line-marks.test.ts`, `src/pagination/text-engine.test.ts`, `e2e/suggestion-markup.spec.ts`

### DOCE-PAGINATION-11.13 - Template variables in the text

With the option on, the engine shall lay out a block holding a template variable outside a header or footer (`bodyVariables`), so no block is left to the browser for one. A variable whose value is the same on every page, such as a document's title, owner or today's date, shall be laid out as the text the page variables draw in it, from the same values (`variables` on the text layout setting, the editor's own `variables` adapter, `fixedVariableText`), never broken inside, and as nothing when it shows none. A page's number or the page count (`page.current`, `page.total`, `PAGE_VARIABLES`), whose value would make the block's height depend on the page it lands on, shall instead take a box of a fixed width, the same on every page: as many widths of its font's `0` as a list of contents' page box keeps room for (DOCE-PAGINATION-10.11: 3 digits, or the digits of the page count when it has more pages), rounded up to the layout unit (`pageBoxWidth`), so a page number in the text now sits in a box of room for three digits. A layout of a document whose text holds one shall settle those digits with the page count as a list of contents' do, at most 3 passes, the room only growing. The line table lists each such box as a reserved box over the variable (DOCE-PAGINATION-12.4), which the pages, the viewer and print draw on the variable's own element with the other marks on its range (`de-forced-lines__reserved`, `--de-reserved-width`); the reference stylesheet keeps the variable inline, so its line end or indent stays outside the box, and draws its value in an inline block of that width, at its right, with tabular digits. A block's kept lines and measurements shall be laid out again when its variables' texts or the digits change.

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

`createFontFileMeasurer({ wasm, faces, generics })` shall take harfbuzzjs's `harfbuzz.wasm` and the served faces (family, weight, style, optional `unicode-range`, and the bytes of a WOFF 1.0 or OpenType file) as bytes, fetch nothing, and give `createContext()`, a Canvas-shaped measuring context for Pretext's `setMeasureContext`. The reference text (55 strings at five sizes in nine Geist and KaTeX faces, the ellipsis no face has in its reserved box) shall measure to fingerprint `f43b1311`, and Pretext shall break 120 seeded paragraphs at nine widths into 7,403 lines with fingerprint `0811af10` (fork release 1.0.0-fe.5), in Node, a page and a worker, on Linux, Windows and macOS (DOCE-LABS-7.1). CI shall run the Node test on Linux and Windows on every pull request that reaches the layout engine, its font fixtures or the dependencies, and the required `check` shall fail when either fails; a weekly workflow shall run it on macOS and Windows and open or update one issue when it fails. The widths shall follow Linux Chromium's Canvas: glyph advances at the size floored to 1/64 px, kerning at the size floored to 1/100 px, each word's width a float32 and the words summed in float32. The module shall not be exported or reached from an entry until the editor's Pretext layout uses it.

Implementation: `src/layout-engine/font-files/measurer.ts`, `src/layout-engine/font-files/harfbuzz.ts`, `src/layout-engine/font-files/woff.ts`, `src/layout-engine/font-files/faces.ts`
Verification: `src/layout-engine/font-files/measurer.test.ts`

### DOCE-PAGINATION-12.2 - Canvas words, fallback and missing glyphs

The measurer shall shape as Chromium's Canvas does: each space, and each zero-width space, soft hyphen, direction mark, embedding or override, Arabic letter mark, Mongolian vowel separator and byte order mark a word of its own, so no kerning reaches across them (joiners, the word joiner and the isolates do not end a word); a cut before a kana or ideograph after another character; ASCII whitespace as a space; line and paragraph separators drawn with the space glyph; default ignorables of no width; fallback grapheme by grapheme through the font's family list and each face's `unicode-range`; adjacent CJK punctuation trimmed with the font's `halt` feature; `fontKerning = 'none'` without kerning; and a letter spacing that turns ligatures off and follows each cluster. A cluster shall be drawn by the first face that draws it whole, as Blink asks (no .notdef once shaped, so a letter with an accent may come from one precomposed glyph), with variation selectors, tags and the default ignorables needing no glyph; an emoji presentation selector (U+FE0F) shall put the faces with color glyphs first, a text presentation selector (U+FE0E) shall leave them out, and without a selector the family list decides, whatever the character's default presentation. Each text shall be shaped in Blink's script runs (ScriptRunIterator): characters of no script join the run before them, or at the text's start the run after them, a closing bracket goes back to its opening bracket's run, and a number in a right-to-left run is shaped left to right; so the digits of `שלום 123` take the Hebrew run, in which HarfBuzz applies no kerning from a font without Hebrew positioning, as Chromium draws them. With fork release 1.0.0-fe.7, Pretext measures a word of digits or punctuation in right-to-left text after the letter whose run it is in. The widths of 21 such texts in Geist and the Noto subsets of `test/fixtures/fonts/` shall be within 2/64 px of Chromium 153's. Every character of a cluster no served face draws whole shall be recorded in `problems.missingGlyphs`, and the cluster takes its reserved width (DOCE-PAGINATION-12.4).

Implementation: `src/layout-engine/font-files/measure-context.ts`, `src/layout-engine/font-files/cluster-faces.ts`, `src/layout-engine/font-files/script-runs.ts`, `src/layout-engine/font-files/faces.ts`
Verification: `src/layout-engine/font-files/measurer.test.ts`, `src/layout-engine/font-files/script-runs.test.ts`

### DOCE-PAGINATION-12.3 - Line metrics from the font files

The measurer's `measureText` shall also give `fontBoundingBoxAscent` and `fontBoundingBoxDescent`: the primary face's ascender and descender, as HarfBuzz reads them from the font's tables, at the font's size and rounded to whole pixels, as Linux Chromium's Canvas gives them, so a line's strut needs no Canvas either. The primary face is the first matched face whose `unicode-range` holds the space.

Implementation: `src/layout-engine/font-files/measure-context.ts`, `src/layout-engine/font-files/harfbuzz.ts`
Verification: `src/layout-engine/font-files/measurer.test.ts`

### DOCE-PAGINATION-12.4 - Reserved boxes

What the measurer cannot measure reliably shall take a fixed width that the measurer and every drawing of the pages agree on, so the layout never depends on it (Charles, 2026-11-22: "anything Pretext cannot reliably measure"). The measurer's `reserve(cluster, font)` (`ReserveCluster`) gives a cluster's reserved width in CSS pixels, or null when it measures the cluster. A control character, such as a code block's line feed or tab, is white space the lines lay out and takes none. The first case is a cluster no served face draws whole, which the browser draws from a system font: it takes `UNSERVED_CLUSTER_EMS` (1) of its font's size, one box per cluster, with no kerning or shaping across its edges. The contexts measure such a cluster at that width, and the text layout engine, given the same function as its `reserve` option, lists each such cluster of a block's text in its line table (`reserved`: content range and width). The line marks draw each one as an inner mark (`de-forced-lines__reserved` with `--de-reserved-width`), an element of its own inside a line's other marks, so a line's end or indent stays outside it; the reference stylesheet draws it as an inline block of that width with its real glyph centred, which may reach past the box without moving anything. A word another plugin draws in a text block that is not its content (DOCE-PAGINATION-11.11), such as a comparison's deleted word, is measured the same way: the pages' engine shall give its clusters that take a reserved width in the block's font (`insertedReserved`), by offset in the word, and the pages shall draw the word's widget with each such cluster inside a `de-forced-lines__reserved` box of its element, the element's text unchanged (`withReservedWords`, when the pages' decorations are built). The boxes are part of the widget's key, so a word whose boxes change, as when the engine is made, a face is served or its block's font changes, is drawn again. A widget drawn from a node rather than a function, or whose element's text is not its word, is drawn as it is. Another case Pretext cannot measure reliably shall take a reserved width through the same function and marks.

Implementation: `src/layout-engine/reserved-boxes.ts`, `src/layout-engine/font-files/cluster-faces.ts`, `src/layout-engine/font-files/measure-context.ts`, `src/layout-engine/font-files/measurer.ts`, `src/layout-engine/text-layout.ts`, `src/layout-engine/line-marks.ts`, `src/pagination/forced-lines.ts`, `src/pagination/inserted-reserved.ts`, `src/pagination/canonical-decorations.ts`, `src/pagination/text-engine.ts`, `src/document/print-lines.ts`, `labs/reference/document.css`
Verification: `src/layout-engine/font-files/measurer.test.ts`, `src/layout-engine/text-layout.test.ts`, `src/layout-engine/line-marks.test.ts`, `src/pagination/inserted-reserved.test.ts`, `src/pagination/text-engine.test.ts`, `src/document/print-pages.test.ts`, `e2e/inline-geometry.spec.ts`

### DOCE-PAGINATION-12.5 - The editor's served fonts

With `textLayout: 'pretext'` on pages, the editor shall ask its `fonts` adapter once for the shaper and the faces of the template's families (DOCE-HOST-1.14.1), keep its pages pending until both arrive, and measure every width and line metric with them: the engine's `measureContext` from the font-file measurer, and `isFontServed` true only for a family with served faces, so a block in another family is measured in the DOM. The editor shall also ask for the generic keywords `serif`, `sans-serif` and `monospace`, and lay out and draw its pages in the template with each generic family it names, including within fallback stacks, and its unset paragraph and code fonts, as the served family the host's `generics` says the keyword stands for (`servedTemplate`), since a generic keyword is drawn in whatever face the browser picks; a generic the host serves no family for is not served. Exports, scripts and the editor's handle keep the template as given. A family a later template names shall be asked for once, and the engine made again when its faces arrive. The served files shall be added to the editor's document as faces of the families they serve, so the pages draw the bytes they were measured with and a local font of the same name never draws instead, and taken out when the editor goes. Without a shaper, without `files()`, or when none of the faces can be read, the pages shall keep the browser's own layout: the root says `data-text-layout="dom"` and why in `data-text-layout-reason` (`no-shaper`, `no-files`, `shaper-failed`, `files-failed`, `no-faces`). The reference stylesheet turns `font-synthesis` off on the pages under the option (DOCE-HOST-1.14.2), and draws a code block's `code` in the block's own font rather than the browser's default `code` font; every text of a page shall be drawn in a family the host serves, but MathML for now, which the browser draws in its own `math` family and the engine measures as drawn (DOCE-PAGINATION-10.8). The labs serve Arimo, Cousine and Tinos, faces with Arial's, Courier New's and Times New Roman's metrics, under those names, and the generic keywords as them.

Implementation: `src/pagination/served-fonts.ts`, `src/pagination/text-engine-holder.ts`, `src/pagination/text-engine.ts`, `src/components/document-editor/use-pages-fonts.ts`, `src/components/document-editor/root-data.ts`, `labs/src/served-fonts.ts`, `labs/reference/document.css`
Verification: `src/pagination/served-fonts.test.ts`, `src/pagination/text-engine.test.ts`, `e2e/text-layout.spec.ts`

### DOCE-PAGINATION-12.6 - Engines with different fonts on one page

Pretext keeps one width source for the whole page, so every way into an engine that measures (a block's height, a block's lines, a header's, footer's or footnote area's room) shall first set Pretext's width source to the engine's own. Two engines on one page measuring different files under one family name, in any order and interleaved, shall measure and keep every header, footer and body block as each does alone.

Implementation: `src/pagination/text-engine.ts`
Verification: `src/pagination/text-engine-fonts.test.ts`

### DOCE-PAGINATION-12.7 - A fonts adapter replaced while the editor shows

When the editor is given another `fonts` adapter while it shows, it shall load that adapter's shaper and faces and start its pages over with them, as a fresh editor given that adapter does: the same lines, the new faces drawn on the pages and the new files in its snapshots and layouts, with the writer's selection kept. The previous adapter's loading is abandoned: files it gives after it was replaced are never measured, laid out with or added to the document. The pages start over for each new adapter object, so a host keeps its adapter the same object while its fonts are.

Implementation: `src/components/document-editor/use-pages-fonts.ts`, `src/pagination/served-fonts.ts`, `labs/src/served-fonts.ts`, `labs/src/regression/regression-lab.tsx`
Verification: `e2e/font-lifecycle.spec.ts`

### DOCE-PAGINATION-12.8 - Surfaces drawing other files under one family

The served faces an editor's pages and each `DocumentViewer` add to their document shall be held once for the whole document (`registerFaces`): a surface given the very files another surface drew under a family shares its faces, and a face leaves the document once no surface draws it. A surface given other files under a family another surface holds shall draw them under a family of its own (the family's name with a suffix): the viewer in its template with that family renamed, the editor in its template renamed and measuring the renamed family with the same files, and its snapshots holding the faces under both names. No surface's text shall change width when another mounts or unmounts.

Implementation: `src/document/font-registry.ts`, `src/pagination/served-fonts.ts`, `src/pagination/served-template.ts`, `src/layout-engine/font-files/faces.ts`, `src/components/document-viewer/document-viewer.tsx`, `src/components/document-editor/use-pages-fonts.ts`, `src/components/document-editor/editor-handle.ts`
Verification: `src/components/document-viewer/document-viewer.test.tsx`, `e2e/font-lifecycle.spec.ts`

### DOCE-PAGINATION-12.9 - Math with no layout

Typeset math shall take a reserved box when the math layouter (DOCE-PAGINATION-12.12) cannot load, refuses its MathML or has no glyph for a character it draws. The engine shall size the box without a system font, and every drawing shall use the same dimensions (DOCE-PAGINATION-12.4). An inline box measures one em per grapheme cluster its token elements draw (`mi`, `mn`, `mo`, `mtext` and `ms`, not the annotation that holds its source; `mathTreeText`, `clusterCount`) by one em, 0.8 em above the baseline and 0.2 em below. A display equation measures two ems tall across the line. Both use the font size the math is drawn at. The engine computes it with no DOM (`reservedMath`), records the characters without a glyph as missing glyphs (`ServedFonts.missing`, the measurer's `problems.missingGlyphs`) and tells refused math to `refused`, and every drawing draws the MathML centred in the box, free to reach past it without moving anything (DOCE-PAGINATION-12.11).

Implementation: `src/layout-engine/math-atoms.ts`, `src/utils/math-text.ts`, `src/pagination/served-fonts.ts`, `src/components/document-editor/start-paging.ts`
Verification: `src/layout-engine/math-atoms.test.ts`, `src/utils/math-text.test.ts`, `e2e/equations-layout.spec.ts`

### DOCE-PAGINATION-12.10 - Math sized from its layout, scaled to fit

With a math layouter (`TextLayoutSetting.mathLayouter`, a `MathLayouter`: DOCE-PAGINATION-12.12), the engine shall size typeset math, inline and display, from its layout and never from the DOM (`createMathAtomMeasurer`): the layouter lays the MathML the math views kept (`typesetMathOf`) out at the font size the math is drawn at (its text block's, with its marks, or the template's paragraph size for a display equation), into its width, ascent and descent and the SVG that draws it, after loading what it needs (`prepare`, during which the math is provisional, DOCE-PAGINATION-10.2). A display equation's tag (KaTeX's four-cell table row, or a MathML `mlabeledtr`) shall be laid out apart from the equation (`splitTag`) and sit on its baseline at the line's end. Math the layouter returns no layout for, or whose layout has characters without a glyph (`missing`), shall take the reserved box of DOCE-PAGINATION-12.9, computed by the engine from its clusters and font size with no DOM (`reservedMath`): one em per cluster by one em inline, 0.8 em above the baseline, and two ems tall for a display equation; the characters shall be recorded as missing glyphs, and refused math is told to `refused`. An equation wider than its room shall be scaled down to fit with one uniform scale, as an image is: inline math only when wider than its block's whole line, a display equation when wider than its line less the room its line's end keeps for its tag, which keeps its size, or for its automatic number (`equationOf`, the number the pages draw as `--de-number`, DOCE-PAGINATION-11.9, measured in the equation's font), side by side when it has both, the tag before the number with an em between them, and an em of the equation's font between them and the equation (`end`, the tag's distance from the line's end `tagEnd`); the scale is the room over the width, never above 1 and with no floor (`fitScale`), and applies to the width, ascent and descent, each rounded up to the layout unit (`placeMath`). The engine shall record where it placed each such math node (`mathOf`), and count those scaled below `MATH_MIN_REPORTED_SCALE` (0.5) in its stats (`smallMath`), only among the math of the document it numbered last, so an equation edited or deleted since is not counted. A display equation's number is part of its block's key, so a renumbered equation is laid out again. If the editor’s built-in layouter fails to load, typeset math takes the reserved box. Without a layouter supplied to the engine, or until math is typeset, the engine measures math as drawn (DOCE-PAGINATION-10.8).

Implementation: `src/layout-engine/math-atoms.ts`, `src/layout-engine/math-tags.ts`, `src/layout-engine/runs.ts`, `src/layout-engine/text-layout.ts`, `src/layout-engine/blocks/objects.ts`, `src/layout-engine/atoms.ts`, `src/pagination/text-engine.ts`, `src/pagination/text-engine-holder.ts`, `src/pagination/text-engine-atoms.ts`, `src/pagination/node-numbers.ts`, `src/pagination/numbered-text.ts`
Verification: `src/layout-engine/math-atoms.test.ts`, `src/layout-engine/math-tags.test.ts`, `src/layout-engine/text-layout.test.ts`, `src/layout-engine/blocks/objects.test.ts`, `src/pagination/node-numbers.test.ts`, `src/pagination/text-engine-atoms.test.ts`

### DOCE-PAGINATION-12.11 - Math drawn from its layout

Every renderer shall draw math the engine placed (DOCE-PAGINATION-12.10) from that placement, so what is drawn is what was measured on every system. The pages shall decorate each such math node (`engineMath`) with `data-math-layout` (`laid`, or `reserved` for the reserved box) and its box and scale as `--de-math-width`, `--de-math-ascent`, `--de-math-descent` and `--de-math-scale`, a tag's box as `--de-math-tag-width`, `--de-math-tag-ascent` and `--de-math-tag-descent` and its distance from the line's end past an automatic number as `--de-math-tag-end`, and the room its line's end keeps as `--de-math-end` (`mathDrawingHooks`); the placements move with edits that leave every math node as it was, and are made again otherwise, and again whenever the engine places math anew after a state was made (`mathVersion`), as it does laying the pages out after each transaction. A math node the pages hold that is not the node the engine laid out but equals it, as math edited inside is, since the pages and the canonical state each make their own copy of it, takes the placement of the laid node with its element id (`mathPlaces`). The math views shall draw a laid equation's SVG (`de-math__drawing`, `aria-hidden`), sized to its box so its `viewBox` scales its paths, and a tag's (`de-math__tag`) at its own size, before the typeset MathML, which stays in the element for screen readers, copy and find. The drawing holds only `svg`, `g`, `path`, `rect` and `line` and their geometry, fill and stroke attributes (`MATH_DRAWING_ELEMENTS`, `MATH_DRAWING_ATTRIBUTES`), filled with `currentColor` or the colour the MathML set, so it follows the text colour and dark mode. The pages' layout shall carry each placement with its math (`PagesLayoutMath.drawing`), read from the engine that laid those pages out, and the viewer, static pages and a print drawn from the layout draw the same hooks and SVG through the snapshot's allow-list (`mathDrawingTrees`), needing no font files. The reference stylesheet gives the element exactly its box, inline on its baseline and a display equation across the line with the drawing centred, or moved towards the line's start as far as it must to stay clear of `--de-math-end`, so a scaled equation never runs into its tag or number, hides a laid equation's MathML from sight only (clipped, not `display: none`), and centres a reserved box's MathML in it as DOCE-PAGINATION-12.9 does. Selection and the caret's outline stay on the element.

Implementation: `src/engine/math-drawing.ts`, `src/engine/math-views.ts`, `src/pagination/engine-math.ts`, `src/pagination/text-engine-atoms.ts`, `src/pagination/text-layout-plugins.ts`, `src/pagination/pages-layout.ts`, `src/document/pages-layout.ts`, `src/document/print-pages.ts`, `labs/reference/document.css`
Verification: `src/engine/math-drawing.test.ts`, `src/engine/math-views.test.ts`, `src/pagination/engine-math.test.ts`, `src/pagination/text-engine-atoms.test.ts`, `src/pagination/pages-layout.test.ts`, `src/document/print-pages.test.ts`, `e2e/equations-layout.spec.ts`

### DOCE-PAGINATION-12.12 - Equations laid out and drawn by MathJax

The layout engine shall size and draw equations with one deterministic layouter, `createMathJaxLayouter()`, so an equation has the same box and the same drawing in every browser, in Node and on every system, and no browser MathML layout is read. The layouter typesets the MathML the editor's math renderer gives (a math tree) with MathJax 4's MathML input and SVG output and the STIX Two math font data (`@mathjax/src` and `@mathjax/mathjax-stix2-font`, dependencies of the package), with no DOM (its lite adaptor), no glyph cache shared between drawings (`fontCache: 'none'`) and no automatic line breaks: an equation never wraps.

- **Loading.** The layouter loads lazily, with the first pages the engine lays out, and resolves to null when MathJax cannot load, so math takes the reserved box (DOCE-PAGINATION-12.9). The font's glyph ranges past its base data load in `prepare(trees)`, which resolves once every given tree can be laid out, or returns null when nothing is left to load. `layout` is synchronous and never lays an equation out from partial data: there is no provisional first layout that changes once a range arrives.
- **Host isolation.** Each layouter uses its own MathJax document and loads STIX Two glyph ranges on its own font instance. Initialization and range loading shall preserve the host’s MathJax handler list, loader and synchronous loading setting, even as several layouters initialize or load ranges concurrently.
- **Box.** `layout(tree, display, sizePx)` gives the natural box from the drawing's view box: its width, its ascent above the baseline and its descent below, in pixels for the font size, each rounded up to 1/64 px once. It never scales: an equation wider than its room is scaled down uniformly by the engine (DOCE-PAGINATION-12.10), from this natural box.
- **Drawing.** The drawing is an SVG tree of `svg`, `g`, `path`, `rect` and `line` elements with only geometry, fill and stroke attributes, its root carrying its view box and visible overflow, so every renderer draws the same shapes at any size.
- **Missing glyphs.** Characters the font has no glyph for are left out of the drawing and named in `missing`, so the engine gives that equation its fixed reserved size.
- **Refusals.** MathML MathJax refuses (an error node) lays nothing out: `layout` gives null.
- **Cache.** Layouts are kept per tree and display, so each equation is typeset once and its box at another size is the same layout scaled. `key` names the MathJax version and the font, so stored layouts can be told apart when either changes.
- **Host builds.** MathJax's SVG output imports its default font through `#default-font`; a host's bundler maps it to `@mathjax/mathjax-stix2-font/mjs` (the labs build and the bundle check do), or MathJax's default font is bundled as well; the layouter draws with STIX Two either way.

MathJax and its STIX Two font data are Apache-2.0 (the packages' `license` fields); the STIX Two outlines the data is drawn from are under the SIL Open Font License 1.1, which allows bundling them with software.

Implementation: `src/layout-engine/math/mathjax-layouter.ts`, `src/components/document-editor/start-paging.ts`, `scripts/build-labs.mjs`
Verification: `src/layout-engine/math/mathjax-layouter.test.ts` (Node, on Linux and Windows for each pull request and weekly on macOS), `e2e/font-widths.spec.ts` (DOCE-LABS-7.5), `e2e/equations-layout.spec.ts`

## DOCE-PAGINATION-13 - Print and static pages on the engine's lines

What the pages draw with the text layout engine (DOCE-PAGINATION-11) reaches every output of the document: the pages' layout is handed over as data, and a print drawn from it, or from a snapshot of the pages, holds each page's computed lines.

### DOCE-PAGINATION-13.1 - Line marks

The hooks each line of a forced block takes (DOCE-PAGINATION-11.2) shall come from one function without a DOM, `lineMarks(block, lines, { prefixed })`, as ranges of the block's content with their hook class and measured property, in content order, a `prefixed` block's first line without its start mark, whose indent `firstLineIndent(lines)` gives as the block's measured property. A line that ends or starts with an inline node other than text, such as math, whose content no view draws, shall take its end or start mark on that whole node, never on offsets inside it, and the pages shall draw a mark on such a node on its own element (a node decoration), as a view draws inline decorations only on text. The pages' decorations and every static drawing of the pages shall draw these marks, so all of them draw the same lines: text right after inline math that ends a line starts the next line in the editor, the viewer and a print drawn from the layout.

Implementation: `src/layout-engine/line-marks.ts`, `src/pagination/forced-lines.ts`, `src/pagination/forced-sets.ts`
Verification: `src/layout-engine/line-marks.test.ts`, `src/pagination/forced-lines.test.ts`, `e2e/inline-geometry.spec.ts`, `e2e/equations-layout.spec.ts`

### DOCE-PAGINATION-13.2 - The pages' layout as data

With the option on, the editor handle's `pagesLayout()` shall give the pages' layout as plain data (`PagesLayout`, version 1): the pages' document as ProseMirror JSON, how the pages number their footnotes, each forced block's position, number of lines, a numbered heading's number and its first line's indent (`style`), `direction: 'rtl'` when it is drawn right to left, `gutter: true` when it is code laid out beside a gutter of line numbers, its line marks (linked code's by offset in its code), for every page whether or not the view draws it now, and the value each variable shows, at its position, each math node's typeset presentation where the math views have typeset it (`math`, by position): its MathML as data, as the views kept it after the base library held it to MathML's allowed parts (`typesetMathOf`), or the text invalid math shows and the renderer's reason, the markup it was laid out in (`markup`, DOCE-PAGINATION-11.12: the editor's, or the one `pagesLayout({ markup })` asks for), and whether the layout is provisional (`provisional`): true while the pages are not settled, an atom the engine measured (an image, math) still waits for its final size, or the window loads a font, so its page breaks may still move; a host prints or keeps it once false, as after `whenSettled()`. Without the option it shall give null. The layout is a hand-over to what draws the pages with the same library version, not a stored format.

Implementation: `src/pagination/pages-layout.ts`, `src/document/pages-layout.ts`, `src/pagination/page-variables.ts`, `src/pagination/projection.ts`, `src/layout-engine/atoms.ts`, `src/components/document-editor/editor-handle.ts`, `src/engine/math-views.ts`, `src/engine/math-typeset.ts`
Verification: `src/pagination/pages-layout.test.ts`, `src/pagination/text-engine-inputs.test.ts`, `src/engine/math-views.test.ts`

### DOCE-PAGINATION-13.3 - Static pages on the computed lines

Drawn without a view, from a layout, each forced block shall carry `de-forced-lines`, `data-lines`, its `dir` and its number as the pages do, and its content shall be cut where its line marks start and end, each piece wrapped in the hooks of the marks covering it, inside the block's own marks, so a mark spanning a line end stays one element; an inline atom a mark covers takes its hooks on its own element. A text block that is empty or ends in no text ends with the line break a view adds (`ProseMirror-trailingBreak`). The markup of a forced block shall equal the pages view's. Math shall be drawn as the pages drew it, from the layout's `math` (DOCE-PAGINATION-13.2): on an element with the math views' hooks (`de-math`, `data-display`, `data-state`), its typeset MathML, held to the snapshot's allow-list, or what invalid math shows; math the layout holds no presentation for, not typeset yet, shows its source as `pending`. Inline and display math then take the sizes and the accessible MathML structure the editor shows, in the viewer and in a print drawn from the layout alike. A code block and linked code shall be drawn as the pages' views draw them (DOCE-PAGINATION-11.2): their text as its highlighted tokens inside their line marks, linked code's from its attributes, and, where the layout's block has a gutter, the gutter of line numbers before the code, numbered from its first line, each copy broken where the lines wrap it, the `pre` carrying `--de-code-gutter-digits`.

Implementation: `src/document/print-lines.ts`, `src/document/print-tree.ts`, `src/document/print-pages.ts`, `src/document/print-code.ts`, `src/engine/code-drawing.ts`
Verification: `src/document/print-pages.test.ts`, `e2e/equations-layout.spec.ts`

### DOCE-PAGINATION-13.4 - A print drawn from the layout

`renderLayoutPrintPage(layout, template, options)`, from the server-safe `./document` entry, shall draw a `PagesLayout` as a standalone HTML page without an editor or a DOM: every page with its own header, footer and footnote area, each variable with the value the pages showed, each section in its template scope (its properties and numbering restart) and on its sheet, the ordered lists' starts, each forced block on its computed lines (DOCE-PAGINATION-13.3), the root marked `data-text-layout="pretext"` around an element with the classes of the editor's view, a sheet break after every page but the last, and the links, numbers, images and allow-list of `renderPrintPage` (DOCE-EDITOR-6.27), with the suggestions as the layout's `markup` shows them (DOCE-EDITOR-6.16), which the root's `data-markup` carries; it takes no markup of its own, as the layout's room for the suggestions is that markup's. Printed to PDF, each sheet shall hold its page's computed lines, and print as the editor shows the page (DOCE-EDITOR-6.19) for documents without lists of contents or typeset math, which only a view draws; code and linked code print with their highlighting and gutters.

Implementation: `src/document/print-pages.ts`, `src/document/print-content.ts`, `labs/src/regression/regression-probe.ts`
Verification: `src/document/print-pages.test.ts`, `e2e/print-lines.spec.ts`

### DOCE-PAGINATION-13.5 - Snapshots on the computed lines

With the option on, a print snapshot (DOCE-EDITOR-6.9) shall keep each forced block's hooks and the root's `data-text-layout`, so each sheet of its PDF holds its page's computed lines, and the print document, laid out for print, draws each forced block on exactly those lines, read from its characters' line boxes, so a line the browser wrapped by itself fails though its text is all there (as for the static render of DOCE-PAGINATION-13.4); a forced block shall keep the number its lines were laid out with rather than take the static number print gives other numbered elements (DOCE-EDITOR-6.22).

Implementation: `src/engine/snapshot.ts`, `src/engine/print-links.ts`, `src/document/print-content.ts`
Verification: `e2e/print-lines.spec.ts`

### DOCE-PAGINATION-13.6 - The read-only viewer

`DocumentViewer` shall show a `PagesLayout` read-only, without an editor, a measuring view or a layout of its own: `de-document-viewer` beside the editor's root class, `data-mode="reading"`, `data-markup` with the layout's markup, whose suggestions it shows as the print does, `data-layout="page"` and `data-text-layout="pretext"`, in the template's properties, around an element with the classes of the editor's view that holds every section and every page as an empty sheet of its section's size. A page in view and `overscan` pages on each side of it (1 by default, all with `Infinity`) shall be drawn as the print drawn from the layout draws them (DOCE-PAGINATION-13.4), marked `data-drawn`, and a page that leaves that range is emptied again, so the viewer scrolls the whole document with few pages drawn. A page's content shall be drawn as HTML, and its images' addresses asked of the host (`resolveImage`), only when the page first comes into that range, and kept for when it comes back: a viewer opened on 300 pages asks for no image before a page is in view, and a jump to page 150 asks for that page's images alone; the sheets, the numbers, links and anchors of the whole document are worked out when the viewer opens, so a page drawn alone keeps them. A page counts as in view a screen before it enters the viewer's scrolling frame (its nearest scrolling ancestor, else the window), so a fast scroll finds the next pages drawn; a 300-page document mounts its 300 sheets and draws only the pages near the view. New `options` whose fields are all the same as before shall not draw the pages again, so a host may pass them inline. Its heading, caption and equation numbers shall be the ones the engine laid the pages out with (DOCE-PAGINATION-13.7), so they are the editor's whichever pages are drawn. Each forced block shall show its computed lines, code beside the gutter the pages drew, and each page its computed blocks.

Implementation: `src/components/document-viewer/document-viewer.tsx`, `src/document/print-pages.ts`, `labs/src/regression/regression-lab.tsx`, `labs/reference/document.css`
Verification: `src/components/document-viewer/document-viewer.test.tsx`, `src/document/print-pages.test.ts`, `e2e/document-viewer.spec.ts`

### DOCE-PAGINATION-13.7 - The engine's numbers in static pages

The pages' layout (DOCE-PAGINATION-13.2) shall hold each number the pages draw from the engine (DOCE-PAGINATION-11.9), by position: a heading's, and a caption's label or a display equation's number. A static drawing of the layout (the print, the viewer) shall draw them as the pages do, a heading's in `data-number` and the others in `--de-number`, and a print shall keep a number the engine drew rather than take the static number print gives other numbered elements (DOCE-EDITOR-6.22). Drawn from the layout, a page's numbers shall be the editor's whatever pages are drawn with it.

Implementation: `src/pagination/pages-layout.ts`, `src/pagination/engine-numbers.ts`, `src/document/print-pages.ts`, `src/document/print-content.ts`, `src/engine/print-links.ts`, `labs/reference/document.css`
Verification: `src/document/print-pages.test.ts`, `e2e/document-viewer.spec.ts`

### DOCE-PAGINATION-13.8 - Served faces in static pages

Under `textLayout: 'pretext'` with served fonts (DOCE-HOST-1.14.1), the pages' layout shall hold the served faces the pages were measured and drawn with and the served family each generic keyword stands for (`fonts`), and null when the host serves none. A static drawing of the layout shall draw in them: the print drawn from the layout holds each face as an `@font-face` rule with its file inline, under the family the template names, in the template with each generic family as its served family (DOCE-PAGINATION-12.5); the viewer adds the faces to its document while it shows the pages, through the document's face registry (DOCE-PAGINATION-12.8), and takes them out again. The handle's snapshots (`exportSnapshot`, `exportSnapshotAsync`) shall hold the same faces inline before the host's stylesheets. A PDF printed from either (DOCE-EDITOR-6.26) shall embed only the served faces, with every page's computed lines on that page.

Implementation: `src/pagination/served-fonts.ts`, `src/pagination/text-engine-holder.ts`, `src/pagination/pages-layout.ts`, `src/document/font-faces.ts`, `src/utils/base64.ts`, `src/document/print-pages.ts`, `src/components/document-viewer/document-viewer.tsx`, `src/components/document-editor/editor-handle.ts`, `src/document/headless-print.ts`
Verification: `src/document/font-faces.test.ts`, `src/utils/base64.test.ts`, `src/document/print-pages.test.ts`, `src/components/document-viewer/document-viewer.test.tsx`, `e2e/print-lines.spec.ts`

### DOCE-PAGINATION-13.9 - Links to pages the viewer has not drawn

A link inside the viewer's pages to an anchor of theirs (a reference to a heading or object, a footnote marker or its entry's number, an abbreviation) shall go to it whether or not its page is drawn: the page holding the anchor is drawn as a page in view is (DOCE-PAGINATION-13.6), the anchor is scrolled into view, and the host page's address is left as it was. Each page drawn from a layout (`drawLayoutPages`) names the anchors it holds. Only a link's ordinary activation is taken over: the main button or Enter with no modifier key, on a click no one cancelled before; a click with Control, Meta, Shift or Alt, or with another button, is left to the browser. A fragment is read percent-decoded, and as written when it does not decode (a literal `%`), the first of the two that names an anchor of the pages.

Implementation: `src/document/print-pages.ts`, `src/components/document-viewer/document-viewer.tsx`
Verification: `src/components/document-viewer/document-viewer.test.tsx`, `e2e/document-viewer.spec.ts`

### DOCE-PAGINATION-13.10 - The pages' language in static pages

Under `textLayout: 'pretext'`, the pages' layout shall hold the language the pages were laid out and drawn in (`language`), the one their engine takes (DOCE-PAGINATION-9.7), empty for none. The print drawn from the layout shall carry it as its root's `lang`, as the editor's snapshot carries the language around its pages, and none when it is empty; the viewer shall carry it as its root's `lang`, empty when it is empty, so its pages are drawn in the editor's language whatever the language of the page that holds the viewer.

Implementation: `src/pagination/text-engine-holder.ts`, `src/pagination/pages-layout.ts`, `src/document/pages-layout.ts`, `src/document/print-content.ts`, `src/document/print-pages.ts`, `src/components/document-viewer/document-viewer.tsx`
Verification: `src/pagination/pages-layout.test.ts`, `src/document/print-pages.test.ts`, `src/components/document-viewer/document-viewer.test.tsx`, `e2e/print-lines.spec.ts`

### DOCE-PAGINATION-13.11 - Footnotes drawn on more than one page

A footnote marker the pages draw on more than one page, as a table's repeated header row draws it on each page it repeats on (DOCE-PAGINATION-4.5), shall be numbered in each static drawing of the layout (the print, the viewer) by the page each occurrence is on, under the template's footnote numbering, as the editor's pages number it, and its entry on each of those pages with it. Each page's first marker of the footnote shall link to the entry on its own page and that entry's number back to it: on the first page the footnote is drawn on under its canonical anchors (`fnref-<id>`, `fn-<id>`, DOCE-EDITOR-6.21), on the n-th page under `fnref-<id>~n` and `fn-<id>~n`, so a link goes to the page it is read on. A marker whose page holds no entry of its footnote links to the footnote's first entry; the part of an entry continued from the page before takes no anchor. A snapshot of the pages links them the same way. The footnote's id in the content is the same on every page.

Implementation: `src/engine/footnote-anchors.ts`, `src/document/print-content.ts`, `src/engine/print-links.ts`
Verification: `src/engine/footnote-anchors.test.ts`, `src/document/print-pages.test.ts`, `src/engine/print-links.test.ts`, `e2e/footnote-occurrences.spec.ts`
