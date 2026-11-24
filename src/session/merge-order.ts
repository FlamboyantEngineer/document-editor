import { sameStored } from './stored-equality.js';

// The keys one side holds in an order the base does not: a block moved.
function reordered(base: readonly string[], side: readonly string[]): boolean {
  const kept = new Set(side);
  const inBase = new Set(base);
  return !sameStored(
    base.filter((key) => kept.has(key)),
    side.filter((key) => inBase.has(key)),
  );
}

/** Orders retained siblings by the side that moved them and the other side's insert anchors. */
export function mergeOrder(
  keys: { base: string[]; mine: string[]; theirs: string[] },
  kept: ReadonlySet<string>,
): string[] {
  const theirsLead = reordered(keys.base, keys.theirs) && !reordered(keys.base, keys.mine);
  const [lead, other] = theirsLead ? [keys.theirs, keys.mine] : [keys.mine, keys.theirs];
  const order = lead.filter((key) => kept.has(key));
  const anchors = new Set(order);
  const inserted = new Map<string | null, string[]>();
  let after: string | null = null;
  for (const key of other) {
    if (anchors.has(key)) after = key;
    else if (kept.has(key)) {
      const entries = inserted.get(after);
      if (entries) entries.push(key);
      else inserted.set(after, [key]);
    }
  }
  return (inserted.get(null) ?? []).concat(
    order.flatMap((key) => [key, ...(inserted.get(key) ?? [])]),
  );
}
