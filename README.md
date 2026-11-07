# document-editor

A paginated, template-driven document editor for React, built on [`@flamboyantengineer/ui-components`](https://github.com/FlamboyantEngineer/ui-components).

- **An extension of the base component library.** Every generic control (buttons, fields, menus, dialogs, panels, trees) comes from `@flamboyantengineer/ui-components`, a peer dependency. This library adds the document model, the editing engine, page layout, templates and the editor's own components.
- **Unstyled.** Like the base library, components emit hook classes (`de-<component>`, `de-<component>__<slot>`) and data attributes and load no CSS. The host styles them.
- **Embeddable.** A host mounts the editor and passes adapters for identity, permissions, documents, templates, assets and optional services ([specs/HOST-ADAPTERS.md](specs/HOST-ADAPTERS.md)). The editor reads no globals, so several instances run on one page.
- **Templates included.** The template model, validation, inheritance, page metrics, sections and styles ship here, with the building blocks for a template editor.

The library is in early `0.x` development and has no release yet.

## Entry points

| Entry point                                 | Contents                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `@flamboyantengineer/document-editor`       | Everything below.                                                          |
| `@flamboyantengineer/document-editor/host`  | Host adapter contracts, capabilities and an in-memory host.                |
| `@flamboyantengineer/document-editor/model` | The document schema and stored-markup helpers, safe to import on a server. |

## Develop

Node 22 is required.

```sh
npm ci
npm run check   # every gate: lint, format, types, references, specs, build and tests
```

[CONTRIBUTING.md](CONTRIBUTING.md) has the branch, versioning and source rules.
