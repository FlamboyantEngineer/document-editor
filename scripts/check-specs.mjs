#!/usr/bin/env node
// Validates specs/ against the format in specs/README.md:
//   - unique DOCE- requirement IDs with Implementation: and Verification: lines;
//   - every requirement sits under its own group heading, numbered from 1 without gaps, and groups
//     ascend;
//   - every referenced path exists, and a referenced test names the requirement ID;
//   - Hooks tables use the hook contract's names;
//   - every component directory, and every util the package exports (src/utils/index.ts), is
//     implemented by some spec;
//   - the reference stylesheet partials (labs/reference/) style every root and slot hook and read
//     every measured property hook.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reportProblems, root } from './lib/script.mjs';

const specsDir = join(root, 'specs');

const ID = String.raw`DOCE-[A-Z0-9]+(?:-[A-Z0-9]+)*-T?\d+(?:\.\d+)?[a-z]?`;
const HEADING = new RegExp(`^(#{2,3}) (${ID}) - (.+)$`);
// The group and the number within it: DOCE-BUTTON-2 and DOCE-BUTTON-2.3.
const NUMBERS = /-(\d+)(?:\.(\d+))?[a-z]?$/;
const TEST_FILE = /(\.test\.tsx?|\.spec\.ts)$/;
const HOOK_KINDS = new Set(['root', 'slot', 'attribute', 'state', 'property']);
const ROOT_HOOK = /^de-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLOT_HOOK = /^(de-[a-z0-9]+(?:-[a-z0-9]+)*)__[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ATTRIBUTE_HOOK = /^data-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROPERTY_HOOK = /^--de-[a-z0-9]+(?:-[a-z0-9]+)*$/;

const problems = [];
const ids = new Map();
const implemented = new Set();
const implementationPaths = new Set();
const classHooks = new Map();
/** Measured property hooks (`--de-*`) by the spec that declares them. */
const propertyHooks = new Map();

function backticked(text) {
  return [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function checkRequirement(file, requirement) {
  const { id, lines } = requirement;
  const implementation = lines.find((line) => line.startsWith('Implementation:'));
  const verification = lines.find((line) => line.startsWith('Verification:'));
  if (!implementation) problems.push(`${file}: ${id} has no Implementation: line`);
  if (!verification) problems.push(`${file}: ${id} has no Verification: line`);
  if (!implementation || !verification) return;

  for (const path of backticked(implementation)) {
    if (!existsSync(join(root, path)))
      problems.push(`${file}: ${id} implementation path ${path} does not exist`);
    implementationPaths.add(path);
    const component = path.match(/^src\/components\/([^/]+)/);
    if (component) implemented.add(component[1]);
  }

  const tests = backticked(verification).filter((entry) => !new RegExp(`^${ID}$`).test(entry));
  if (tests.length === 0) problems.push(`${file}: ${id} Verification: names no test file`);
  let named = false;
  for (const path of tests) {
    const full = join(root, path);
    if (!existsSync(full)) {
      problems.push(`${file}: ${id} verification path ${path} does not exist`);
      continue;
    }
    if (!TEST_FILE.test(path)) {
      problems.push(`${file}: ${id} verification path ${path} is not a test file`);
      continue;
    }
    // The ID itself, not the start of a longer one: DOCE-EDITOR-6.1 is not named by DOCE-EDITOR-6.18.
    const exact = new RegExp(`${id.replaceAll('.', '\\.')}(?![\\da-z]|\\.\\d)`, 'u');
    if (exact.test(readFileSync(full, 'utf8'))) named = true;
  }
  if (tests.length > 0 && !named) {
    problems.push(`${file}: ${id} is not named by any test it lists in Verification:`);
  }
}

function checkHooks(file, lines) {
  const rows = lines.filter((line) => line.startsWith('|')).slice(2);
  if (rows.length === 0) problems.push(`${file}: ## Hooks has no table rows`);
  const roots = new Set();
  const parsed = rows.map((row) =>
    row
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim()),
  );
  for (const cells of parsed) {
    const [hookCell = '', kind = ''] = cells;
    const hooks = backticked(hookCell);
    if (hooks.length !== 1) {
      problems.push(`${file}: hook row "${hookCell}" must name exactly one backticked hook`);
      continue;
    }
    if (!HOOK_KINDS.has(kind))
      problems.push(`${file}: hook ${hooks[0]} has unknown kind "${kind}"`);
    if (kind === 'root') {
      if (!ROOT_HOOK.test(hooks[0]))
        problems.push(`${file}: root hook ${hooks[0]} must match de-<component>`);
      roots.add(hooks[0]);
    }
  }
  for (const cells of parsed) {
    const [hookCell = '', kind = ''] = cells;
    const [hook] = backticked(hookCell);
    if (!hook) continue;
    if (kind === 'root' || kind === 'slot') {
      if (classHooks.has(hook))
        problems.push(`${file}: hook ${hook} is also declared in ${classHooks.get(hook)}`);
      classHooks.set(hook, file);
    }
    if (kind === 'property') propertyHooks.set(hook, file);
    if (kind === 'slot') {
      const match = hook.match(SLOT_HOOK);
      if (!match) problems.push(`${file}: slot hook ${hook} must match de-<component>__<slot>`);
      else if (!roots.has(match[1]))
        problems.push(`${file}: slot hook ${hook} has no root ${match[1]} in this table`);
    }
    if ((kind === 'attribute' || kind === 'state') && !ATTRIBUTE_HOOK.test(hook)) {
      problems.push(`${file}: ${kind} hook ${hook} must be a data-* attribute`);
    }
    if (kind === 'property' && !PROPERTY_HOOK.test(hook)) {
      problems.push(`${file}: property hook ${hook} must be a --de-* custom property`);
    }
  }
}

const specFiles = existsSync(specsDir)
  ? readdirSync(specsDir)
      .filter((name) => name.endsWith('.md') && name !== 'README.md')
      .sort()
  : [];

for (const name of specFiles) {
  const file = `specs/${name}`;
  if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)*\.md$/.test(name))
    problems.push(`${file}: spec file names are UPPER-KEBAB.md`);
  const lines = readFileSync(join(specsDir, name), 'utf8').split('\n');
  if (!lines[0]?.startsWith('# ')) problems.push(`${file}: first line must be a "# Title" heading`);

  /** @type {{ id: string, lines: string[] } | null} */
  let requirement = null;
  /** @type {string[] | null} */
  let hooks = null;
  // The open group heading's number, the last group's number and the last number within it.
  let group = null;
  let lastGroup = 0;
  let lastNumber = 0;
  const checkNumbering = (level, id) => {
    const [, groupText = '', numberText] = id.match(NUMBERS) ?? [];
    const groupNumber = Number(groupText);
    if (level === '##') {
      if (numberText) problems.push(`${file}: group heading ${id} has a requirement number`);
      if (groupNumber <= lastGroup) {
        problems.push(`${file}: group ${id} comes after group ${lastGroup}; groups ascend`);
      }
      group = groupNumber;
      lastGroup = Math.max(lastGroup, groupNumber);
      lastNumber = 0;
      return;
    }
    const number = Number(numberText);
    if (groupNumber !== group) {
      problems.push(
        `${file}: ${id} is not under its group heading ## ${id.replace(/\.\d+[a-z]?$/, '')}`,
      );
    } else if (number !== lastNumber + 1) {
      problems.push(
        `${file}: ${id} follows ${lastNumber === 0 ? 'its group heading' : `.${lastNumber}`}; number requirements in order from 1 and keep withdrawn ones`,
      );
    }
    lastNumber = number;
  };
  const flush = () => {
    if (requirement) checkRequirement(file, requirement);
    if (hooks) checkHooks(file, hooks);
    requirement = null;
    hooks = null;
  };

  for (const line of lines) {
    if (line.startsWith('#')) {
      flush();
      const match = line.match(HEADING);
      if (match) {
        const [, level = '', id = ''] = match;
        if (ids.has(id)) problems.push(`${file}: ${id} is also defined in ${ids.get(id)}`);
        ids.set(id, file);
        const isSequence = /-T\d/.test(id);
        if (!isSequence) checkNumbering(level, id);
        if (level === '###' && !isSequence) requirement = { id, lines: [] };
      } else if (/^#{2,3} DOCE-/.test(line)) {
        problems.push(
          `${file}: malformed requirement heading "${line}" (expected "### DOCE-AREA-1.1 - Title")`,
        );
      } else if (line.startsWith('## ')) {
        group = null;
        if (line === '## Hooks') hooks = [];
      }
      continue;
    }
    requirement?.lines.push(line.trim());
    hooks?.push(line.trim());
  }
  flush();
}

const componentsDir = join(root, 'src', 'components');
if (existsSync(componentsDir)) {
  for (const entry of readdirSync(componentsDir, { withFileTypes: true })) {
    if (entry.isDirectory() && !implemented.has(entry.name)) {
      problems.push(
        `src/components/${entry.name} is not the Implementation: of any spec requirement`,
      );
    }
  }
}

// Utils the package exports are shared contracts, so a requirement names each; internal helpers are
// covered through the requirements of the components that use them.
const utilsIndex = join(root, 'src', 'utils', 'index.ts');
if (existsSync(utilsIndex)) {
  const modules = readFileSync(utilsIndex, 'utf8').matchAll(/from '\.\/([a-z0-9-]+)\.js'/g);
  for (const name of new Set([...modules].map((match) => match[1]))) {
    const path = [`src/utils/${name}.ts`, `src/utils/${name}.tsx`].find((candidate) =>
      existsSync(join(root, candidate)),
    );
    if (path && !implementationPaths.has(path)) {
      problems.push(
        `${path} is exported by src/utils/index.ts but is not the Implementation: of any spec requirement`,
      );
    }
  }
}

const referenceDir = join(root, 'labs', 'reference');
if (existsSync(referenceDir)) {
  const reference = readdirSync(referenceDir)
    .filter((name) => name.endsWith('.css'))
    .map((name) => readFileSync(join(referenceDir, name), 'utf8'))
    .join('\n');
  for (const [hook, file] of classHooks) {
    if (!new RegExp(`\\.${hook}(?![a-z0-9_-])`).test(reference)) {
      problems.push(`labs/reference/ does not style ${hook} (declared in ${file})`);
    }
  }
  // A measured property is published for the stylesheet, so the reference shows how to use it.
  for (const [hook, file] of propertyHooks) {
    if (!reference.includes(`var(${hook}`)) {
      problems.push(`labs/reference/ never reads ${hook} (declared in ${file})`);
    }
  }
}

reportProblems(problems, {
  heading: 'Spec problems',
  success: `${specFiles.length} specs, ${ids.size} IDs and ${classHooks.size} class hooks are consistent.`,
});
