// A Yjs 14 behaviour the binding spike found (DOCE-COLLAB-4.6). Three documents edited concurrently
// whose updates reach a fourth out of causal order can leave it with pending structs after every
// update has arrived: the same updates in another order integrate fully, and a second pass of the
// same order integrates them too. The 31 updates here are what generated edits left, minimised.
// Seen on @y/y 14.0.0-rc.23 and rc.29. Through a room server updates arrive in the room's order
// (and collaboration-tools refuses incomplete updates, COLLAB-SERVER-7.3), so the binding's room
// path does not meet it; peer-to-peer or replayed offline updates would.

import * as Y from '@y/y';
import { describe, expect, it } from 'vitest';
import stored from '../../test/fixtures/yjs-pending-updates.json' with { type: 'json' };

const updates = (stored as string[]).map((base64) => new Uint8Array(Buffer.from(base64, 'base64')));

function hasPending(doc: Y.Doc): boolean {
  const store = doc.store as unknown as { pendingStructs: unknown; pendingDs: unknown };
  return store.pendingStructs !== null || store.pendingDs !== null;
}

describe('Yjs 14 pending updates', () => {
  it('DOCE-COLLAB-4.6 leaves complete updates pending when they arrive out of causal order', () => {
    const once = new Y.Doc();
    for (const update of updates) Y.applyUpdate(once, update);
    const twice = new Y.Doc();
    for (const update of [...updates, ...updates]) Y.applyUpdate(twice, update);
    const merged = new Y.Doc();
    Y.applyUpdate(merged, Y.mergeUpdates(updates));
    // When this starts failing, Yjs integrates them in one pass: drop the workaround notes.
    expect(hasPending(once)).toBe(true);
    expect(hasPending(twice)).toBe(false);
    expect(hasPending(merged)).toBe(false);
  });
});
