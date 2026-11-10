# Outline

The document's outline, for a host's navigation panel: its headings and the one the reader is in.

## DOCE-OUTLINE-1 - The outline

### DOCE-OUTLINE-1.1 - Headings

`documentOutline(state)` shall list the document's headings in order, page headers and footers left out and each once though the pages split it, with its element id, level, text and position, and mark the one the selection is under: the last heading at or before the selection's head. A host takes the reader to a heading with the editor's handle (DOCE-EDITOR-6.3).

Implementation: `src/engine/outline.ts`
Verification: `src/engine/outline.test.ts`
