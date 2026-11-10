# References

References citing a heading, figure, table, code block or equation of the document, or another document a host finds, and abbreviations citing a glossary's entries.

## DOCE-REFERENCES-1 - References

### DOCE-REFERENCES-1.1 - Targets

`referenceTargets(doc, template)` shall list the headings, figures, tables, code blocks and equations with an element id, in reading order by kind, each with its kind, its number as the stylesheet prints it, its title (a heading's text, an object's caption) and its label, the number then the title.

Implementation: `src/engine/references.ts`
Verification: `src/engine/references.test.ts`

### DOCE-REFERENCES-1.2 - Inserting a reference

`insertReference(source)` shall insert a reference in place of the selection, or change the reference holding the selection: to a target of the document, as the template formats its kind (`internalReferenceText`, from `references.formats`, the label by default), or to a citation a host found, keeping what it records of the document cited. It is refused where a reference may not go (`canInsertReference`): outside text that takes marks, or in code.

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

## DOCE-REFERENCES-2 - Abbreviations

### DOCE-REFERENCES-2.1 - Inserting and switching

`insertAbbreviation(entry, display)` shall insert an abbreviation of a glossary entry in place of the selection, shown in full or short, and select it; `setAbbreviationDisplay(display)` switches the abbreviation selected between its forms, and `unlinkAbbreviation` turns it into plain text as it reads.

Implementation: `src/engine/abbreviations.ts`
Verification: `src/engine/references.test.ts`, `e2e/references.spec.ts`

### DOCE-REFERENCES-2.2 - Refreshing from the glossary

`refreshAbbreviations(entries)` shall bring the abbreviations of the entries given up to date with them, and `documentAbbreviations(doc)` give the entries the document cites, as they last read.

Implementation: `src/engine/abbreviations.ts`
Verification: `src/engine/references.test.ts`

## DOCE-REFERENCES-3 - In the editor

### DOCE-REFERENCES-3.1 - The reference dialog

The toolbar's reference button and Mod-K shall open the reference dialog, which picks a target of the document by its label, or, while the host gives a `referenceSource`, a citation it finds, and inserts the reference or changes the one at the selection. The context menu on a reference offers editing it, removing it and going to its target.

Implementation: `src/components/document-editor/reference-dialog.tsx`, `src/components/document-editor/element-entries.ts`
Verification: `e2e/references.spec.ts`

### DOCE-REFERENCES-3.2 - The abbreviation dialog

While the host gives a `glossary`, the toolbar's abbreviation button shall open the abbreviation dialog, which finds the glossary's entries, or adds one, prefilled from the selected text (`prefillAbbreviation`), and inserts its abbreviation. The context menu on an abbreviation switches its form and turns it into text.

Implementation: `src/components/document-editor/abbreviation-dialog.tsx`, `src/components/document-editor/element-entries.ts`
Verification: `e2e/references.spec.ts`
