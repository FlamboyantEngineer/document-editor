# Agent Instructions

This repository is a standalone document editor library built on `@flamboyantengineer/ui-components`. Read [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/CODING-GUIDELINES.md](docs/CODING-GUIDELINES.md) before changing it.

## Gates

Before every commit, run the checks that cover your change. All of them must pass:

```sh
npm run lint && npm run format:check && npm run typecheck
npm run check:references && npm run check:specs
npm run test:changed   # unit tests related to your changes since origin/dev
```

`npm run check` runs every gate, as CI does. Never weaken a lint rule, the denylist or a check to get green.

## Rules

- Follow [docs/CODING-GUIDELINES.md](docs/CODING-GUIDELINES.md) and [docs/TESTING-GUIDELINES.md](docs/TESTING-GUIDELINES.md).
- Generic controls come from `@flamboyantengineer/ui-components`. A control it lacks is requested there, not built here.
- Components emit hooks only: `de-` hook classes, data attributes and documented `--de-*` measured properties. No CSS and no styling dependency.
- Everything outside the editor is reached through the host adapters (`specs/HOST-ADAPTERS.md`): no globals, no singletons, no direct browser storage.
- Never name a host application or its domain terms anywhere in the repository, including commit messages and pull request text. `npm run check:references` enforces this for files.
- Every behaviour change updates its spec (`specs/`) and its tests, which name the `DOCE-` IDs.
- Serialized documents, element ids and template behaviour are compatibility contracts: keep them unchanged unless a spec change says otherwise.
