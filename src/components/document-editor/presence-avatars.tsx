// The other people in the document as avatars, in the toolbar before the editing mode: each in
// their carets' colour, faded by the host's sheet while idle or away, with a card naming them,
// their email and what they are doing. Choosing one scrolls to their caret.

import {
  AvatarGroup,
  type AvatarGroupPerson,
} from '@flamboyantengineer/ui-components/avatar-group';
import { UserIdentity } from '@flamboyantengineer/ui-components/user-identity';
import { type ReactNode, useDeferredValue } from 'react';
import {
  byName,
  colorSlotsOf,
  listPeers,
  type PlacedPeer,
  scrollToPeer,
} from '../../engine/index.js';
import { createHooks } from '../../utils/hooks.js';
import { useDocumentEditor } from './editor-context.js';
import type { DocumentEditorLabels } from './editor-labels.js';

const hooks = createHooks('document-editor', ['presence', 'presence-card']);

/** How many people the avatars show before the rest join a count. */
export const PRESENCE_VISIBLE = 5;

export interface DocumentPresenceProps {
  /**
   * The card a person's avatar opens on hover or keyboard focus, in place of the editor's: their
   * name, picture, email and what they are doing.
   */
  readonly renderCard?: ((peer: PlacedPeer) => ReactNode) | undefined;
}

// What a person is doing, in words: away or idle over their latest activity.
function doingOf(peer: PlacedPeer, labels: DocumentEditorLabels): string | undefined {
  const words = labels.presenceActivity;
  if (peer.status === 'away' || peer.status === 'idle') return words[peer.status];
  return peer.activity ? words[peer.activity] : undefined;
}

function PresenceCard({
  peer,
  labels,
  slots,
}: {
  peer: PlacedPeer;
  labels: DocumentEditorLabels;
  slots: number;
}) {
  const doing = doingOf(peer, labels);
  return (
    <UserIdentity
      {...hooks.slot('presence-card', { status: peer.status ?? 'active' })}
      name={peer.name}
      src={peer.avatar}
      colorIndex={peer.slot}
      colorCount={slots}
      status={peer.status ?? 'active'}
      statusLabel={doing}
      description={
        <>
          {peer.email ? <span data-presence-email="">{peer.email}</span> : null}
          {doing ? <span data-presence-activity={peer.activity ?? ''}>{doing}</span> : null}
        </>
      }
    />
  );
}

/**
 * The other people in the document (DOCE-COLLAB-1.3), by name, in their carets' colour slots,
 * each with their status and a card on hover or focus; choosing one scrolls to their caret.
 */
export function DocumentPresence({ renderCard }: DocumentPresenceProps = {}) {
  const editor = useDocumentEditor();
  const deferred = useDeferredValue(editor?.state);
  if (!editor || !deferred) return null;
  const { view, labels } = editor;
  const peers = [...listPeers(deferred)].sort(byName);
  const slots = colorSlotsOf(deferred);
  if (peers.length === 0) return null;
  const byId = new Map(peers.map((peer) => [peer.id, peer]));
  const card = (person: AvatarGroupPerson) => {
    const peer = byId.get(person.id);
    if (!peer) return null;
    return renderCard ? (
      renderCard(peer)
    ) : (
      <PresenceCard peer={peer} labels={labels} slots={slots} />
    );
  };
  return (
    <AvatarGroup
      {...hooks.slot('presence')}
      size="xs"
      maxVisible={PRESENCE_VISIBLE}
      colorCount={slots}
      aria-label={labels.presence}
      cardTrigger="hover"
      renderCard={card}
      onAction={view ? (id) => void scrollToPeer(view, id) : undefined}
      people={peers.map((peer) => ({
        id: peer.id,
        name: peer.name,
        colorIndex: peer.slot,
        status: peer.status ?? 'active',
        statusLabel: doingOf(peer, labels),
        ...(peer.avatar ? { src: peer.avatar } : {}),
      }))}
    />
  );
}
