# Recipe: extending the editor

A host adds a block of its own, the keys and commands that make it, a toolbar button that shows whether it holds, and renders the document on a server, all through the library's public parts. This recipe builds a "callout" block, a quote-like block with a tone. It is checked by `test/extension-guide.test.ts` (DOCE-EDITING-8.1, DOCE-FORMAT-6.4).

## 1. A node type at a free ordinal

A host extension lists its node types with an `order`. Built-in ordinals step by ten, so a host type takes a free one between them (DOCE-SCHEMA-1.2). Parsing tries node types in that order. The type is stored under the name the extension gives it, and that name is the host's stored contract. Every node type gets the element attributes (id, author), so the callout is an element like any other block (DOCE-SCHEMA-2.1).

```ts
const callouts: RichTextExtension = {
  name: 'callouts',
  nodes: [
    {
      name: 'callout',
      order: 285,
      spec: {
        group: 'block',
        content: 'paragraph+',
        defining: true,
        attrs: { tone: { default: 'note' } },
        parseDOM: [
          {
            tag: 'aside[data-callout]',
            getAttrs: (dom: HTMLElement) => ({ tone: dom.getAttribute('data-callout') ?? 'note' }),
          },
        ],
        toDOM: (node) => ['aside', { 'data-callout': String(node.attrs.tone) }, 0],
      },
    },
  ],
};
const schema = createDocumentSchema({ extensions: [callouts] });
```

Write `toDOM` as an output spec (an array), never as a DOM node, so the type renders without a browser (step 5).

## 2. A command and its key

A command is a plain ProseMirror command. Wrapping the selected blocks in a callout is `wrapIn`. Its key goes in a plugin the extension adds; a priority below the editing keymap's (900) runs it before the built-in keys.

```ts
const wrapInCallout = (tone: string): Command => wrapIn(calloutType, { tone });

const calloutKeys: RichTextExtension = {
  name: 'callout-keys',
  plugins: [
    {
      name: 'callout-keys',
      priority: 880,
      build: () => [keymap({ 'Mod-Alt-w': wrapInCallout('warning') })],
    },
  ],
};
```

The editor installs both extensions when the host passes them to `createDocumentKit({ extensions })` or to the plugins it hands `EditorState.create`.

## 3. A toolbar button that shows whether it holds

A host's toolbar item joins a group of the editor's toolbar (`toolbar.items`, DOCE-EDITOR-4.3). The editor context gives the item `canRun` and `isActive`, so the button is enabled when the command applies and pressed while the selection is in a callout of its tone.

```ts
const calloutButton: ToolbarButtonItem = {
  kind: 'button',
  id: 'warning-callout',
  group: 'insert',
  label: 'Warning callout',
  run: (editor) => editor.run(wrapInCallout('warning')),
  isEnabled: (editor) => editor.canRun(wrapInCallout('warning')),
  isPressed: (editor) => editor.isActive('callout', { tone: 'warning' }),
};

<DocumentEditor toolbar={{ items: [calloutButton] }} {...props} />;
```

## 4. Reading the editor from outside and inside

From outside, the handle answers the same questions on the latest state (DOCE-EDITOR-6.3). `can` checks a command without running it:

```ts
handle.current?.can(wrapInCallout('note')); // true where a callout can wrap the selection
handle.current?.isActive('callout'); // true inside a callout
```

Inside, a component reads one part of the editor with `useDocumentEditorState` (DOCE-EDITOR-4.20). It draws again only when that part changes, not on every keystroke:

```tsx
function CalloutTone() {
  const tone = useDocumentEditorState((editor) => {
    const { $from } = editor.state.selection;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth);
      if (node.type.name === 'callout') return String(node.attrs.tone);
    }
    return null;
  });
  return tone ? <span>{tone}</span> : null;
}
```

The same functions work without an editor: `isActive(state, 'callout')` from the engine reads any `EditorState` (DOCE-EDITING-8.1).

## 5. Rendering on a server

`writeStaticHtml(doc)` from `@flamboyantengineer/document-editor/document` writes a document as the markup the editor writes, with no DOM, from each type's `toDOM` (DOCE-FORMAT-6.4). A server reads the stored document with the same schema and renders it for an email or a static page:

```ts
const { doc } = readDocumentFile(file, schema);
const html = writeStaticHtml(doc); // '<aside data-callout="warning" data-id="…"><p …>…</p></aside>'
```

The markup holds the editor's hook classes and data attributes, not styles; the host's stylesheet styles it as it styles the editor.
