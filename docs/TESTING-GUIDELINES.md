# Testing Guidelines

Every unit test in `src/`, `labs/src/` and `test/` and every browser test in `e2e/` follows these rules, on top of the [coding guidelines](CODING-GUIDELINES.md). Tests verify the specs: they read the page as a reader does and act as a reader does, and they name the requirement they check. Rules marked **(enforced)** fail `npm run check`; the others are checked in review.

## Files and names

**T1. TypeScript next to the source.** A unit test is `<module>.test.ts`, or `.test.tsx` when it renders, beside the module it tests (`table-row.tsx` → `table-row.test.tsx`). `test/` holds repository-wide tests (package manifest, lint rules, the spec checker) and shared fixtures (`test/*-fixtures.tsx`, `test/hooks.ts`). Browser tests are `e2e/<component>.spec.ts`. **(enforced: Vitest only collects `*.test.ts(x)`; `check:structure` requires `<name>.test.tsx` for each component)**

**T2. Test names start with the requirement IDs they verify**, then say what the reader sees: `it('DOCE-TABLES-2.1 adds a row below with Tab in the last cell', …)`. A test may name several IDs; an ID may be split over several tests. `check:specs` fails when no test listed under a requirement's `Verification:` names its ID. **(enforced)**

**T3. Check hooks against the spec.** The test that first renders a component's parts calls `expectHooksMatchSpec(container, 'SPEC-NAME', { slots, callerAttributes })` from `test/hooks.ts`. It fails on any `de-*` class, `data-*` attribute or `--de-*` property the spec does not declare, and on a required slot that did not render. Pass `document.body` for parts that render in a portal (popovers, menus, dialogs), and list the `data-*` attributes the test passed itself in `callerAttributes`.

## Queries

**T4. Query through `screen` by role, label or text**, narrowed with `within(element)`: `screen.getByRole('button', { name: 'Save' })`, `within(row).getByRole('checkbox')`. A role and name query also checks that the element is exposed to assistive technology.

**T5. Hooks are public API, so tests may read them.** `container.querySelector('.de-toolbar__group')`, `closest('.de-page')` and `toHaveAttribute('data-dirty', 'true')` check the styling contract (`specs/HOOK-CONTRACT.md`). That is why `testing-library/no-node-access` and `testing-library/no-container` are off. Do not reach into markup that is not a hook or an ARIA relationship.

**T6. No test ids.** Query by role, label, text or a documented hook, never `getByTestId`. A `data-testid` may appear only as a caller attribute the test checks is forwarded. **(enforced: lint)**

**T7. Keep queries cheap in large widgets.** A role query computes the role, name and visibility of every candidate in its scope, which is slow in a table or tree with hundreds of elements (a query can take longer than the press it precedes). Scope with `within` to the row or panel, keep a reference instead of querying the same element again (elements survive re-renders), find menu items inside the menu that `findByRole('menu')` returned, and use `getByLabelText` for a control named by `aria-label` when a role query is the slow part.

## Interaction

**T8. Act through `userEvent`.** Start each test that interacts with `const user = userEvent.setup()` and await every call (`await user.click(…)`, `await user.keyboard('{ArrowDown}')`). user-event sends the pointer, focus and keyboard sequence a browser would, which React Aria's press and focus handling relies on.

**T9. `fireEvent` only for what user-event cannot produce:** scroll, wheel, load, error, drag and drop (`dragStart` to `dragEnd`), `pointerCancel`, `lostPointerCapture`, composition events and the key events an input method sends while it composes (`isComposing`, key code 229). Lint rejects every `fireEvent` call; each allowed one carries an `eslint-disable-next-line testing-library/prefer-user-event` comment, or a disable and re-enable pair around a block, that says which of these it simulates. No file disables the rule as a whole. An input-method test presses its keys through `pressComposingKeys` (`test/composition.ts`) unless it checks a sequence that helper does not send. **(enforced: `testing-library/prefer-user-event`; the reason on each disable is checked in review)**

**T10. Fake timers go through user-event.** `test/setup.ts` lets Testing Library advance Vitest's fake clock (it settles each call on a zero timeout through a global `jest`), so plain `vi.useFakeTimers()` works and a test can check delays to the millisecond; use `{ shouldAdvanceTime: true }` only when real time passing does no harm. Set up the user with `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`, advance time inside `act(() => vi.advanceTimersByTime(ms))`, and restore real timers in `afterEach(() => vi.useRealTimers())`. Without `advanceTimers`, user-event's own delays wait on frozen timers and the test hangs.

**T11. Wait for what React Aria defers.** Overlays open after the press, focus moves into them and back to the trigger in a later frame, and some focus moves follow a re-render. Use `await screen.findByRole('menu')`, `await waitFor(() => expect(trigger).toHaveFocus())` or `findBy` queries for those, and plain `getBy` queries for everything that is synchronous. Never sleep for a fixed time.

## Speed and isolation

**T12. Tests are parallel-safe and order-independent.** Each test renders its own tree and builds its own fixtures; `test/setup.ts` unmounts after every test, and the Vitest config restores mocks and stubbed globals. Restore anything else a test changes (`vi.useRealTimers()`, prototype stubs, listeners on `window` or `document`), write temporary files under `mkdtemp`, and never depend on another test's state. Vitest runs each test file in its own VM context (`pool: 'vmThreads'`): a fresh jsdom window and a fresh module graph, React Aria and every other dependency included, so native observers, queued overlay callbacks, storage and module state cannot reach another file's document. The worker threads stay up, so a file pays for neither a new process nor a cold module loader; do not inline dependencies or switch back to a process per file. Clearing document attributes or resetting modules in a reused DOM realm cannot provide that guarantee. Restore a window function a test replaces by writing the original value back; restoring its property descriptor leaves the fake in place. Wait with `waitFor` for focus that a component moves after a frame, such as focus returning from a closed overlay, rather than asserting it right after the key press. The suite runs four workers by default and must pass with any `--maxWorkers`.

**T13. Keep each test under the 5 second default on a loaded machine.** Split a long test into focused ones that start from the state they need (pass a `defaultValue` that already holds the earlier steps) rather than chaining every step in one test, and remove waits that are not needed. Raise a timeout only for a flow that is inherently long, with a comment saying why (for example, the `Table` suite's full React Aria grids).

**T14. Run in jsdom unless the test needs Node only.** A test that reads files or spawns scripts starts with `// @vitest-environment node`. jsdom has no Web Animations; `test/setup.ts` stubs `getAnimations`.

## Lint rules that are off

The Testing Library and jest-dom plugins lint every test. These rules are off on purpose:

| Rule                                | Why                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `testing-library/no-node-access`    | Hooks are public API (T5).                                                                                                            |
| `testing-library/no-container`      | Same reason: tests read hook classes through the container.                                                                           |
| `jest-dom/prefer-to-have-style`     | Functional inline styles and `--de-*` properties are hooks checked as written; `toHaveStyle` compares jsdom's computed style instead. |
| `jest-dom/prefer-to-have-value`     | `aria-valuenow` is checked as the attribute string; `toHaveValue` reads range roles as numbers.                                       |
| `testing-library/no-manual-cleanup` | Disabled in `test/setup.ts` only: Vitest runs without globals, so Testing Library cannot register its own cleanup.                    |

## Browser tests

**T15. Open labs through the `lab` fixture** from `e2e/fixtures.ts`: `await lab.open('<name>')` waits until the lab has rendered and its stylesheet has loaded, `await lab.expectAccessible(selector)` runs axe on that part of the page, and any page or console error fails the test. Locate cases by their state matrix cell (`[data-lab-cell="state=pending size=md"]`) or demo (`[data-lab-demo="…"]`), then by role.

**T16. Retry values that settle with `toPass`.** Scroll positions, measured sizes and anything that follows animation frames are checked inside `await expect(async () => { … }).toPass()` rather than read once.

**T17. Control time with `page.clock`.** Call `page.clock.install()` before `lab.open`, and pause the clock (`pauseAt`) only once overlays have opened, since popovers need running timers to appear.

**T18. Run axe on settled overlays.** Wait until an overlay has no `data-entering` or `data-exiting` attribute before `lab.expectAccessible`: mid-transition opacity produces false contrast violations.

**T19. Mind the sticky lab toolbar.** The lab chrome is a sticky bar at the top of the page; a target scrolled to the top edge sits under it and the click lands on the toolbar. Bring targets into view with `scrollIntoViewIfNeeded()` and let scrolling settle (two animation frames) before pointer actions, or drive the control from the keyboard.

**T20. Retry combobox typing from an empty input.** On a loaded runner the first keys can land before the list opens. Clear the input, focus it and type inside one `toPass` block, so a retry starts over rather than appending.

## Assertions

Adapted from the agent-rules testing set ([coding-rules/README.md](coding-rules/README.md)).

**T21. Assert what a caller or reader can observe:** rendered roles, names and hooks, and the calls a callback prop receives. Do not assert private function names, call counts or internal call order unless the spec requires them.

**T22. Mock at a module or network boundary,** never the module under test.

**T23. A snapshot is never the only assertion** for logic or markup.

**T24. Build test data with a small factory or a shared fixture** (`test/*-fixtures.tsx`) instead of copying a large fixture between files.

**T25. Cover the failure paths a change introduces or touches:** invalid, empty, disabled, read-only and error states, where they exist.

**T26. Never weaken an assertion or skip a test to make it pass.** Fix the code, or change the spec requirement and its test together.

## Testing helpers

Hosts test their screens with the helpers in `@flamboyantengineer/ui-components/testing`, and with the in-memory host (`createMemoryHost` in `./host`). The library's own tests may use them too. The library has no testing entry of its own yet: a helper that a host would need is a reason to add one (`./testing`, with its spec) rather than keep it in a test fixture.
