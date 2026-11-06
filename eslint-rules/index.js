// Local lint rules that keep library source hooks-only (specs/HOOK-CONTRACT.md).

import { readFileSync } from 'node:fs';
import path from 'node:path';

const STYLE_FILE = /\.(css|scss|sass|less|styl|stylus|pcss|postcss)(\?.*)?$/i;

// Inline style properties the library may set because it computes them at runtime:
// positions, measured sizes, layout tracks, layering and interaction locks.
export const FUNCTIONAL_STYLE_PROPERTIES = new Set([
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'inset',
  'insetBlock',
  'insetBlockStart',
  'insetBlockEnd',
  'insetInline',
  'insetInlineStart',
  'insetInlineEnd',
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'blockSize',
  'inlineSize',
  'minBlockSize',
  'minInlineSize',
  'maxBlockSize',
  'maxInlineSize',
  'transform',
  'transformOrigin',
  'translate',
  'scale',
  'rotate',
  'gridTemplateColumns',
  'gridTemplateRows',
  'gridColumn',
  'gridColumnStart',
  'gridColumnEnd',
  'gridRow',
  'gridRowStart',
  'gridRowEnd',
  'flexBasis',
  'zIndex',
  'pointerEvents',
  'visibility',
  'userSelect',
  'touchAction',
  'willChange',
  'contain',
]);

const CUSTOM_PROPERTY = /^--de-[a-z0-9-]+$/;
const HOOK_CLASS = /^de-[a-z0-9]+(?:-[a-z0-9]+)*(?:__[a-z0-9]+(?:-[a-z0-9]+)*)?$/;

function propertyName(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  return null;
}

function toCamelCase(name) {
  if (name.startsWith('--')) return name;
  return name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function isAllowedStyleProperty(name) {
  return CUSTOM_PROPERTY.test(name) || FUNCTIONAL_STYLE_PROPERTIES.has(toCamelCase(name));
}

const noCssImport = {
  meta: {
    type: 'problem',
    docs: { description: 'Forbid stylesheet imports in library source.' },
    messages: {
      cssImport:
        'Library source must not import stylesheets ({{source}}). The host page loads all CSS.',
    },
    schema: [],
  },
  create(context) {
    function check(node, source) {
      if (typeof source === 'string' && STYLE_FILE.test(source)) {
        context.report({ node, messageId: 'cssImport', data: { source } });
      }
    }
    return {
      ImportDeclaration(node) {
        check(node, node.source.value);
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal') check(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        check(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node, node.source.value);
      },
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments[0]?.type === 'Literal'
        ) {
          check(node, node.arguments[0].value);
        }
      },
    };
  },
};

const noStaticInlineStyle = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Allow only functional inline styles (positions, measured sizes, --de-* properties).',
    },
    messages: {
      visualStyle:
        "Inline style '{{name}}' is visual. Expose a hook (class or data attribute) and let the host stylesheet style it.",
    },
    schema: [],
  },
  create(context) {
    function checkObject(objectNode) {
      for (const property of objectNode.properties) {
        if (property.type !== 'Property' || property.computed) continue;
        const name = propertyName(property.key);
        if (name !== null && !isAllowedStyleProperty(name)) {
          context.report({ node: property, messageId: 'visualStyle', data: { name } });
        }
      }
    }
    return {
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'style') return;
        const expression =
          node.value?.type === 'JSXExpressionContainer' ? node.value.expression : null;
        if (expression?.type === 'ObjectExpression') checkObject(expression);
      },
      AssignmentExpression(node) {
        const target = node.left;
        if (
          target.type === 'MemberExpression' &&
          !target.computed &&
          target.object.type === 'MemberExpression' &&
          !target.object.computed &&
          target.object.property.type === 'Identifier' &&
          target.object.property.name === 'style' &&
          target.property.type === 'Identifier' &&
          !isAllowedStyleProperty(target.property.name)
        ) {
          context.report({ node, messageId: 'visualStyle', data: { name: target.property.name } });
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'setProperty' &&
          callee.object.type === 'MemberExpression' &&
          callee.object.property.type === 'Identifier' &&
          callee.object.property.name === 'style' &&
          node.arguments[0]?.type === 'Literal' &&
          typeof node.arguments[0].value === 'string' &&
          !isAllowedStyleProperty(node.arguments[0].value)
        ) {
          context.report({
            node,
            messageId: 'visualStyle',
            data: { name: node.arguments[0].value },
          });
        }
      },
    };
  },
};

const hookClassNames = {
  meta: {
    type: 'problem',
    docs: { description: 'Literal class names must be hook classes (de-<component>[__<slot>]).' },
    messages: {
      notHook:
        "Class '{{token}}' is not a hook class. Library markup only emits de-<component> and de-<component>__<slot> classes.",
    },
    schema: [],
  },
  create(context) {
    function checkLiteral(node, value) {
      for (const token of value.split(/\s+/).filter(Boolean)) {
        if (!HOOK_CLASS.test(token)) {
          context.report({ node, messageId: 'notHook', data: { token } });
        }
      }
    }
    return {
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'className') return;
        if (node.value?.type === 'Literal' && typeof node.value.value === 'string') {
          checkLiteral(node, node.value.value);
        } else if (
          node.value?.type === 'JSXExpressionContainer' &&
          node.value.expression.type === 'Literal' &&
          typeof node.value.expression.value === 'string'
        ) {
          checkLiteral(node, node.value.expression.value);
        }
      },
    };
  },
};

const COMPONENT_FILE = /\/src\/components\/([^/]+)\//;
const LAB_FILE = /\/labs\/src\//;
const SIBLING_COMPONENT_IMPORT = /^\.\.\/([^/]+)\/([^/]+)\.js$/;
const LAB_COMPONENT_IMPORT = /^(?:\.\.\/)+src\/components\/([^/]+)\/([^/]+)\.js$/;

const LAB_SHARED_IMPORT = /^(?:\.\.\/)+src\/(?:utils|core)\/.+\.js$/;
const INDEX_REEXPORT = /export\s+(type\s+)?(\*|\{[^}]*\})\s+from\s+'(\.\/[^']+\.js)'/g;
const publicNamesByIndex = new Map();

/** The names a `src/utils` or `src/core` index re-exports, by the module it takes them from. */
function readPublicNames(indexFile) {
  let names = publicNamesByIndex.get(indexFile);
  if (names) return names;
  names = new Map();
  for (const [, , list, source] of readFileSync(indexFile, 'utf8').matchAll(INDEX_REEXPORT)) {
    if (list === undefined) continue;
    const own = names.get(source) ?? new Set();
    const exported =
      list === '*'
        ? ['*']
        : list
            .slice(1, -1)
            .split(',')
            .map((entry) => entry.trim().replace(/^type\s+/, ''))
            .filter(Boolean)
            .map((entry) => entry.split(/\s+as\s+/).pop());
    for (const name of exported) own.add(name);
    names.set(source, own);
  }
  publicNamesByIndex.set(indexFile, names);
  return names;
}

/**
 * The names a lab imports from a `src/utils` or `src/core` module that its folder's index does not
 * re-export. An index module itself is a public entry point.
 */
function findUnexportedNames(filename, source, node) {
  const target = path.resolve(path.dirname(filename), source);
  if (path.basename(target) === 'index.js') return [];
  const parts = target.split(path.sep);
  const root = parts.lastIndexOf('src');
  const indexFile = [...parts.slice(0, root + 2), 'index.ts'].join(path.sep);
  const key = `./${parts.slice(root + 2).join('/')}`;
  const exported = readPublicNames(indexFile).get(key) ?? new Set();
  if (exported.has('*')) return [];
  return (node.specifiers ?? [])
    .map((specifier) =>
      specifier.type === 'ImportNamespaceSpecifier'
        ? '*'
        : specifier.type === 'ImportDefaultSpecifier'
          ? 'default'
          : (specifier.imported?.name ?? specifier.local.name),
    )
    .filter((name) => !exported.has(name));
}

/** Whether a module's source starts with the 'use client' directive. */
function isClientModule(file) {
  for (const extension of ['.ts', '.tsx']) {
    try {
      return readFileSync(`${file}${extension}`, 'utf8').startsWith("'use client';");
    } catch {
      // Try the next extension.
    }
  }
  return null;
}

/**
 * Whether `source` names a server-safe helper module of a component whose main module is a client
 * module: a server-safe module calls that helper there, since through the main module the server
 * hands it a client reference (UIC-SERVER-COMPONENTS-1.4).
 */
function isServerHelperOfClientMain(filename, source, component) {
  const dir = path.resolve(path.dirname(filename), '..', component);
  const target = path.resolve(path.dirname(filename), source).replace(/\.js$/, '');
  return isClientModule(path.join(dir, component)) === true && isClientModule(target) === false;
}

const componentImports = {
  meta: {
    type: 'problem',
    docs: { description: 'Import another component through its main module, not its helpers.' },
    messages: {
      helperImport:
        "Import '{{component}}' through its main module '../{{component}}/{{component}}.js', not '{{source}}'.",
      labHelperImport:
        "Labs import '{{component}}' through its entry point '{{component}}/index.js' or its main module, not '{{source}}'.",
      labInternalImport:
        "Labs use the public API: '{{source}}' is not re-exported by its index for {{names}}.",
    },
    schema: [],
  },
  create(context) {
    // ESLint passes native paths, with backslashes on Windows.
    const filename = context.filename.replaceAll('\\', '/');
    const own = filename.match(COMPONENT_FILE)?.[1];
    const isLab = LAB_FILE.test(filename);
    if (!own && !isLab) return {};
    function check(node, source) {
      if (typeof source !== 'string') return;
      if (isLab && LAB_SHARED_IMPORT.test(source)) {
        const names = findUnexportedNames(filename, source, node);
        if (names.length > 0) {
          const data = { source, names: names.join(', ') };
          context.report({ node, messageId: 'labInternalImport', data });
        }
        return;
      }
      const match = source.match(isLab ? LAB_COMPONENT_IMPORT : SIBLING_COMPONENT_IMPORT);
      if (!match) return;
      const [, component, module] = match;
      if (isLab && module !== component && module !== 'index') {
        context.report({ node, messageId: 'labHelperImport', data: { component, source } });
      } else if (
        !isLab &&
        component !== own &&
        module !== component &&
        !isServerHelperOfClientMain(filename, source, component)
      ) {
        context.report({ node, messageId: 'helperImport', data: { component, source } });
      }
    }
    return {
      ImportDeclaration(node) {
        check(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        check(node, node.source.value);
      },
    };
  },
};

export default {
  meta: { name: 'de-local' },
  rules: {
    'no-css-import': noCssImport,
    'no-static-inline-style': noStaticInlineStyle,
    'hook-class-names': hookClassNames,
    'component-imports': componentImports,
  },
};
