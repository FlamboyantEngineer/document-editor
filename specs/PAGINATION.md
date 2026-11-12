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

A list the editor measured (`ContainerMeasurement`: where each item sits, from the top of the fragment's first item) shall split before the first item that crosses the page's foot when that item cannot split (`splitList`). The second part shall take the rest of the height, start a page and keep its items' layouts; an ordered list's second part shall number on from the items before it, and the pages shall draw it so: an ordered list that starts past 1 carries how many items come before it as `--de-list-start` (`createListStarts`), for a stylesheet's own counter, and the document's markup is unchanged.

Implementation: `src/model/pagination/container-split.ts`, `src/model/pagination/page-layout.ts`, `src/pagination/list-starts.ts`
Verification: `src/model/pagination/container-split.test.ts`, `e2e/regression.spec.ts`

### DOCE-PAGINATION-4.2 - Through an item

An item that crosses the page's foot shall split by its own children the same way (`splitListItem`), through a child that splits by its own rule, so a list splits inside a paragraph of an item or inside a nested list. A paragraph's second fragment inside an item shall keep at least three rendered lines (`splitParagraphWith`), and the item continuation shall be marked continued.

Implementation: `src/model/pagination/container-split.ts`, `src/model/pagination/text-split.ts`
Verification: `src/model/pagination/container-split.test.ts`

### DOCE-PAGINATION-4.3 - Item continuations

An item's second fragment that starts with a block other than a paragraph shall open with an empty paragraph and be marked continued. The empty paragraph has no id and takes no room on the page; the reference stylesheet hides it (`data-orphaned-list-continuation`). An item shall not split where either fragment would hold only that empty paragraph.

Implementation: `src/model/pagination/container-split.ts`
Verification: `src/model/pagination/container-split.test.ts`, `e2e/regression.spec.ts`

### DOCE-PAGINATION-4.4 - Quotes

A measured quote shall split between or through its blocks as a list does (`splitContainer`), and its fragments shall join back (DOCE-PAGINATION-1.1). A container's measured `overhead`, the height it takes beyond its children's span, shall count in each fragment: the children shall fit the height less it, and each fragment's height shall include it.

Implementation: `src/model/pagination/container-split.ts`, `src/model/pagination/fragments.ts`
Verification: `src/model/pagination/container-split.test.ts`

### DOCE-PAGINATION-4.5 - Tables

A measured table shall split after its last body row that fits with its height beyond its rows (`splitTableWith`), never inside its leading header rows, and not when it has one body row. Its second part shall repeat the header rows when its section's `styles.table.repeatHeader` asks for it, or the template's when the section sets none (`createLayoutRules({ repeatTableHeader })`, by default it does); a layout's `rules` may be given by section for it (`SectionLayoutRules`). Joining shall drop only header rows that repeat the first part's.

Implementation: `src/model/pagination/table-split.ts`, `src/model/pagination/page-layout.ts`, `src/model/pagination/fragments.ts`, `src/pagination/layout-document.ts`, `src/components/document-editor/start-paging.ts`
Verification: `src/model/pagination/container-split.test.ts`, `e2e/regression.spec.ts`

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

### DOCE-PAGINATION-5.5 - Incremental layout

Given a layout memory (`createLayoutMemory`, `layoutDocument`'s `memory`), laying a section out again shall reuse what the change cannot reach (`layoutSectionIncrementally`): with its page height, its footnote area's measurements and the footnotes shown before it as they were, the pages before the first changed block that read no changed block, and, once a page after the change starts at the same unchanged block, with no fragment before it, at the same page index and with the same footnotes shown before it as a page did before, every page from there. A section that did not change reuses every page, and a block that kept its height lays out only the pages around it. The pages shall always be those a full layout gives. `onSection` tells how many pages each section laid out (`pagesLaidOut`).

Implementation: `src/pagination/incremental-layout.ts`, `src/pagination/layout-document.ts`, `src/pagination/pagination.ts`
Verification: `src/pagination/incremental-layout.test.ts`, `src/pagination/pagination.test.ts`

### DOCE-PAGINATION-5.6 - Fonts

When font faces load in the measuring view's document, every block shall measure again and the pages be laid out again (`remeasureOn`). Given what the measurements wait for (`PaginationOptions.ready`), the pages shall be laid out meanwhile but stay pending until it settles, loaded or failed, and then measure every block again. The document editor's `fonts` adapter (DOCE-HOST-1.14) shall be asked to load the families the template names (`templateFontFamilies`, `loadTemplateFonts`) within `FONT_TIMEOUT` milliseconds, and the pages wait for it. After a delayed font loads, the pages shall hold their content.

Implementation: `src/pagination/layout-triggers.ts`, `src/pagination/fonts.ts`, `src/pagination/pagination.ts`, `src/components/document-editor/use-document-layout.ts`
Verification: `src/pagination/layout-triggers.test.ts`, `src/pagination/fonts.test.ts`, `src/pagination/pagination.test.ts`, `e2e/pagination.spec.ts`

### DOCE-PAGINATION-5.7 - Laying out at once

Typing or deleting text inside one textblock shall wait for the writer to pause (DOCE-PAGINATION-7.1); any other change to the document, such as Enter, a page break, a footnote, a deletion across blocks, a paste or a drop, shall lay the pages out on the next frame without waiting (`wantsLayoutNow`), and so shall a transaction marked with `layoutNow`.

Implementation: `src/pagination/layout-latency.ts`, `src/pagination/pagination.ts`
Verification: `src/pagination/layout-latency.test.ts`, `src/pagination/pagination.test.ts`

### DOCE-PAGINATION-5.8 - The caret stays in place

When a layout moves the caret of a focused editor on screen, as when its line moves onto the next page, the editor's scrolling pane, or the document's, shall scroll by as much, so the caret is back where the writer saw it (`caretPlace`, `keepCaretInPlace`). An editor without focus is not scrolled.

Implementation: `src/pagination/caret.ts`, `src/pagination/pagination.ts`
Verification: `src/pagination/caret.test.ts`

### DOCE-PAGINATION-5.9 - Checking the drawn pages

After each layout, the pages the editor drew shall be checked (`findPageOverflow`): a page whose content, footnotes or footer reach more than a pixel below its content box overflows, unless it holds a single block, which may be taller than a page by design. A region or block drawn without a box, such as an empty region its styles hide, reaches nowhere, wherever the page is scrolled. The check runs once the editor shows the laid-out document, which a React-rendered editor draws after the dispatch. The pages that overflow are counted (`stats().overflowPages`), and once after each change, an overflow shall forget every measurement and lay the pages out again.

Implementation: `src/pagination/layout-validation.ts`, `src/pagination/pagination.ts`, `src/pagination/pagination-stats.ts`
Verification: `src/pagination/layout-validation.test.ts`, `src/pagination/pagination.test.ts`

### DOCE-PAGINATION-5.10 - Page geometry

`pageElements(view)` shall give the element of each page of the paged document a view shows, in the order `PageMap.pages()` lists them; `pageBoxes(view, { scale })` each drawn page's box relative to the view's element, divided by its on-screen scale; and `pageAtPoint(view, { y })` the index of the page a point on screen falls on, or of the nearest page above it, or null above the first page.

Implementation: `src/pagination/page-geometry.ts`
Verification: `src/pagination/page-geometry.test.ts`

### DOCE-PAGINATION-5.11 - Host rules on the document editor

`DocumentEditor` shall lay its pages out with the host's `layoutRules` over the library's (`createLayoutRules`) and join their fragments with the host's `fragmentRules` over `FRAGMENT_RULES` (DOCE-PAGINATION-1.7), on pages and when it joins them for the web layout. Both are read when the pages mount.

Implementation: `src/components/document-editor/use-document-layout.ts`, `src/components/document-editor/document-editor.tsx`
Verification: `src/components/document-editor/document-editor.test.tsx`

### DOCE-PAGINATION-5.12 - A first layout before the first paint

`beforePaintIn(element)` shall give a schedule that runs in a microtask of the element's window, before it next paints, and can be cancelled, so a pagination's first layout can land before the first paint.

Implementation: `src/pagination/layout-triggers.ts`
Verification: `src/pagination/layout-triggers.test.ts`

### DOCE-PAGINATION-5.13 - The measuring view follows the document

The hidden view that measures a whole document shall follow each new one by the smallest replacements (`followDocument`), node by node where the two pair up: a node whose attributes alone changed, such as a header numbered anew when a section gains a page, takes the new attributes and keeps its content, and within a node whose children no longer pair up, only the range that differs is replaced. Every block a change does not reach keeps its node, and with it its rendering and its cached measurement, even when a fresh join of the pages builds it anew.

Implementation: `src/pagination/ghost-view.ts`
Verification: `src/pagination/ghost-view.test.ts`

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

`stats()` shall count what the pagination's layouts did since it was made (`PaginationStats`): the layouts run (`layouts`); the blocks measured in the measuring view (`blocksMeasured`), those the cache did not hold (`cacheMisses`) and those taken from it (`cacheHits`); the sections laid out with at least one block measured again (`sectionsRelaid`) and from cached measurements alone (`sectionsReused`); the pages broken from their blocks rather than reused from the layout before (`pagesLaidOut`, DOCE-PAGINATION-5.5); the pages drawn taller than they are (`overflowPages`, DOCE-PAGINATION-5.9); and the pages a layout kept as they were (`pagesReused`) and built anew (`pagesRebuilt`). The transaction a layout moves the editor with carries the counts as they stood after it (`layoutStats(tr)`); any other transaction carries none.

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

Implementation: `src/pagination/page-map.ts`, `src/pagination/page-positions.ts`
Verification: `src/pagination/page-map.test.ts`

### DOCE-PAGINATION-7.9 - Positions kept exact between layouts

The projection map (`ProjectionMap`) shall map positions between a projection and its canonical document as DOCE-PAGINATION-7.8 does, and stay exact as both change between layouts. An edit made on both documents shall extend it by the projection step inverted and the canonical step, paired as mirrors, so positions inside newly inserted content map across. A canonical step mirrored onto the projection shall be placed by its ends; a replacement inside one textblock whose range crosses a page break shall be mirrored page by page, so the pages between keep their footnotes, header and footer; and an edit to a header row a split table repeats shall be made on every copy. On generated documents and layouts, every character shall map both ways, and keep doing so through generated edits made on either side and mirrored onto the other.

Implementation: `src/pagination/projection-map.ts`, `src/pagination/projection-steps.ts`, `src/pagination/page-positions.ts`
Verification: `src/pagination/projection-map.test.ts`

### DOCE-PAGINATION-7.10 - The paged projection

`createProjectionView({ mount, measureIn, state, pageHeight })` shall show a canonical state, the whole document with each section on one page and whole blocks, on pages: a read-only projection view mounted in `mount` shows the paged document, and a hidden ghost view in `measureIn` renders the canonical document, with the same `nodeViews` and `plugins`, to measure it. `mountGhost` shall mount the ghost instead (`MeasuringView`: the view, how it shows a state, drawn before it returns, and how it goes), such as a view that renders React node views; by default it is a plain view (`mountMeasuringView`). After an edit, once the writer pauses (`settle`, as DOCE-PAGINATION-7.1) and never during composition, the pages shall be laid out from the ghost and the projection stepped onto them, with the canonical selection on the side of a page break nearest the projection's. The projection's document shall change only by a layout or by a canonical change mirrored onto it: any other change is input (DOCE-PAGINATION-7.11), or is refused and drawn again when a step does not map onto the canonical state or, taken as the browser made it, would cross a region of a page. Its pages shall always join into the canonical document. `stats()` shall count the layouts (`layouts`), the refused changes (`refused`) and the canonical changes that could not be mirrored and laid the pages out at once (`relaid`); `onLayout` shall be told of each layout.

Implementation: `src/pagination/projection-view.ts`, `src/pagination/projection-layout.ts`, `src/pagination/ghost-view.ts`, `labs/src/spikes/spike-projection.lab.tsx`
Verification: `src/pagination/projection-view.test.ts`, `e2e/spike-projection.spec.ts`

### DOCE-PAGINATION-7.11 - Input on the pages

Input on the projection shall run on the canonical state, which holds the undo history. Enter, Backspace, Delete, paste and the commands given as `keys` shall run as commands on the canonical state (`run`), with the projection's selection mirrored there first; Backspace and Delete delete one character where the browser would. Changes the browser makes in the DOM (typing, composition, spellcheck replacements) shall be mapped step by step onto the canonical state and paired with their mirror, so the writer's DOM is not drawn again under them; a selection that only followed such an edit follows it on the canonical state too. An arrow key at a page break inside a split block shall move the caret a character on the canonical text. A cell selection dragged across the parts of a split table shall select cells of the canonical table and be drawn on every part (`selectedCell`), and a column resized on one part shall set the canonical table's column, so every part follows; `resizeColumns: false` leaves resizing to the canonical plugins. Each canonical transaction input makes shall go to `dispatch`, and be applied to the canonical state the projection holds with what the canonical plugins append to it, which is shown on the pages at once.

Implementation: `src/pagination/projection-input.ts`, `src/pagination/selection-mirror.ts`, `src/pagination/cell-drag.ts`, `src/pagination/projection-view.ts`
Verification: `src/pagination/projection-view.test.ts`, `e2e/spike-projection.spec.ts`

### DOCE-PAGINATION-7.12 - Canonical changes reach the pages

`update(state, tr)` shall show a new canonical state on the projection at once: by the steps of `tr` when it made the state from the document shown, otherwise, as for a state the host replaced or a remote change, by the smallest replacement between the two documents; a state whose document is the one shown changes only the selection. A change that cannot be mirrored shall lay the pages out at once. The pages are laid out again once the writer pauses.

Implementation: `src/pagination/projection-mirror.ts`, `src/pagination/projection-view.ts`
Verification: `src/pagination/projection-view.test.ts`

### DOCE-PAGINATION-7.13 - Canonical decorations on the pages

The projection shall draw every decoration the canonical state's plugins draw (search, proofing, comments, changes), mapped onto its pages, including one that crosses a page break; a decoration on content only the projection holds, such as a repeated header row, is not drawn there. Whatever renders the projection (`createPagedProjection`, without a view of its own) shall render it with the plugins its state carries, pass each of its transactions to `receive`, and take each new projection state from `onProjection`.

Implementation: `src/pagination/canonical-decorations.ts`, `src/pagination/projection.ts`
Verification: `src/pagination/projection-view.test.ts`

### DOCE-PAGINATION-7.14 - The pages' view as a canonical view

`canonicalView(view, { canonical, map, dispatch })` shall give the view that renders the projection as a view of the canonical state, for toolbars, menus and commands: its `state` is the canonical state, `dispatch` takes canonical transactions, and `coordsAtPos`, `domAtPos`, `nodeDOM`, `posAtDOM` and `posAtCoords` take and give canonical positions; everything else is the projection view's.

Implementation: `src/pagination/canonical-view.ts`
Verification: `src/pagination/projection-view.test.ts`

### DOCE-PAGINATION-7.15 - The canonical plugins run through the pages

The canonical state's plugins shall run on the canonical view of the view that renders the projection (DOCE-PAGINATION-7.14), as they would on a view of their own. Their plugin views shall start with it and be updated with each new canonical state, and what they dispatch shall reach the canonical state and the pages at once. Their key handlers shall run after an arrow key's move across a page break and the host's `keys`, and before Enter, Backspace and Delete; their paste handlers before the projection's paste, and their transforms of pasted HTML, text and slices, and their parse of pasted text, shall shape what is pasted on the pages. Their text input, click, double- and triple-click handlers shall take canonical positions, and their handlers of DOM events shall see those events, a press, the pointer's moves and its leaving included, so a column border dragged on the pages resizes the canonical table and a Ctrl-click there selects its cell. Input that a canonical plugin takes shall have the projection's selection mirrored onto the canonical state first, and input no canonical plugin takes shall cost nothing more, so typing keeps its budget (DOCE-PAGINATION-7.10). A press stays the projection's as well: it places the caret on the pages, or starts a cell drag across them, which the canonical cell drag does not take. The canonical plugins' node views shall draw their nodes on the pages, with canonical positions, including those of plugins the canonical state gains after the projection is made.

Implementation: `src/pagination/canonical-plugins.ts`, `src/pagination/projection.ts`, `src/pagination/projection-input.ts`
Verification: `src/pagination/projection-view.test.ts`

### DOCE-PAGINATION-7.16 - How the projection's layouts go

A projection shall tell how its layouts go as a pagination does. `layoutState()`, `whenSettled()` and `onLayoutStateChange` behave as in DOCE-PAGINATION-7.6, including failing when a layout throws or layouts keep moving the pages with no change in between. `refresh({ remeasure })` behaves as `Pagination.refresh`. The ghost's content changing size shall measure again, as in DOCE-PAGINATION-7.1. `stats()` shall count what its layouts did, as `Pagination.stats` does, beside `refused` and `relaid`. Each layout's projection transaction shall be marked as a pagination's (`isPaginationTransaction`, `layoutStats`), shall record its pages' metrics (`pageMetrics`), and shall be handed to `onLayout`.

Implementation: `src/pagination/projection.ts`, `src/pagination/projection-session.ts`, `src/pagination/projection-layout.ts`
Verification: `src/pagination/projection-view.test.ts`

### DOCE-PAGINATION-7.17 - DocumentEditor on the projection

DocumentEditor shall keep `state` as the whole document, each section on one page, and render a paged projection of it (DOCE-PAGINATION-7.10) measured by a ghost view. The ghost shall render the host's React node views (`nodeViews`, read when the pages mount) as the pages do, under the editor's context (`useDocumentEditor`), so a block they draw takes the room it shows; it mounts once React has committed, as a React root of its own. Input on the pages shall become canonical transactions that pass through the editor's dispatch body (suggestions, proofing) to `onStateChange`; a transaction the host does not commit, or one made on a state the host no longer holds, shall be taken back off the pages. Each state the host commits shall be shown on the pages (DOCE-PAGINATION-7.12). The toolbar, menus, dialogs, table handles, the host's events and the editor's own view props shall see the canonical view (DOCE-PAGINATION-7.14), and layouts shall be told as the pagination's are (DOCE-PAGINATION-7.16). The editor's plugin views shall run on the canonical view and be updated when the pages are drawn again as well as when the state changes, so a code block's highlights (DOCE-OBJECTS-3.3) are painted on the pages shown, every part of a split block included. The layout's plugins that read the pages, page debugging (DOCE-PAGINATION-7.4) and page variables (DOCE-PAGINATION-8.2), shall run on the pages, and draw them again when what they show changes. The pages shall wait for the template's fonts (DOCE-PAGINATION-5.6), and each layout shall start from what the one before found. `pageMap` of a canonical state the projection shows shall be the layout of its pages, so what counts pages, such as the status bar, counts the pages shown. A canonical caret at a page break shall go to the side of the break that stands for its position, so a caret after the line break a split code block dropped sits at its continuation's start. A caret at a code fragment's end shall stand for the place before that line break, so Delete there removes it. The browser's selection not reported yet shall be read before a layout draws the pages again (DOCE-EDITOR-1.4), but only while the pages show the canonical document, so a change that could not be mirrored keeps the caret it placed. A state of another schema, as a document swapped in or a template previewed, shall start the projection over.

Implementation: `src/components/document-editor/use-paged-projection.ts`, `src/pagination/canonical-plugins.ts`, `src/engine/code-highlighting.ts`, `src/components/document-editor/start-paging.ts`, `src/components/document-editor/use-document-layout.ts`
Verification: `e2e/projection-editor.spec.ts`, `e2e/regression.spec.ts`

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
