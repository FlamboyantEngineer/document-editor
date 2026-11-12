# Outline

The document's outline, for a host's navigation panel: its headings and the one the reader is in.

## DOCE-OUTLINE-1 - The outline

### DOCE-OUTLINE-1.1 - Headings

`documentOutline(state)` shall list the document's headings in order, only its structural headings (`isStructuralHeading`, DOCE-CONTENTS-1.1): not the document's title, nor a heading in a list, a table, a quote or a page header or footer, and each once though the pages split it, with its element id, level, text and position, and mark the one the selection is under: the last heading at or before the selection's head. A host takes the reader to a heading with the editor's handle (DOCE-EDITOR-6.3).

Implementation: `src/engine/outline.ts`
Verification: `src/engine/outline.test.ts`

### DOCE-OUTLINE-1.2 - Numbers

Given the template, `documentOutline(state, template)` shall give each heading its number as the template numbers it (DOCE-CONTENTS-1.1), and an empty number without one.

Implementation: `src/engine/outline.ts`
Verification: `src/engine/outline.test.ts`

### DOCE-OUTLINE-1.3 - A heading's span

`headingSectionSpan(doc, pos)` shall give the span a structural heading heads: from the heading to the next structural heading of its level or above, across the document's sections, or else to the end of its last content; and null for a position that holds no structural heading. A host scopes a review or a comparison to it (DOCE-VERSIONS-2.6).

Implementation: `src/engine/outline.ts`
Verification: `src/engine/outline.test.ts`

### DOCE-OUTLINE-1.4 - Highlights

Given highlights by heading element id (`documentOutline(state, template, { highlights })`), such as the sections a review covers, each heading shall carry the highlight it is under: its own, or else the nearest heading's above it; else null.

Implementation: `src/engine/outline.ts`
Verification: `src/engine/outline.test.ts`

## DOCE-OUTLINE-2 - The outline panel

### DOCE-OUTLINE-2.1 - Navigating by heading

`DocumentOutline`, inside an editor or given its context, shall show the document's headings with element ids as the base library's `Outline`, each with its number and text, the one the selection is under current, collapsing below `collapseBelowLevel`, leaving out the headings `include` refuses; choosing one takes the reader to it without moving the selection (`revealElement`).

Implementation: `src/components/document-panels/document-outline.tsx`
Verification: `e2e/document-panels.spec.ts`

## DOCE-OUTLINE-3 - Content addresses

### DOCE-OUTLINE-3.1 - The selection's address

`selectionAddress(state)` shall give the selection's address: the text block holding it, by element id, with the selection's offsets in its text, each inline object counting as one; for a selection across blocks, the nearest element with an id holding both, without offsets; null when there is none. A host keeps it to come back to the same text.

Implementation: `src/engine/reveal.ts`
Verification: `src/engine/reveal.test.ts`

### DOCE-OUTLINE-3.2 - Revealing a range

`revealRange(view, address, options)` shall scroll the range of an element's text an address names into view, as `revealElement` does, selecting it when asked, and return false when the document has no such element or range.

Implementation: `src/engine/reveal.ts`
Verification: `src/engine/reveal.test.ts`
