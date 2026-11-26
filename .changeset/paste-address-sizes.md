---
'@flamboyantengineer/document-editor': minor
---

A pasted image at a web address that states no width and height is loaded first and pasted at its natural size, instead of being dropped. One paste loads at most 20 such images and waits at most 10 seconds for each; one that gives no size is left out, and the host's feedback names its address. New labels: `pastedImagesLoading` and `pastedImageLeftOut(address)`.
