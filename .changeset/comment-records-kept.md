---
'@flamboyantengineer/document-editor': minor
---

Deleted comments are kept as records: deleting a thread keeps it in the new `deleted` state with `deletedBy` and `deletedAt` and marks its anchor deleted, and deleting a reply keeps it with who deleted it and when; neither shows anywhere or is exported. A reply may be edited or deleted only while it is the last left in an open thread, and a thread policy may grant `moderate`, which the in-memory and room stores take as `moderates`, to change anyone's comments. The room store and its write guard keep the same rules.
