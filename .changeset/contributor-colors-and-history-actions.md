---
'@flamboyantengineer/document-editor': minor
---

The host sets how many colour slots people are told apart by: `DocumentEditor`'s `colorSlots` (or `setColorSlots`, read with `colorSlotsOf`) places the carets, the avatars, the authorship tints and the contributors pane in that many slots, 8 by default. `placePeers` and `documentAuthors` take the count. `DocumentHistory`'s `versionActions` adds the host's own entries to a version's row actions, such as branching from that version.
