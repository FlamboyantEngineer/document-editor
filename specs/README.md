# Specs

Each file in this directory specifies one component, one family of components, or one shared contract. Specs are the source of truth for behaviour and for styling hooks; tests and labs verify them.

## Ownership

| Document                                 | Owns                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| [HOST-ADAPTERS.md](HOST-ADAPTERS.md)     | The adapters a host passes in, capabilities and the in-memory host.     |
| [DOCUMENT-SCHEMA.md](DOCUMENT-SCHEMA.md) | The document's node and mark types, their stored markup and references. |
| [FORMAT.md](FORMAT.md)                   | The stored document and template formats and template inheritance.      |
| [NUMBERING.md](NUMBERING.md)             | Numbering formats, counter styles and caption placement.                |
| [TEMPLATES.md](TEMPLATES.md)             | Template CSS values, inheritance, footnotes, captions and sections.     |
| [PAGINATION.md](PAGINATION.md)           | Laying sections out on pages, and joining split blocks back.            |
| [LAYOUT.md](LAYOUT.md)                   | The web layout, layout sections and their commands, and reading time.   |
| [SECTIONS.md](SECTIONS.md)               | A document's sections in their template scopes, and their commands.     |
| [SUGGESTIONS.md](SUGGESTIONS.md)         | Suggest mode, suggested insertions and deletions, and deciding them.    |
| [COMMENTS.md](COMMENTS.md)               | Comment anchors, the comments margin and suggestion threads.            |
| [VERSIONS.md](VERSIONS.md)               | Comparing versions and showing their changes, with change bars.         |
| [CONTENTS.md](CONTENTS.md)               | The catalog of headings and objects, and lists of contents.             |
| [EDITING.md](EDITING.md)                 | Element ids, the document's keys and the editing extension.             |
| [TABLES.md](TABLES.md)                   | Table editing, moving rows and columns, and the table handles.          |
| [PROOFING.md](PROOFING.md)               | Proofing the document's text with the host's proofer, and its issues.   |
| [DOCUMENT-EDITOR.md](DOCUMENT-EDITOR.md) | The document editor component: its layouts, modes and hooks.            |
| [LABS.md](LABS.md)                       | Starting the labs, and the lab toolbar's stylesheet and theme.          |
| `<AREA>.md`                              | One area's behaviour and, for a component, **its hook list**.           |

A component's hooks are listed only in its own spec. No hook is declared in two specs.

## File format

- File names are `UPPER-KEBAB.md`, named after the component (`HOST-ADAPTERS.md`, `TOOLBAR.md`).
- The first line is a `# Title` heading.
- Requirements are grouped under `## DOCE-<AREA>-<n> - <Group title>` headings. Each requirement is a `### DOCE-<AREA>-<n>.<m> - <Title>` heading followed by its statement, then two lines:

  ```markdown
  Implementation: `src/components/toolbar/toolbar.tsx`
  Verification: `src/components/toolbar/toolbar.test.tsx`
  ```

  - `<AREA>` is the spec's name in upper case (`HOST`, `TEMPLATES`, `TOOLBAR`).
  - `Implementation:` lists the files that implement the requirement, each in backticks.
  - `Verification:` lists the tests that verify it, each in backticks. At least one of those tests names the requirement ID in a test title or comment.
  - Within a group, requirements are numbered from 1 without gaps and appear in number order, and groups appear in ascending order (gaps between group numbers are allowed). A requirement sits under its own group's heading.
  - IDs are never reused. A withdrawn requirement keeps its heading with the statement `Withdrawn.` and its last verification.

- Optional test sequences use `### DOCE-<AREA>-T<n>.<m> - <Title>` headings for multi-step browser checks.
- A component spec ends with a `## Hooks` section holding one table:

  ```markdown
  ## Hooks

  | Hook                 | Kind      | Values        | Description                    |
  | -------------------- | --------- | ------------- | ------------------------------ |
  | `de-toolbar`         | root      |               | The toolbar element.           |
  | `de-toolbar__group`  | slot      |               | One group of related commands. |
  | `data-layout`        | attribute | `page`, `web` | Layout mode.                   |
  | `data-overflowing`   | state     | `true`        | While commands overflow.       |
  | `--de-toolbar-width` | property  |               | Measured width, in pixels.     |
  ```

  - `root`: a `de-<component>` class. `slot`: a `de-<component>__<slot>` class whose root is in the same table.
  - `attribute`: a `data-*` option the caller chooses (variant, size, orientation). `state`: a `data-*` state the component or React Aria sets.
  - `property`: a measured `--de-*` custom property set inline.
  - `Values` lists the allowed values in backticks; empty means free text (an ID, a count).

`npm run check:specs` enforces this format, including the group headings and numbering, the existence of every listed path, that the listed tests name each ID, that every component directory is implemented by some spec, and, once labs exist, that the reference stylesheet partials (`labs/reference/`) style every root and slot hook.

## Host requirement IDs

Specs never mention a host application or its requirement IDs. A host that maps its own IDs to `DOCE-` IDs keeps that map in its own repository.
