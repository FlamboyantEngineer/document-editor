---
'@flamboyantengineer/document-editor': minor
---

Edited pages stay equal to a fresh layout of the stored document. The measuring view now holds exactly the document it follows, so a plugin's appended change can no longer make the pages' map describe another document (which crashed the drawn decorations). A change an input method makes inside a read-only header or footer no longer counts as a region edit. An edit that leaves a section with no block puts one empty paragraph back, as the stored form reads it. A delete that leaves a table with no cell takes the table and its caption out, where the table repair used to loop forever.

`updateRoomDocument` keeps the page headers and footers the room holds while the section's own header and footer settings are unchanged, so a service's write no longer leaves every writer's headers and footers editable. They are kept only while they still apply (the same template pin, sections and section names); given the template (`pageTemplate`), the other sections' headers and footers are set from it as a writer's editor shows them.

With `textLayout: 'pretext'`, a block holding a template variable is left to the browser, as its value is drawn inside it and may be its page's number; and font faces that load make the text layout engine again, so widths measured in a fallback font are forgotten.
