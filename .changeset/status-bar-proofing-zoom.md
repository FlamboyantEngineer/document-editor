---
"@flamboyantengineer/document-editor": minor
---

The proofing status publishes `data-checking` instead of `data-pending`, which the base Button keeps for itself. A known count now stays beside "Checking…" and beside "Proofing unavailable". With no issue to go to, the status stays focusable and its tooltip is the new `noIssue` label. `ZOOM_LEVELS` is now 50, 75, 100, 125 and 150 percent. Going to a page from the status bar scrolls only the area that scrolls the document. Escape cancels it, even as the field then loses focus, and goes no further than the field.
