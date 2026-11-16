---
"@flamboyantengineer/document-editor": minor
---

The document is inert and busy until its pages first settle, and a first layout that fails keeps it covered with an error and calls `onLayoutFailed`. `createLoadProgress` keeps a load's weighted, monotonic progress over the session's phases and the first layout: `SessionLoading` takes it as `progress` and shows the estimate and the phase counter, and the editor ends it through `loadProgress`.
