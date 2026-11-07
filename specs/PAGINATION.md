# Pagination

The editor lays each section out on pages. A block that does not fit where it falls is split into fragments, one per page: nodes of the block's own type marked as parts by their part number (`splitPartIndex`) and their type's continuation attributes. The stored document and the editing document hold whole blocks only, so joining fragments back is part of the model, and a server joins them the way the editor does.

## DOCE-PAGINATION-1 - Fragments

### DOCE-PAGINATION-1.1 - Fragment rules

Each splittable node type shall have a fragment rule (`FRAGMENT_RULES`) naming the attribute values of a whole block; a node holding any other value shall be a fragment (`isFragment`). The rules shall cover paragraphs, code blocks, linked code, tables, bullet and ordered lists, list items and tables of contents.

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

A table's fragments shall join their body rows in order under the first fragment's leading header rows, so header rows a continuation repeats appear once.

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
