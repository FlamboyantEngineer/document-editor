---
'@flamboyantengineer/document-editor': minor
---

The change bars markup (`simple`) bars each line where suggested text shows, or where hidden suggested-deleted text sits, on whichever page that line is, instead of the whole block (`data-diff-line="suggestion"`, a new `ChangeLineKind`); `onChangeBarsChange` reports those lines. Inline markup no longer repeats text still shown as a suggested deletion as compared deleted text.
