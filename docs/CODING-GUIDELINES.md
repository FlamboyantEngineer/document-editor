# Coding Guidelines

Every file in `src/`, `labs/src/`, `test/` and `e2e/` follows these rules; tests also follow [TESTING-GUIDELINES.md](TESTING-GUIDELINES.md). They are strict on purpose: one way to name, place, compose and write each thing keeps a large library predictable. They follow the base component library's guidelines, adapted to an editor that builds on that library. Rules marked **(enforced)** fail `npm run check`; the others are checked in review. Lint applies the size limits (C1), the no-class rule (I1) and the naming convention (N3, N6) to library source, `src/` without its tests; in labs, tests and browser tests those rules are checked in review.

## Naming

**N1. Files and directories are kebab-case.** A component lives in `src/components/<name>/` and its main module is `<name>.tsx` (or `<name>.ts` for a component family's pure model). Helpers beside it are named for what they do (`parse-svg-markup.ts`, `layers.ts`). **(enforced)**

**N2. One name per component, everywhere.** The directory name in PascalCase is the component (`button/` → `Button`); the spec is `specs/BUTTON.md`; the lab is `labs/button.html`; the browser test is `e2e/button.spec.ts`; the reference partial is `labs/reference/button.css`; the root hook class is `de-button`. A family shares its owner's names: its other components (`Spinner` beside `ProgressBar`, the parts of a menu) live in the owner's directory, are specified in the owner's spec and styled in the owner's partial, and only their root hook classes carry their own names (`de-spinner`). Utils in `src/utils/` that the package exports (`src/utils/index.ts`) are shared contracts, each named in the `Implementation:` line of a requirement; internal helpers are covered through the requirements of the components that use them. **(enforced)**

**N3. Components are PascalCase nouns without prefixes** (`Button`, not `UiButton` or `BaseButton`). Parts of a family start with the family's name or its noun (`Tabs` → `TabList`, `Tab`, `TabPanel`). **(enforced: naming convention)**

**N4. Props interfaces are `<Component>Props`** and are exported next to the component. Option types are `<Component><Option>` (`ButtonVariant`) unless the component uses a shared vocabulary type directly (N7).

**N5. Prop names follow one vocabulary.** States are `is*` booleans (`isDisabled`, `isSelected`, `isPending`, `isInvalid`, `isRequired`, `isReadOnly`, `isOpen`, `isExpanded`); options that are not states are plain words (`variant`, `size`, `orientation`, `truncate`); events are `on<Event>` (`onPress`, `onChange`, `onAction`, `onOpenChange`); controlled pairs are `value`/`defaultValue` with `onChange` (or `<thing>`/`default<Thing>` with `on<Thing>Change`); render callbacks are `render<Part>`; accessors are `get<Value>`. The item a component marks as the current one is `currentKey` (`defaultCurrentKey`, `onCurrentKeyChange`), and a single selection is `selectedKey` with `onSelectionChange(key)`; a multiple selection is `selectedKeys` with `onSelectionChange(keys)`. Collection keys, selections, placements, sorting and events use the shared types in `src/core/` (`Key`, `Selection`, `Placement`, `SortDescriptor`, `PressEvent`); values are plain data (dates as ISO 8601 strings, colours as CSS colour strings).

**N6. Functions say what they do.** Hooks are `use<Thing>`; pure functions start with a verb (`formatPath`, `resolveOverlayPlacement`, `createModalController`); predicates start with `is`, `has` or `can`. Module constants are `UPPER_SNAKE_CASE` only for exported primitive defaults (`DEFAULT_OVERLAY_GAP`); everything else is camelCase. **(enforced: naming convention, for camelCase and PascalCase in library source; keeping `UPPER_SNAKE_CASE` to exported primitive defaults is checked in review)**

**N7. Shared vocabularies come from `src/core/props.ts`.** Sizes are `Size` values (`xs`, `sm`, `md`, `lg`, `xl`), tones are `Tone` values (`neutral`, `info`, `success`, `warning`, `danger`), orientation is `Orientation`, density is `Density` (`tight`, `compact`, `default`, `comfortable`, with `default` as the baseline). Control heights are `ControlSize`; use it rather than a component-named alias. A component that offers another subset derives it: `type StepsDensity = Extract<Density, 'default' | 'compact'>`. Never invent a synonym (`error` for `danger`, `medium` for `md`, `regular` for `default`).

**N8. Hooks follow the contract.** Root class `de-<name>`, slot class `de-<name>__<slot>`, data attributes and values in kebab-case, all built with `createHooks` (`specs/HOOK-CONTRACT.md`). A component calls `createHooks` once: a component whose modules share hooks declares them in one `<name>-hooks.ts` module that the others import. **(one call per name enforced)**

## Structure

**S1. Ten places for code.** `src/model/` holds the server-safe document model (schema, stored format, templates and their settings, numbering, references), with no DOM or React; `src/document/` holds the operations on whole documents that need no editor view; `src/import/` holds reading other formats into stored documents and composing content into templates; `src/host/` holds the host adapter contracts and their in-memory implementations (`specs/HOST-ADAPTERS.md`); `src/engine/` holds the editing runtime (commands and plugins); `src/pagination/` holds measuring blocks and laying the document out on pages; `src/session/` holds the document session (store and room modes, saving and status), with no framework; `src/collab/` holds the shared-room binding and the conversion a room server runs; `src/components/<name>/` holds one editor component or one family, built from `@flamboyantengineer/ui-components`; `src/utils/` holds helpers used by more than one of these, and a helper used by one lives beside it. Nothing else lives in `src/` but the package's root `index.ts`.

**S2. A component directory contains** `index.ts`, the main module `<name>.tsx`, optional helper modules, and the unit tests `<module>.test.ts(x)` beside the modules they test. **(enforced)**

**S3. `index.ts` only re-exports** the public API with named `export … from` statements. No default exports anywhere (TS7). **(enforced)**

**S4. Import other components through their main module** (`../icon/icon.js`), never through another component's helper modules, except a server-safe helper module of a component whose main module is a client module: a server-safe caller imports such a helper from the module that defines it (`../filter-bar/filter-matching.js`), since through the client main module the server would receive a client reference (the base library's server-components rule). Labs import a component through its entry point (`index.js`) or its main module. Relative imports end in `.js`; types use `import type`. A module is imported in one statement, with type-only names marked inline (`import { Icon, type IconSource }`) or the whole statement `import type` when every name is a type, and a file's imports and `export … from` statements are sorted: packages first, then relative paths (`npx eslint --fix` sorts them). **(enforced: lint)**

**S5. Every public component is complete:** a spec with its hook table, unit tests that name the spec's requirement IDs, a lab with its full state matrix, a browser test, and a reference partial when the spec declares class hooks. **(enforced)**

**S6. Module order:** imports, exported types, module constants, private helpers, exported components and hooks.

**S7. Controls come from the base component library.** Buttons, fields, menus, popovers, dialogs, panels, trees and every other generic control are imported from `@flamboyantengineer/ui-components`, never rebuilt here and never taken from React Aria directly. A generic control the editor needs and the base library lacks is requested there first. **(enforced: lint)**

**S8. No import cycles between components.** Runtime imports (type-only imports aside) never form a cycle that spans two component directories: a leaf such as `Avatar` must not reach back, through a component it opens or wraps, to a module that imports it. Break such a cycle by moving the shared part into its own component, as `UserCardTrigger` is split from `UserCard`. Cycles between the modules of one component are allowed but best avoided. **(enforced)**

## Inheritance and composition

**I1. Function components only.** No classes in library source, including subclasses of third-party classes: wrap or compose them instead. **(enforced in library source)**

**I2. Props are declared by the library.** Every component that renders an element has props that extend `BaseProps` (`className`, `id`, caller `data-*`), `RefProps<E>` with its root element's type (never a root `ref` declared in place or picked from `NativeProps`; a `ref` that reaches another element, such as a composer's text area, is declared and documented in place), and the shared prop groups it supports (`PressEventProps`, `FocusEventProps`, `AriaLabellingProps`, `OpenStateProps`, `SelectionProps` and the others in `src/core/events.ts`), then declares its own props. It never extends or exposes a building block's props or types: a building block is how the component works today, not its API ([specs/PRIMITIVES.md](../specs/PRIMITIVES.md)). Declare only what the spec documents and the tests and lab use; inside the component, pass the props on to the building block. A component whose element the caller may swap takes `render` typed `ElementRender<E, State>` with a library-declared state ([specs/COMPOSITION.md](../specs/COMPOSITION.md)):

```ts
export interface ButtonProps
  extends BaseProps, PressEventProps, FocusEventProps, AriaLabellingProps {
  variant?: ButtonVariant | undefined;
  isDisabled?: boolean | undefined;
  render?: ElementRender<'button', ButtonRenderState> | undefined;
}
```

**(enforced: every exported component's props include `BaseProps`, except providers, hosts and controllers that render no element of their own; `npm run check:public-types` fails on any public declaration that exposes a building block)**

**I3. Specialise by composition.** A specialised component renders the general one with fixed props (`CopyButton` renders `Button`); it does not copy its markup or logic. Shared behaviour that two components need lives in one exported helper or hook, never in two copies.

**I4. Forward, do not filter.** Spread the remaining props onto the wrapped component or root element, and let `createHooks(...).root({ className, props, data })` merge hook classes and caller attributes. Hook values the component writes win over caller attributes of the same name.

**I5. Render a context as `<Context value>`.** The library targets React 19, so a provider renders the context itself, never `<Context.Provider>`, which React plans to deprecate. **(enforced)**

## Simplicity

**C1. Small units.** A function has at most 80 lines and a cyclomatic complexity of at most 15, nests at most three levels deep, and takes at most three parameters (pass an options object instead). A module has at most 300 lines; split helpers into sibling modules before that. **(enforced in library source)**

**C2. No speculative surface.** Every prop, export and option is exercised by a unit test and shown in the lab. Remove what nothing uses.

**C3. Prefer the platform and the building blocks.** Use the behaviour of the base component library (press, focus, keyboard, overlays, collections) before writing your own; derive values during render instead of storing them in state; reach for an effect only to synchronise with something outside React.

**C4. Comments explain why, not what.** Document public props in one line of TSDoc; comment only non-obvious constraints and workarounds. No commented-out code, no narration, no decorative separators.

**C5. No dead code.** No unused exports, parameters, branches or files. **(enforced: lint for unused variables, parameters and imports; unused exports and files are checked in review)**

**C6. Refs stay out of render.** Never read or write a ref's `current` while rendering; read refs in effects and event handlers. A value render needs lives in state: an object made once comes from a `useState` initializer, and an element render measures is held through a callback ref (`ref={setElement}`). Keep the latest value for handlers with `useLatest`, which writes in a layout effect, an equal value with `useEqualValue`, and merged refs with `useMergedRefs`. A hook that returns refs beside render values is destructured at the top of its caller (`const { ref, isOpen } = useThing()`), never read field by field, and only a `RefObject` has a field named `current`. A handler that reads a ref is made inside the hook that owns the ref, not built in render and passed to a plain function. A ref that a hook other than `useRef` returns is named `…Ref`, so the compiler knows it for one. **(enforced: `react-hooks/refs`)**

**C7. Components and hooks satisfy the React Compiler's rules.** Every rule of `eslint-plugin-react-hooks`'s `recommended-latest` set runs at error over `src`, `labs/src` and `test`: no mutation of props, state or hook results (`immutability`), no impure calls during render (`purity`), no writes to outer variables from a component (`globals`; a test captures a component's setter through `useImperativeHandle` or records through a spy), no synchronous `setState` in an effect unless a comment says why the DOM must commit first (`set-state-in-effect`), and manual memoization the compiler can keep. A host that compiles with the React Compiler then optimises every component. **(enforced)**

## TypeScript

Adapted from the agent-rules TypeScript set ([coding-rules/README.md](coding-rules/README.md)). They apply to every TypeScript file. The enforced ones run in `npm run lint` through the `document-editor/typescript` configs in `eslint.config.js`, which load the TypeScript program; ESLint runs with a 6 GB heap for that reason.

**TS1. `strict` stays on.** Do not weaken `tsconfig.json` to make a file compile.

**TS2. No `any`.** Use `unknown` and narrow it; wrap a third-party `any` at the boundary that receives it. **(enforced: `@typescript-eslint/no-explicit-any`)**

**TS3. No non-null assertions (`value!`).** Narrow the value, restructure so the type proves it, or throw an `Error` where the invariant would break. **(enforced: `@typescript-eslint/no-non-null-assertion`)**

**TS4. No `@ts-ignore` or `@ts-nocheck`.** A `@ts-expect-error` carries a description of what removes it. **(enforced: `@typescript-eslint/ban-ts-comment`)**

**TS5. Import a type-only binding with `import type`** (S4). An import whose names are all types is a whole `import type` statement, so the compiled module drops it instead of keeping an empty side-effect import. **(enforced: `@typescript-eslint/consistent-type-imports`, `@typescript-eslint/no-import-type-side-effects`)**

**TS6. No `enum`.** Use a string-literal union, or an `as const` object with a derived type. **(enforced)**

**TS7. Named exports only.** A default export is allowed only where a loader requires it: the Vitest and Playwright configuration files. **(enforced: `no-restricted-exports`)**

**TS8. A `switch` over a union handles every member,** or ends in a `default` that handles the rest on purpose. **(enforced: `@typescript-eslint/switch-exhaustiveness-check`)**

**TS9. No floating promises.** `await` a promise, return it, or mark a deliberately detached one with `void` and handle its rejection. Do not pass an async function where the callee expects a synchronous callback. **(enforced: `@typescript-eslint/no-floating-promises`, `@typescript-eslint/no-misused-promises`)**

**TS10. Throw and reject with `Error` objects,** never strings or plain objects. Rethrowing a caught `unknown` value is allowed. **(enforced: `@typescript-eslint/only-throw-error`, `@typescript-eslint/prefer-promise-reject-errors`)**

**TS11. When a `catch` block throws a new error, attach the caught one as `{ cause }`.** **(enforced: `preserve-caught-error`)**

**TS12. Return a discriminated result for expected failures** a caller branches on (`{ ok: true, value } | { ok: false, error }`) instead of throwing.

**TS13. Prefer `type` for unions and derived shapes,** and `interface` for object shapes callers extend, such as props (N4, I2).

**TS14. Give an exported function an explicit return type** when the inferred one is a wide object or a promise the caller must branch on.

**TS15. Three compiler programs check the code** (`npm run typecheck`).

- `tsconfig.json` checks library source, tests, labs and configs with Node's globals, which the tests need.
- `tsconfig.build.json` checks library source again without them (`types: []`), as the build compiles it.
- `tsconfig.scripts.json` checks the Node scripts, local lint rules and `eslint.config.js` as JavaScript (`checkJs`). An unannotated parameter there is `any`, and everything else is strict.
- Library source compiles in both global environments, so a timer handle is typed `ReturnType<typeof setTimeout>`, which holds in both.
- Beyond `strict`, the programs set `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns` and `noFallthroughCasesInSwitch`.
- Three flags are deliberately off:
  - `exactOptionalPropertyTypes`: optional props declare `| undefined` so callers may pass `undefined`, but the flag would also reject spreading partial objects at about 200 sites.
  - `noPropertyAccessFromIndexSignature`: records keyed by id are read with dot access.
  - `isolatedDeclarations`: public types are inferred where TS14 does not ask for them.
    **(enforced: `npm run typecheck`)**

## Node scripts

Adapted from the agent-rules Node.js set. They apply to `scripts/` and the configuration files; library source runs in the browser and never reads `process.env` or Node APIs.

**R1. Target the Node version in `package.json` `engines`** (Node 22).

**R2. Read options from arguments,** and environment variables only at the script's entry point, with a default.

**R3. Fail loudly.** A check exits non-zero with a message naming the file and the rule it broke; an unexpected failure stays an `Error` with its original `cause`.

**R4. Scripts that write files can run twice with the same result,** and a script that deletes files deletes only build output.

## Security

Adapted from the agent-rules security set. They apply everywhere.

**SEC1. Markup from the host is untrusted.** Render text as text. Markup components parse what they render through the library's sanitizer (`sanitize-html.ts`) or their own allow-list parser; never pass unsanitized input to `dangerouslySetInnerHTML`.

**SEC2. No `eval`, `new Function` or string timers.**

**SEC3. Component validation is a convenience for the reader, never proof.** Do not describe it as a security check; the host validates on its server.

**SEC4. Keep secrets and tokens out of the repository and out of browser storage.** Persisted state goes through the provider storage adapter.

**SEC5. Pass shell arguments as arrays** (`execFileSync(command, args)`), never as a concatenated command string.

**SEC6. Add dependencies through `npm`** so the lockfile records them.

## Design

**D1. Design for less complexity.** New and touched code follows [coding-rules/a-philosophy-of-software-design.mini.md](coding-rules/a-philosophy-of-software-design.mini.md), vendored unchanged from agent-rules-books. It is review guidance, not lint. In short: measure a design by the complexity a reader must carry, prefer deep modules with small interfaces over pass-through layers, keep each decision inside the module that owns it, define invalid states away rather than making callers defend against them, and use names and comments to state contracts, not mechanics. Where it overlaps a numbered rule, the numbered rule wins.
