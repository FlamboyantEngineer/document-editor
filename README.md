# document-editor

A paginated, template-driven document editor for React, built on [`@flamboyantengineer/ui-components`](https://github.com/FlamboyantEngineer/ui-components).

- **An extension of the base component library.** Every generic control (buttons, fields, menus, dialogs, panels, trees) comes from `@flamboyantengineer/ui-components`, a peer dependency. This library adds the document model, the editing engine, page layout, templates and the editor's own components.
- **Unstyled.** Like the base library, components emit hook classes (`de-<component>`, `de-<component>__<slot>`) and data attributes and load no CSS. The host styles them.
- **Embeddable.** A host mounts the editor and passes adapters for identity, permissions, documents, templates, assets and optional services ([specs/HOST-ADAPTERS.md](specs/HOST-ADAPTERS.md)). The editor reads no globals, so several instances run on one page.
- **Templates included.** The template model, validation, inheritance, page metrics, sections and styles ship here, with the building blocks for a template editor.

The library is in early `0.x` development and has no release yet.

## Entry points

| Entry point                                    | Contents                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `@flamboyantengineer/document-editor`          | Everything below.                                                                           |
| `@flamboyantengineer/document-editor/host`     | Host adapter contracts, capabilities and an in-memory host.                                 |
| `@flamboyantengineer/document-editor/model`    | The document schema and stored-markup helpers, safe to import on a server.                  |
| `@flamboyantengineer/document-editor/document` | Operations on whole documents that need no editor view, safe on a server.                   |
| `@flamboyantengineer/document-editor/collab`   | The shared-room binding and the conversion a room server runs, safe on a server.            |
| `@flamboyantengineer/document-editor/import`   | Documents of other formats read into stored documents, and content composed into templates. |

`./model`, `./document`, `./host` and `./collab` read no DOM when they load ([specs/ENTRY-POINTS.md](specs/ENTRY-POINTS.md)); `test/node-entry.test.ts` imports them in Node to keep it so.

The package is ESM only. A CommonJS server on Node 22 can `require()` the server entries; with TypeScript it compiles them under `module: node20` (TypeScript 5.9 or later), since `module: node16` refuses to `require` an ES module. Such a server loads its own CommonJS copy of ProseMirror beside the library's ES module one, so it hands the library stored documents, not ProseMirror objects: every server job has a stored-file function in `./document` (FORMAT.md §9).

## Tested set

The library has no release yet, so a host installs it, the base component library and the collaboration tools from git, by commit. It is tested as one set: `npm run check:consumer` packs the built package and installs it into an empty consumer beside the packages below, with strict peers (`--strict-peer-deps`, no `--force`, `--legacy-peer-deps`, overrides or nested copies), then again with `npm ci`, and requires one copy each of React, ProseMirror, Yjs, `lib0` and the base component library. CI runs it on every pull request.

| Package                                   | Tested                              |
| ----------------------------------------- | ----------------------------------- |
| `@flamboyantengineer/ui-components`       | the commit pinned in `package.json` |
| `@flamboyantengineer/collaboration-tools` | the commit pinned in `package.json` |
| `react`, `react-dom`                      | 19.2.7                              |
| `react-reconciler`                        | 0.33.0                              |
| `@handlewithcare/react-prosemirror`       | 3.3.0                               |
| `prosemirror-view`                        | 1.42.3                              |
| `@y/y`                                    | 14.0.0-rc.23                        |
| `lib0`                                    | 1.0.0-rc.22                         |

The text layout engine behind `textLayout: 'pretext'` uses a fork of the Pretext layout library, `@chenglou/pretext`, a dependency pinned in `package.json` to a commit of FlamboyantEngineer/pretext, so it installs with the package at that commit, from that git repository, which a host needs read access to as for the other git pins; its module loads only when the option is on, but a host's bundler resolves it either way, and the check imports it from the consumer.

Equations on the engine's pages are laid out by MathJax 4 with the STIX Two font data (`@mathjax/src` and `@mathjax/mathjax-stix2-font`, optional peers, Apache-2.0; the STIX Two outlines are under the SIL Open Font License 1.1). They load only when equations are laid out. A host's bundler maps MathJax's `#default-font` import to `@mathjax/mathjax-stix2-font/mjs`, or MathJax's default font is bundled as well (DOCE-PAGINATION-12.12).

`scripts/tested-set.json` holds the same set for the check. Peers follow one rule: a release candidate and `prosemirror-view` are exact, since the React binding and the base component library accept only `prosemirror-view` 1.42.3; the base component library is a peer within its `0.x` minor (`~0.1.0`), since before `1.0.0` every minor may break; other peers are caret ranges. `prosemirror-view` stays at 1.42.3 until the binding publishes a release that accepts a newer one.

The git pins move by hand, in the pull request that needs a newer sibling library: change the commit in `package.json`, run `npm install --strict-peer-deps`, then `npm run check:consumer`.

## Develop

Node 22 is required.

```sh
npm ci
npm run check   # every gate: lint, format, types, references, specs, build and tests
```

### Labs

Labs are static demo pages in `labs/`, one per area of the editor, bundled from `labs/src/<name>.lab.ts(x)`. A toolbar at the top of each page picks the stylesheet (the bundled Reference stylesheet `labs/reference.css`, the shadcn/ui stylesheet `labs/shadcn.css`, none, or a URL) and the theme it writes on the root element; the choice carries from page to page.

```sh
npm run labs         # install and build what is out of date, then serve labs/ and print the URL
npm run build:labs   # bundle every lab into labs/build/; add `-- --dev --watch` to rebuild on save
npm run test:labs    # browser tests against the built labs
npm run test:perf    # performance harness: the budgets in specs/LABS.md, measured on the scale lab
```

`npm run labs` runs `npm ci` when `package-lock.json` changed since the last install and `npm run build:labs` when a lab source changed since the last build. `npm run labs -- --dry-run` lists those steps without running them; `npm run serve:labs` serves `labs/` as it is. Both launchers start at port 4183 and print the next available URL if that port is busy. Set `LABS_PORT` or pass `-- --port 4200` to start elsewhere. Use `-- --strict-port` to require an exact port. Browser tests use the configured port in strict mode.

[CONTRIBUTING.md](CONTRIBUTING.md) has the branch, versioning and source rules.

### Historical discussion

Hosts can add `versions.loadSnapshot` beside `load` to return the required
`{ content, threads, template }` bundle from one immutable revision. `template` is
fully resolved, including inherited parent and base settings, and captured when
the revision is recorded. Historical views use it directly without live template
lookups. Changed discussion or resolved template settings requires a new revision.

When supported, `versions.create` must capture supplied content, its original
pin, discussion and the resolved template in one host transaction; the returned
revision identifies the entire bundle. If that consistent commit is impossible,
return `conflict` without publishing a version. Session version saves always
supply `baseContent`, a detached copy of the body and template pin before the
async hook. Compare it atomically before any history or label change and return
`conflict` if a concurrent save changed the baseline. Direct adapter calls may
omit it for explicitly unconditional creation, without concurrent-save protection.
Room hosts capture from the same room state, never from an unrelated live request.

`historicalEditorProps` supplies a read-only captured comment store for existing
panels and providers. Content-only legacy adapters show no historical discussion
and retain live resolution of their stored template pin; they do not guarantee
immutable presentation. Restore applies content and the original stored template
pin while preserving current discussion. It does not reinstate captured inherited
presentation: a floating pin keeps ordinary live resolution unless the host
explicitly materializes the captured settings.

### Optional reference presentation

The editor loads no CSS. To use the neutral lab presentation explicitly, import
`@flamboyantengineer/ui-components/reference.css`, then
`@flamboyantengineer/document-editor/reference.css`. Document presentation uses the
`document-reference` cascade layer; lab page layout is excluded. Hosts can instead
style the documented hooks themselves. A host stylesheet of its own should keep
`.de-document-editor__measure { zoom: var(--de-measure-zoom, 1); }`, so the pages are
measured, and laid out, the same on every screen (DOCE-PAGINATION-10.10); without it they
measure right at each screen's own device pixel ratio.

For the shadcn/ui look, import `@flamboyantengineer/ui-components/shadcn.css`, then
`@flamboyantengineer/document-editor/shadcn.css`, instead of the two reference sheets. It draws
with the page's shadcn/ui tokens (light, and dark under `.dark` or `data-theme="dark"`), gives the
editor's chrome the compact control scale and leaves the pages as paper.

### Linked spreadsheet captures

The optional `/host` helpers accept the structural output of a spreadsheet library's
`createLinkedSpreadsheetInsertion`, without a dependency on that library:

```ts
const embed = createLinkedSpreadsheetEmbed(capture, 'Summary');
insertEmbed(embed)(state, dispatch);
```

The standard persisted `embed` node owns selection, copying, deletion and locked
content. It stores source id, sheet and range in an opaque selection key, the captured
revision, and a stored table built from captured transport rows (`text`, `colspan`,
`rowspan`) used by history, export and print. Editor-specific node JSON and supplied
HTML are ignored. Formulas are never
calculated by this bridge. `createLinkedSpreadsheetAdapter(loadCapture)` connects a
host's authoritative capture loader to existing embed status and explicit `updateEmbed`;
refresh refuses read-only views and never runs automatically on historical content.

The supported ProseMirror integration uses `@handlewithcare/react-prosemirror` 3.3 with `prosemirror-view` exactly 1.42.3, as that binding requires. The development lock verifies React 19.2.7. A newer view release requires upstream binding support before this package can claim compatibility.
