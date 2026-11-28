---
'@flamboyantengineer/document-editor': patch
---

A node view the host adds to the paged editor after it mounts is now read at the next layout: the engine is made again with it, so its node is no longer laid out as text while the host's view draws it. A projection handed a layout engine holder no longer destroys it when it is destroyed.
