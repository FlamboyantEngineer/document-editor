# Contributing

## Branches and pull requests

- `dev` is the integration branch. Work happens on short-lived branches cut from `dev` and merged back into `dev` by pull request.
- `main` is always releasable. It is updated only from `dev`, through a reviewed release pull request once the full checks pass on `dev`.
- `npm run check` must pass before a pull request merges. Hosted CI runs ordinary gates separately from the packed-consumer check and the browser tests: four Chromium shards, a device pixel ratio job and one dedicated timing job. On a push to dev whose tree already passed `check` in its pull request, nothing runs again and only the caches are kept current. Both room guard test files, including their functional cases, run through `test:guard-budgets` sequentially with one worker on that timing runner before its browser budgets. Locally `check` runs this gate in its own final stage, and `test:changed` always runs it after related ordinary tests. Its required `check` job passes only when every one of them passed.

## Versioning

The library is in `0.x` development. APIs and styling hooks are experimental until `1.0.0`: use minor versions for API additions, removals and reorganizations, and patches for fixes that keep the API. Remove obsolete APIs and migrate usage without deprecation periods or compatibility shims.

The serialized document format is stricter than the API: a document saved by any released version opens unchanged in every later version.

Releases are `v<version>` git tags, installed by hosts as git dependencies, as the base component library does.

## Source rules

Code follows [docs/CODING-GUIDELINES.md](docs/CODING-GUIDELINES.md). In addition:

- **No styles in source.** No stylesheet imports and no styling dependency. Literal class names are `de-` hook classes, except the class names a serialized document carries, which its spec lists.
- **No direct browser storage.** Persisted interface state goes through the base library's provider storage.
- **Neutral wording.** Code, comments, docs, specs, fixtures, tests and package metadata never name a host application or its domain vocabulary. `npm run check:references` scans every authored file and path against the encoded denylist that ui-components shares with every library built on it (`tooling/reference-denylist.json` there). To add a term, add the output of `npx ui-components-tooling check-references --encode '<regex>'` to that list in ui-components. `check:specs` and `check:exports` (exports nothing outside their file uses; `--fix` drops them) are shared the same way; this repository's settings are in `tooling.config.mjs`.

## Specs and tests

- Specs in `specs/` follow [specs/README.md](specs/README.md): `DOCE-` requirement IDs with `Implementation:` and `Verification:` lines. `npm run check:specs` validates them.
- Unit tests (Vitest, jsdom, Testing Library) sit next to the source as `*.test.ts(x)` and name the requirement IDs they verify.
