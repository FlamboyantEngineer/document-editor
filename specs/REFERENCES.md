# References

References citing a heading, figure, table, code block or equation of the document, or another document a host finds, and abbreviations citing a glossary's entries.

## DOCE-REFERENCES-1 - References

### DOCE-REFERENCES-1.1 - Targets

`referenceTargets(doc, template)` shall list the headings, figures, tables, code blocks and equations with an element id, in reading order by kind, each with its kind, its number as the stylesheet prints it, its title (a heading's text, an object's caption) and its label, the number then the title.

Implementation: `src/engine/references.ts`
Verification: `src/engine/references.test.ts`

### DOCE-REFERENCES-1.2 - Inserting a reference

`insertReference(source)` shall insert a reference in place of the selection, or change the reference holding the selection: to a target of the document, as the template formats its kind (`internalReferenceText`, from `references.formats`, the label by default), or to a citation a host found, keeping what it records of the document cited. It is refused where a reference may not go (`canInsertReference`): outside body text (DOCE-REFERENCES-1.6), or in text that takes no marks. An internal reference records its target's number, title and label (`referenceBaseline`, DOCE-REFERENCES-1.8).

Implementation: `src/engine/references.ts`
Verification: `src/engine/references.test.ts`, `e2e/references.spec.ts`

### DOCE-REFERENCES-1.3 - Following the target

After each change, `createReferences({ template })` shall bring every internal reference up to date, out of the undo history (`updateReferences`): its text as its target reads now, or, when the target is gone, marked broken with its text kept. A click on an internal reference in a read document, or a Ctrl or Cmd click in an edited one, takes the reader to its target (`revealElement`).

Implementation: `src/engine/references.ts`, `src/engine/reveal.ts`
Verification: `src/engine/references.test.ts`, `e2e/references.spec.ts`

### DOCE-REFERENCES-1.4 - Removing a reference

`removeReference` shall remove the reference holding the selection, keeping its text; `referenceAt(state)` gives that reference and `listReferences(doc)` every reference.

Implementation: `src/engine/references.ts`
Verification: `src/engine/references.test.ts`

### DOCE-REFERENCES-1.5 - Citations as they are now

`createReferenceStatus({ source, delay })` shall resolve the document's external citations through the host's reference source a moment after each change (500 milliseconds by default), each citation once, and mark a reference whose document or target is gone `unavailable` and one whose document's revision, number or title, or its target's, changed since it was cited `update` (`data-reference-status`, `referenceStatusAt`); `updateReference` takes the update of the reference at the selection, recording the citation as it is now and reading as its label. The context menu offers it.

Implementation: `src/engine/reference-status.ts`, `src/components/document-editor/element-entries.ts`
Verification: `src/engine/references.test.ts`

### DOCE-REFERENCES-1.6 - Where references go

A reference shall go in body text only (`isReferencePlace`): a paragraph, also in a list, a body cell, a quote or a layout column, or a footnote. A heading, a header cell, code, a script's output and a page header or footer take none. `updateReferences` shall leave a reference outside body text as it reads, so a heading that cites itself never grows. `repairPastedReferences(slice, state)`, a paste filter for the clipboard, shall take the references off pasted text that lands where none may go, keeping the text; pasted internal references then read as the template formats them, or broken without their target.

Implementation: `src/engine/reference-places.ts`, `src/engine/references.ts`
Verification: `src/engine/reference-places.test.ts`, `src/engine/references.test.ts`

### DOCE-REFERENCES-1.7 - Typing walks no reference

`createReferences` shall walk the document's references only after a change that may change what one reads (`touchesReferences`): a change that only replaces inline text of a paragraph or a footnote, adding and removing no reference, walks none. Nor does a remote change (`isRemote`, `isRemoteTransaction` by default), which already carries the sender's updates.

Implementation: `src/engine/reference-updates.ts`, `src/engine/references.ts`
Verification: `src/engine/reference-places.test.ts`

### DOCE-REFERENCES-1.8 - What an internal reference records

An internal reference shall record its target as it last read, its number, title and label (`referenceBaseline`, read with `referenceBaselineOf`), when inserted and each time it follows its target. `refreshReferences(template)` shall render every internal reference again as the template formats it now, out of the undo history, such as after the template changed, and is refused when none changes.

Implementation: `src/engine/references.ts`, `src/engine/reference-targets.ts`
Verification: `src/engine/reference-places.test.ts`

### DOCE-REFERENCES-1.9 - Citations out of reach and asked again

A reference whose citation the host resolves as `no-access` (DOCE-HOST-1.9) shall be marked `no-access`, and takes no update. `refreshReferenceStatus` shall forget how the host resolved every citation and ask it again, as when the host knows its documents changed. `updateReference` shall cite the target as the host names it now (`targetId`), so a citation whose target moved follows it.

Implementation: `src/engine/reference-status.ts`
Verification: `src/engine/references.test.ts`

## DOCE-REFERENCES-2 - Abbreviations

### DOCE-REFERENCES-2.1 - Inserting and switching

`insertAbbreviation(entry, display)` shall insert an abbreviation of a glossary entry in place of the selection, shown in full or short, carrying the marks of the text it replaces, and select it; `setAbbreviationDisplay(display)` switches the abbreviation selected between its forms, and `unlinkAbbreviation` turns it into plain text as it reads, keeping its marks.

Implementation: `src/engine/abbreviations.ts`
Verification: `src/engine/references.test.ts`, `src/engine/abbreviation-health.test.ts`, `e2e/references.spec.ts`

### DOCE-REFERENCES-2.2 - Refreshing from the glossary

`refreshAbbreviations(entries)` shall bring the abbreviations of the entries given up to date with them, and `documentAbbreviations(doc)` give the entries the document cites, as they last read.

Implementation: `src/engine/abbreviations.ts`
Verification: `src/engine/references.test.ts`

### DOCE-REFERENCES-2.3 - Abbreviation issues

`createAbbreviationHealth({ glossary, delay })` shall resolve the entries the document's abbreviations cite through the host's glossary a moment after each change that adds an entry it has not asked for, or whose last resolve failed (500 milliseconds by default), and mark an abbreviation whose entry the glossary no longer has `missing`, one whose entry is archived `archived`, and one that reads the same abbreviation, ignoring case, as another entry the document cites `duplicate` (`data-abbreviation-issue`, `abbreviationIssueAt`). `abbreviationIssues(doc, answer)` gives those issues from the glossary's answer, judging only the entries it was asked for.

Implementation: `src/engine/abbreviation-health.ts`
Verification: `src/engine/abbreviation-health.test.ts`

## DOCE-REFERENCES-3 - In the editor

### DOCE-REFERENCES-3.1 - The reference dialog

The toolbar's reference menu shall offer a reference in this document and, while the host gives a `referenceSource`, a reference to another document, each opening its own dialog (`data-reference`); Mod-K opens the first. The dialog for this document picks the target's kind (`REFERENCE_TARGET_KINDS`: heading, figure, table, code block, equation), then the target among those of the kind by its label, a new kind clearing a target that no longer fits; the one for another document picks a citation the host finds. Each inserts the reference or changes the one at the selection, and editing a reference opens the dialog of its kind. The context menu on a reference offers editing it, removing it and going to its target.

Implementation: `src/components/document-editor/reference-dialog.tsx`, `src/components/document-editor/element-entries.ts`
Verification: `e2e/references.spec.ts`

### DOCE-REFERENCES-3.2 - The abbreviation dialog

While the host gives a `glossary`, the toolbar's abbreviation button shall open the abbreviation dialog, which finds the glossary's entries, or adds one, prefilled from the selected text (`prefillAbbreviation`), and inserts its abbreviation. The context menu on an abbreviation switches its form and turns it into text.

Implementation: `src/components/document-editor/abbreviation-dialog.tsx`, `src/components/document-editor/element-entries.ts`
Verification: `e2e/references.spec.ts`
