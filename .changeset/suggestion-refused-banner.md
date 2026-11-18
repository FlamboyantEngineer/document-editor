---
'@flamboyantengineer/document-editor': minor
---

Suggest mode now tells the writer why a change it cannot record was not made: the change is replaced by one that records the reason, shown in a `suggestion-refused` warning banner until the next change (`suggestionRefused`, `suggestionRefusedDetail` labels). Hosts read it with `suggestionRefusalOf(state)`; `markSuggestionRefused` builds the recording change.
