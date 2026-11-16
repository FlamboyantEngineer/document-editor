---
"@flamboyantengineer/document-editor": minor
---

Template sections follow the template as it is now: a section of the template's takes its current lock, and a stale stored lock is dropped; a sync keeps a script's provenance and signatures and gives the content it brings element ids, as `createDocumentFile` now does for locked sections too. `createDocumentFile` reads the template's tokens with `schema`, and the editor turns `{{key}}` text it opens with into variables (`repairVariableTokens`). Insertable sections the writer empties are taken out, new figures take the template's default width, `replaceTemplate` renders references again, and the drift banner names sections by their label and stays hidden while suggesting (`templateDriftDetail(drift, nameOf)`). Template colours accept any CSS colour, template sections take `extensions`, header and footer heights apply, and the base template sets contents leader gaps.
