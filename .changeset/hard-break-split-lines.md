---
'@flamboyantengineer/document-editor': minor
---

`TextSplitInput` takes `hiddenStart`, the characters at a fragment's start that draw no line. A paragraph split again after a hard break moved to its fragment's start no longer counts the line that break ended, and the empty line after a paragraph's last hard break stays with its last fragment, so each part of such a paragraph is drawn as tall as planned.
