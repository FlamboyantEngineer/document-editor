---
'@flamboyantengineer/document-editor': minor
---

Served fonts that fail to arrive are asked for again by the editor itself: a later family whose files failed comes back in its own faces once they arrive, and a first load that failed or timed out pages the document as soon as the shaper and the files arrive, instead of keeping the web layout. The host's shaper and files now have a 30 second deadline, with the new `timed-out` reason (`BrowserLayoutReason`, `data-text-layout-reason`) when they do not answer in time, and `PagesFonts` says whether a browser layout is retried (`retry`).
