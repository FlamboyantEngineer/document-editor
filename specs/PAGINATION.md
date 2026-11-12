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
Verification: `src/model/pagination/fragments.test.ts`

### DOCE-PAGINATION-1.5 - Lists

A list's fragments shall join their items, and an item split across them shall join its facing children the same way, without the empty paragraph a continuation opens with. The joined list shall keep its first fragment's start number.

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

Blocks on a page shall take their heights plus, between two blocks, the larger of their facing margins (`stackedHeight`); the first block's top margin and the last block's bottom margin shall not count.

Implementation: `src/model/pagination/page-layout.ts`
Verification: `src/model/pagination/page-layout.test.ts`

### DOCE-PAGINATION-2.3 - Splitting

A block that does not fit shall be split by its type's layout rule (`LAYOUT_RULES`, `split`) into a fragment that fits and the fragments after it, which the layout places next. A block that cannot split shall start the next page, or, on an empty page, stay there whole however tall it is.

Implementation: `src/model/pagination/page-layout.ts`
Verification: `src/model/pagination/page-layout.test.ts`

### DOCE-PAGINATION-2.4 - Page breaks

A page shall end after a page break, and before a block that starts a page (`breakBefore`), such as each fragment after a split's first.

Implementation: `src/model/pagination/page-layout.ts`
Verification: `src/model/pagination/page-layout.test.ts`

### DOCE-PAGINATION-2.5 - Headings keep with what they head

A heading shall move to the next page with the deeper headings directly under it and the block they head, when that block's type keeps with a heading (`keepsWithHeading`) and the group does not fit. A splittable block shall need only its lead to fit: the first fragment its own split (`LayoutRule.split`) places in the height left below the headings. So the split's limits decide, and a heading over a paragraph that cannot keep two lines on each side of a split, or over a table whose caption, header rows and first body row do not fit, moves with it. A document title shall rank above every heading level.

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

A list the editor measured (`ContainerMeasurement`: where each item sits, from the top of the fragment's first item) shall split before the first item that crosses the page's foot when that item cannot split (`splitList`). The second part shall take the rest of the height, start a page and keep its items' layouts; an ordered list's second part shall number on from the items before it.

Implementation: `src/model/pagination/container-split.ts`, `src/model/pagination/page-layout.ts`
Verification: `src/model/pagination/container-split.test.ts`

### DOCE-PAGINATION-4.2 - Through an item

An item that crosses the page's foot shall split by its own children the same way (`splitListItem`), through a child that splits by its own rule, so a list splits inside a paragraph of an item or inside a nested list. A paragraph's second fragment inside an item shall keep at least three rendered lines (`splitParagraphWith`), and the item continuation shall be marked continued.

Implementation: `src/model/pagination/container-split.ts`, `src/model/pagination/text-split.ts`
Verification: `src/model/pagination/container-split.test.ts`

### DOCE-PAGINATION-4.3 - Item continuations

An item's second fragment that starts with a block other than a paragraph shall open with an empty paragraph and be marked continued. An item shall not split where either fragment would hold only that empty paragraph.

Implementation: `src/model/pagination/container-split.ts`
Verification: `src/model/pagination/container-split.test.ts`

### DOCE-PAGINATION-4.4 - Quotes

A measured quote shall split between or through its blocks as a list does (`splitContainer`), and its fragments shall join back (DOCE-PAGINATION-1.1). A container's measured `overhead`, the height it takes beyond its children's span, shall count in each fragment: the children shall fit the height less it, and each fragment's height shall include it.

Implementation: `src/model/pagination/container-split.ts`, `src/model/pagination/fragments.ts`
Verification: `src/model/pagination/container-split.test.ts`

### DOCE-PAGINATION-4.5 - Tables

A measured table shall split after its last body row that fits with its height beyond its rows (`splitTableWith`), never inside its leading header rows, and not when it has one body row. Its second part shall repeat the header rows when the template's `styles.table.repeatHeader` asks for it (`createLayoutRules({ repeatTableHeader })`, by default it does). Joining shall drop only header rows that repeat the first part's.

Implementation: `src/model/pagination/table-split.ts`, `src/model/pagination/page-layout.ts`, `src/model/pagination/fragments.ts`
Verification: `src/model/pagination/container-split.test.ts`

### DOCE-PAGINATION-4.6 - Script blocks

A measured script block shall split its output between or through its blocks as a quote does, keep with a heading before it, and each fragment shall keep the block's script and settings.

Implementation: `src/model/pagination/page-layout.ts`, `src/model/pagination/container-split.ts`
Verification: `src/model/pagination/container-split.test.ts`, `e2e/layout-rules.spec.ts`

### DOCE-PAGINATION-4.7 - Layout sections

A measured layout section (`ContainerMeasurement`: where each column sits, each with its own blocks' layouts) shall split by splitting every column at the same height (`splitLayoutSection`): a column that fits stays whole on the first fragment, one whose blocks split there splits between or through them, and one with no block that fits moves whole to the second. A column with nothing on one side shall hold an empty paragraph there. A column's height shall be its blocks' span and its overhead, not the height a grid stretched it to beside a taller column. The section shall not split when no column has a block that fits, and shall keep with a heading before it.

Implementation: `src/model/pagination/layout-section-split.ts`, `src/model/pagination/page-layout.ts`
Verification: `src/model/pagination/container-split.test.ts`, `e2e/layout-rules.spec.ts`

## DOCE-PAGINATION-5 - Measuring

### DOCE-PAGINATION-5.1 - Measured blocks

`measureChildBlocks(view, pos)` shall measure the blocks a node holds as an editor view laid them out, such as a page's content: each block's height and margins, divided by the view's on-screen `scale`; a text block's text between two content offsets, lazily, as a `TextMeasurement`; linked code's code by character; and where each child of a list, list item, quote or table sits, as a `ContainerMeasurement`, with the children measured the same way. Laid out with these measurements, every page's blocks shall fit its height.

Implementation: `src/pagination/measure-blocks.ts`
Verification: `e2e/pagination.spec.ts`

### DOCE-PAGINATION-5.2 - Containers and host rules

A measured container other than a table, including a script block, a layout section and a layout column, shall carry its `overhead`: how far its first child sits below its top, plus its bottom padding and border. A layout rule's `measure` shall measure its node type from the element it renders as (`MeasureInput`), in place of the built-in measuring, when the rules are passed to the measuring (`MeasureOptions.rules`, and through `createPagination`'s `rules`), so a host's own splittable type brings its measure, split and fragment rule. Blocks laid out from measurements shall split across pages, keep headings with what they head, and join back into the measured document.

Implementation: `src/pagination/measure-blocks.ts`, `src/pagination/layout-document.ts`, `src/model/pagination/page-layout.ts`, `labs/src/layout-rules.lab.ts`
Verification: `e2e/pagination.spec.ts`, `e2e/layout-rules.spec.ts`

### DOCE-PAGINATION-5.3 - Measurement cache

Given a cache (`createMeasureCache`), measuring shall reuse a block's measurement while its node is the same, at the node's new position, measure a changed block again, and measure everything again after `clear()`. A cached block that became or stopped being the first or last of its siblings, where styles zero a page's edge margins, shall read its margins again.

Implementation: `src/pagination/measure-blocks.ts`
Verification: `src/pagination/measure-blocks.test.ts`

### DOCE-PAGINATION-5.4 - Measuring again what changed size

When the measuring view's content changes size after it was drawn, the pages shall be laid out again once a frame, measuring again only what changed: an element that dispatches the remeasure event (`REMEASURE_EVENT`, such as math once typeset) or an image that loads or fails shall forget the measurement of the block that holds it (`forgetMeasurement`), and a change of the measuring container's width shall forget every measurement (`remeasureOn`). A block holding an image still loading measures provisionally and is not kept, so the next layout measures it again. Measuring shall read styles and frames from the window its views mount in, never the global one.

Implementation: `src/pagination/measure-blocks.ts`, `src/pagination/layout-triggers.ts`, `src/pagination/pagination.ts`
Verification: `src/pagination/measure-blocks.test.ts`, `src/pagination/layout-triggers.test.ts`

## DOCE-PAGINATION-6 - Projection

### DOCE-PAGINATION-6.1 - The whole document

`joinDocumentPages(doc)` shall join each section's pages into one page by steps: the first page's header with the last page's footer, every page's footnote entries, and the content with the fragments that meet there joined (`joinSectionPages`, which can join a range of pages). Its transform's mapping shall map a position in the paged text onto the same text in the whole document.

Implementation: `src/model/pagination/page-transform.ts`
Verification: `src/model/pagination/page-projection.test.ts`

### DOCE-PAGINATION-6.2 - The paged document

`projectDocument(whole, sections)` shall put each section's blocks on the pages its layout gives (`SectionPages`), each page with its section's header and footer numbered through the document (`pageNumber`, `totalPages`) and the entries of the footnotes its blocks are first to cite, so each entry appears once. Footnotes shall be numbered through the document, or restart on each page (`footnoteNumbering: 'page'`), on their markers and their entries. A section without a layout shall keep its blocks on one page.

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

## DOCE-PAGINATION-7 - Keeping an editor paginated

### DOCE-PAGINATION-7.1 - The pagination plugin

`createPagination({ measureIn, pageHeight })` shall keep an editor on its pages: a hidden view mounted in `measureIn` shall render the whole document and follow the editor's by the smallest replacement, so unchanged blocks keep their rendering and cached measurements; after each change, once the writer pauses for `settle` milliseconds (150 by default, and never more than four times as long after the first change; 0 for every change) and no pointer button is down on the editor, so a layout never lands in the middle of a drag, then on the next frame and never during composition, the pages shall be laid out from it (`layoutDocument`) and the editor stepped onto them (DOCE-PAGINATION-6.3) in a transaction marked as pagination (`isPaginationTransaction`) and kept out of the undo history. `refresh({ remeasure })` shall lay the pages out again, forgetting measurements and starting the measuring view's plugins over after a width or style change or a change to a value a plugin shows. The measuring view shall render with the `nodeViews` and `plugins` the editor renders with, so blocks and regions measure as they show. An editor mounted again, as when the host remounts it, gets a new measuring view that measures everything again, and a layout due as an editor goes lays nothing out.

Implementation: `src/pagination/pagination.ts`, `src/pagination/layout-document.ts`
Verification: `e2e/pagination.spec.ts`, `e2e/document-editor.spec.ts`

### DOCE-PAGINATION-7.2 - Room for footnotes

Each page shall leave room for the footnote entries it holds: their measured heights and the area's own height beyond them (`measureFootnotes`, `footnoteAreaHeight`). An entry shall be on the first page that cites it, numbered through the document, unless footnotes are numbered on each page.

Implementation: `src/pagination/layout-document.ts`, `src/pagination/measure-footnotes.ts`, `src/model/pagination/page-projection.ts`
Verification: `e2e/pagination.spec.ts`

### DOCE-PAGINATION-7.3 - A caret in a moving footnote

A selection in a footnote entry that moves to another page shall move with it, at the same place in the entry's text.

Implementation: `src/pagination/pagination.ts`
Verification: `e2e/pagination.spec.ts`

### DOCE-PAGINATION-7.4 - Layout debugging

Each layout shall keep what each page's blocks take of the height it has for them, and each block's own height (`pageMetrics(state)`, `PageMetric`, from `layoutDocument`'s `onPage`), until the next change. `createPageDebug({ shown })` shall show the parts `shown` names (`PageDebugParts`): with `pages`, each page carries the height its blocks take and the height left (`data-debug-used`, `data-debug-free`); with `blocks`, each block on a page carries its measured height (`data-debug-height`). The document editor's `debug` shows them (DOCE-EDITOR-6.13).

Implementation: `src/pagination/pagination.ts`, `src/pagination/layout-document.ts`, `src/pagination/page-debug.ts`, `src/components/document-editor/use-document-layout.ts`
Verification: `e2e/document-editor.spec.ts`

### DOCE-PAGINATION-7.5 - Stats

`stats()` shall count what the pagination's layouts did since it was made (`PaginationStats`): the layouts run (`layouts`); the blocks measured in the measuring view (`blocksMeasured`), those the cache did not hold (`cacheMisses`) and those taken from it (`cacheHits`); the sections laid out with at least one block measured again (`sectionsRelaid`) and from cached measurements alone (`sectionsReused`); and the pages a layout kept as they were (`pagesReused`) and built anew (`pagesRebuilt`). The transaction a layout moves the editor with carries the counts as they stood after it (`layoutStats(tr)`); any other transaction carries none. Every section's pages are still broken from its blocks on each layout; the counters show what was measured and rebuilt.

Implementation: `src/pagination/pagination.ts`, `src/pagination/pagination-stats.ts`, `src/pagination/measure-blocks.ts`, `src/pagination/layout-document.ts`
Verification: `src/pagination/pagination.test.ts`

### DOCE-PAGINATION-7.6 - Layout state

`layoutState()` shall say whether the pages are `pending`, `settled` or `failed`, and `onLayoutStateChange` tell of each change. A pagination is pending from its start, and again on each change, each layout asked for and each `refresh`. Two frames after a layout, once the views that follow the pages have drawn, it is settled when no layout is asked for and no edit waits for one. A layout that throws fails, and so does a layout due after eight layouts in a row moved the pages with no change or `refresh` in between: that layout does not run, and the next change or `refresh` lays the pages out again. `whenSettled()` shall resolve with `settled` or `failed` once no layout is pending.

Implementation: `src/pagination/pagination.ts`, `src/pagination/layout-readiness.ts`, `src/pagination/layout-triggers.ts`
Verification: `src/pagination/pagination.test.ts`

### DOCE-PAGINATION-7.7 - The layout

`pageMap(state)` shall give the layout of the document a state shows (`PageMap`), made once for each document and joined by the fragment rules of the state's pagination, or `FRAGMENT_RULES` with none; `createPageMap(paged, rules)` shall make one for any paged document. `pages()` shall list its pages in order (`LaidOutPage`): each with its number through the document from 1, its section's index from 0, and its page node and where it starts in the paged document. `pageAt(pos)` shall give the page holding a position in the canonical whole document (DOCE-PAGINATION-6.1), the page after a break that falls inside a block by default and the page before it with `assoc` -1, or null where no page holds it; a footnote entry's position gives the page that shows the entry. `pageOf(elementId)` shall give the first page holding the element with that id, or null. Reading the pages and elements shall not join the pages; the first position mapped does, once.

Implementation: `src/pagination/page-map.ts`, `labs/src/pagination.lab.ts`
Verification: `src/pagination/page-map.test.ts`, `e2e/pagination.spec.ts`

### DOCE-PAGINATION-7.8 - Positions between the pages and the canonical document

`toCanonical(pos)` and `toProjection(pos)` shall map a position between the paged document (the projection) and its canonical whole document (`canonical`) through the page transform's steps, so every position in the content's text maps exactly both ways. A projection position at the end of a textblock shall keep to the text before it unless `assoc` says otherwise; a canonical position where a page break falls inside a block shall map after the break, or before it with `assoc` -1. Positions the transform moves or drops shall be found again at the same offset: inside a footnote entry, in the entry of the same footnote, and inside a header row a table continuation repeats, in the canonical table's row. A position found in neither shall map to null.

Implementation: `src/pagination/page-map.ts`, `src/pagination/page-map-redirects.ts`
Verification: `src/pagination/page-map.test.ts`

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
