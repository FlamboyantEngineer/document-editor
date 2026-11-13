# Recipe: an element lifecycle

A host that moves each element of a document through states of its own, such as `draft`, `review` and `approved`, builds the lifecycle from three library parts. The library holds no states, transitions or workflow: those are the host's. This recipe is checked by `test/element-lifecycle.test.ts` (DOCE-EDITING-1.7).

## 1. Declare the state as an identity attribute

The state says which element a node is in the host's workflow, not how it looks, so declare it as an identity attribute (DOCE-SCHEMA-2.3). A pasted copy is a new element, so it clears the state; a type change keeps it.

```ts
const reviewState: IdentityAttribute = {
  name: 'reviewState',
  dom: 'data-review-state',
  scope: ['paragraph', 'heading'],
  onCopy: 'clear',
};
const kit = createDocumentKit({ schema: { identityAttributes: [reviewState] } });
```

## 2. Stamp new elements

A plugin's `appendTransaction` gives each element without a state the first one after a change, out of the undo history. The stamp writes only where no state is, so it never undoes a state another writer set. A copy pasted from elsewhere arrives without a state (step 1), and is stamped as new.

```ts
const stamp = new Plugin({
  appendTransaction(transactions, _before, state) {
    if (!transactions.some((tr) => tr.docChanged)) return null;
    const tr = state.tr;
    state.doc.descendants((node, pos) => {
      if ('reviewState' in node.attrs && !node.attrs.reviewState)
        tr.setNodeMarkup(pos, null, { ...node.attrs, reviewState: 'draft' });
    });
    return tr.docChanged ? tr.setMeta('addToHistory', false) : null;
  },
});
```

## 3. Gate edits and merges with the edit lock

The edit lock (DOCE-EDITING-4.1) refuses a writer's change that touches a locked position. Lock every position inside an element in a frozen state. A join of a draft paragraph into an approved one deletes the boundary at the approved paragraph's end, which is locked, so merging across states is refused too, while the draft stays editable. A list or a quote put around an approved paragraph, a lift out of one and a list item's indent are refused as well: they keep the paragraph's content but move it, so the lock checks the content they keep. An undo is the writer's change too: one that would take back an edit made to a paragraph before it was approved is refused, undo stops there, and `undoCommand` answers false once the writer has tried.

```ts
const lock = createEditLock({
  isLocked: (doc, pos) => {
    const $pos = doc.resolve(pos);
    for (let depth = $pos.depth; depth > 0; depth -= 1)
      if ($pos.node(depth).attrs.reviewState === 'approved') return true;
    return false;
  },
});
```

A state change itself is the host's: it sets the attribute with `setNodeMarkup` on the element it finds by its id, out of the history.
