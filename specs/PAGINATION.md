# Pagination

The editor lays each section out on pages. A block that does not fit where it falls is split into fragments, one per page: nodes of the block's own type marked as parts by their part number (`splitPartIndex`) and their type's continuation attributes. The stored document and the editing document hold whole blocks only, so joining fragments back is part of the model, and a server joins them the way the editor does.

## DOCE-PAGINATION-1 - Fragments

### DOCE-PAGINATION-1.1 - Fragment rules

Each splittable node type shall have a fragment rule (`FRAGMENT_RULES`) naming the attribute values of a whole block; a node holding any other value shall be a fragment (`isFragment`). The rules shall cover paragraphs, code blocks, linked code, tables, quotes, bullet and ordered lists, list items and tables of contents.

Implementation: `src/model/pagination/fragments.ts`
Verification: `src/model/pagination/fragments.test.ts`

### DOCE-PAGINATION-1.2 - Joining fragments

`joinFragments(blocks)` shall join each run of fragments into one whole block, in order. A node shall continue the block before it (`continuesFragment`) when both have the same type, at least one is a fragment, and they share an id or their part numbers follow on. Two whole blocks that share an id shall stay apart. A fragment whose other parts are missing shall become whole on its own. Paragraph fragments shall join their content.

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

A list's fragments shall join their items, and an item split across them shall join its children the same way (`joinChildren`), without the empty paragraph a continuation opens with. The joined list shall keep its first fragment's start number.

Implementation: `src/model/pagination/fragments.ts`
Verification: `src/model/pagination/fragments.test.ts`

### DOCE-PAGINATION-1.6 - Tables of contents

The parts of a table of contents with the same kind, deepest level and reference filter shall join into one that lists every entry and shows its title.

Implementation: `src/model/pagination/fragments.ts`
Verification: `src/model/pagination/fragments.test.ts`

### DOCE-PAGINATION-1.7 - Host rules

A host whose own node types split shall add their rules to `FRAGMENT_RULES`, and pass the rules to `joinFragments` and to `writeDocumentFile` (`fragmentRules`). A type without a rule shall never join.

Implementation: `src/model/pagination/fragments.ts`, `src/model/format/document-format-convert.ts`
Verification: `src/model/pagination/fragments.test.ts`

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

A heading shall move to the next page with the deeper headings directly under it and the block they head, when that block's type keeps with a heading (`keepsWithHeading`) and the group does not fit. Of a splittable block, only its first line (`leadLineHeight`) shall need to fit. A document title shall rank above every heading level.

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

A measured quote shall split between or through its blocks as a list does (`splitBlockquote`), and its fragments shall join back (DOCE-PAGINATION-1.1).

Implementation: `src/model/pagination/container-split.ts`, `src/model/pagination/fragments.ts`
Verification: `src/model/pagination/container-split.test.ts`

### DOCE-PAGINATION-4.5 - Tables

A measured table shall split after its last body row that fits with its height beyond its rows (`splitTableWith`), never inside its leading header rows, and not when it has one body row. Its second part shall repeat the header rows when the template's `styles.table.repeatHeader` asks for it (`createLayoutRules({ repeatTableHeader })`, by default it does). Joining shall drop only header rows that repeat the first part's.

Implementation: `src/model/pagination/table-split.ts`, `src/model/pagination/page-layout.ts`, `src/model/pagination/fragments.ts`
Verification: `src/model/pagination/container-split.test.ts`
