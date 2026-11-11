# document-editor

A paginated, template-driven document editor for React, built on [`@flamboyantengineer/ui-components`](https://github.com/FlamboyantEngineer/ui-components).

- **An extension of the base component library.** Every generic control (buttons, fields, menus, dialogs, panels, trees) comes from `@flamboyantengineer/ui-components`, a peer dependency. This library adds the document model, the editing engine, page layout, templates and the editor's own components.
- **Unstyled.** Like the base library, components emit hook classes (`de-<component>`, `de-<component>__<slot>`) and data attributes and load no CSS. The host styles them.
- **Embeddable.** A host mounts the editor and passes adapters for identity, permissions, documents, templates, assets and optional services ([specs/HOST-ADAPTERS.md](specs/HOST-ADAPTERS.md)). The editor reads no globals, so several instances run on one page.
- **Templates included.** The template model, validation, inheritance, page metrics, sections and styles ship here, with the building blocks for a template editor.

The library is in early `0.x` development and has no release yet.

## Entry points

| Entry point                                    | Contents                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| `@flamboyantengineer/document-editor`          | Everything below.                                                          |
| `@flamboyantengineer/document-editor/host`     | Host adapter contracts, capabilities and an in-memory host.                |
| `@flamboyantengineer/document-editor/model`    | The document schema and stored-markup helpers, safe to import on a server. |
| `@flamboyantengineer/document-editor/document` | Operations on whole documents that need no editor view, safe on a server.  |

`./model`, `./document` and `./host` read no DOM when they load ([specs/ENTRY-POINTS.md](specs/ENTRY-POINTS.md)); `test/node-entry.test.ts` imports them in Node to keep it so.

## Develop

Node 22 is required.

```sh
npm ci
npm run check   # every gate: lint, format, types, references, specs, build and tests
```

### Labs

Labs are static demo pages in `labs/`, one per area of the editor, bundled from `labs/src/<name>.lab.ts(x)`. A toolbar at the top of each page picks the stylesheet (the bundled Reference stylesheet `labs/reference.css`, none, or a URL) and the theme it writes on the root element; the choice carries from page to page.

```sh
npm run labs         # install and build what is out of date, then serve labs/ at http://127.0.0.1:4183/
npm run build:labs   # bundle every lab into labs/build/; add `-- --dev --watch` to rebuild on save
npm run test:labs    # browser tests against the built labs
```

`npm run labs` runs `npm ci` when `package-lock.json` changed since the last install and `npm run build:labs` when a lab source changed since the last build. `npm run labs -- --dry-run` lists those steps without running them; `npm run serve:labs` serves `labs/` as it is. Both, and the browser tests, use port 4183; set the `LABS_PORT` environment variable to use another.

[CONTRIBUTING.md](CONTRIBUTING.md) has the branch, versioning and source rules.
