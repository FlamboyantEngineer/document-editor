# Outline

The document's outline, for a host's navigation panel: its headings and the one the reader is in.

## DOCE-OUTLINE-1 - The outline

### DOCE-OUTLINE-1.1 - Headings

`documentOutline(state)` shall list the document's headings in order, page headers and footers and headings inside a list or a table left out, and each once though the pages split it, with its element id, level, text and position, and mark the one the selection is under: the last heading at or before the selection's head. A host takes the reader to a heading with the editor's handle (DOCE-EDITOR-6.3).

Implementation: `src/engine/outline.ts`
Verification: `src/engine/outline.test.ts`

### DOCE-OUTLINE-1.2 - Numbers

Given the template, `documentOutline(state, template)` shall give each heading its number as the template numbers it (DOCE-CONTENTS-1.1), and an empty number without one.

Implementation: `src/engine/outline.ts`
Verification: `src/engine/outline.test.ts`

## DOCE-OUTLINE-2 - The outline panel

### DOCE-OUTLINE-2.1 - Navigating by heading

`DocumentOutline`, inside an editor or given its context, shall show the document's headings with element ids as the base library's `Outline`, each with its number and text, the one the selection is under current, collapsing below `collapseBelowLevel`, leaving out the headings `include` refuses; choosing one takes the reader to it without moving the selection (`revealElement`).

Implementation: `src/components/document-panels/document-outline.tsx`
Verification: `e2e/document-panels.spec.ts`
