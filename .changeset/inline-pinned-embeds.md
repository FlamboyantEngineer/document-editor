---
"@flamboyantengineer/document-editor": minor
---

Embeds can be inline (`embed_inline`, `insertEmbed(embed, { inline: true })`), such as one spreadsheet cell, showing the content's text, and pinned (`pinned`, `setEmbedPinned`, `updateEmbed(view, source, { pinned })`) to the state they show. The embed status asks the host and draws again only after a change that may add, remove or change an embed (`touchesEmbedSources`). `tableFromRows` and the linked spreadsheet bridge keep bold, italic and struck-through text and plain cell colors. The context menu target names the embed it opens on (`ContextTarget.embed`).
