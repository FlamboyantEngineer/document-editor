# Word fixtures

Generic word processing documents for the import tests ([IMPORT.md](../../../specs/IMPORT.md)) and the Word writer's export-then-import test. They are generated, not stored: [`build-docx-fixture.ts`](build-docx-fixture.ts) wraps the XML parts a fixture gives in the package parts every document has and zips them with each part deflated, as word processors write them. [`fixtures.ts`](fixtures.ts) holds one fixture per feature the import contract covers: styles, numbering, sections, notes, comments, tables, images, and the shapes the library's writer adds (code captions, rules, list paragraphs and section-only paragraphs).

The style and numbering names follow the mapping the writer and the reader share: heading styles `Heading1` to `Heading6`, `Title`, `ParagraphLevel2` to `ParagraphLevel6`, custom styles as `Custom_<key>`, and abstract numberings named `Headings`, `Paragraphs`, `Bullets` and `Numbers`.

Write new text. Never copy a host application's documents, names or terms; `npm run check:references` scans these files. Only Node runs the builder, so a test that uses it starts with `// @vitest-environment node`.
