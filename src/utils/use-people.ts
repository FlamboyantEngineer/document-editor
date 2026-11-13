// The people the host's identity names, by id: the comments, the contributors pane and the history
// pane each name people the document only knows by id, and ask the host for them the same way.

import { useEffect, useState } from 'react';
import type { EditorPerson, IdentityAdapter } from '../host/index.js';

interface Known {
  readonly identity: IdentityAdapter | undefined;
  readonly people: ReadonlyMap<string, EditorPerson>;
  /** The ids the identity has answered about, the people it left out too. */
  readonly asked: ReadonlySet<string>;
}

const noPeople: ReadonlyMap<string, EditorPerson> = new Map();
const noneAsked: ReadonlySet<string> = new Set();

/**
 * The people among `ids` that `identity` knows, each id asked about once, whatever order the ids
 * come in. A lookup that fails names no one: its people show as those the host does not know, and
 * are asked about again with the next new id.
 */
export function usePeople(
  identity: IdentityAdapter | undefined,
  ids: readonly string[],
): ReadonlyMap<string, EditorPerson> {
  const [known, setKnown] = useState<Known>({ identity, people: noPeople, asked: noneAsked });
  const { people, asked } =
    known.identity === identity ? known : { people: noPeople, asked: noneAsked };
  // Sorted, so the same people in another order, as writers ranked anew, are not asked about again.
  const key = [...new Set(ids)]
    .filter((id) => !asked.has(id))
    .sort()
    .join('\n');
  useEffect(() => {
    if (!identity || !key) return;
    let isCurrent = true;
    const missing = key.split('\n');
    identity.resolvePeople(missing).then(
      (found) => {
        if (!isCurrent) return;
        setKnown((current) => {
          const from = current.identity === identity ? current : null;
          const next = new Map(from?.people);
          for (const person of found) next.set(person.id, person);
          return { identity, people: next, asked: new Set([...(from?.asked ?? []), ...missing]) };
        });
      },
      () => undefined,
    );
    return () => {
      isCurrent = false;
    };
  }, [identity, key]);
  return people;
}
