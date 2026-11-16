---
'@flamboyantengineer/document-editor': minor
---

Presence: the other people's avatars move from the status bar to the toolbar, just before the editing mode menu (`DocumentPresence`, now with `renderCard`), fade while idle or away, and open a card on hover with the person's name, picture, email and what they are doing. Awareness now shares `activity` (editing, reviewing or viewing) and an optional `email`, and shares the reader's caret only after their first pointer, key or text input in the content. Colour slots go to people in the order the avatars show them, so the people shown never share a colour. `scrollToPeer` scrolls the least distance that leaves the caret 24 pixels inside the view, and not at all when it already is. Selections carry `data-presence-name` for a name on hover.
