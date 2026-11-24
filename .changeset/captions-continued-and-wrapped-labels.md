---
'@flamboyantengineer/document-editor': patch
---

With Pretext pagination, a later part's caption of a split table or code block is laid out over the first part's text and the continued suffix, planned at that height and drawn on the engine's lines (`de-forced-lines__text`); a caption whose label a line breaks inside or after draws its label in the parts the engine broke it into (`de-forced-lines__label`). Captions the pages do not show are no longer counted as refused. The line table gains `text` and `label`, and the pages' layout carries them for the viewer and print.
