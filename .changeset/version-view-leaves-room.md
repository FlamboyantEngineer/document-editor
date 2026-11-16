---
'@flamboyantengineer/document-editor': minor
---

Viewing a version leaves the shared room: sessions gain `suspend()` and `resume()`, `viewVersion` suspends the session and `returnFromView` (and `restore`) resume it, which reloads the document from its room and joins again. The room change guard gains `verify()` for the room server's self-check; collaboration-tools is pinned at its guard self-check.
