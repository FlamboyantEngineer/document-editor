---
'@flamboyantengineer/document-editor': minor
---

A pasted image at a web address that states no width and height is loaded first and pasted at its natural size, instead of being dropped. A paste loads all of them at once and waits at most 10 seconds for each; those that give no size are left out, and one message from the host's feedback names them. New labels: `pastedImagesLoading` and `pastedImagesLeftOut(addresses)`.
