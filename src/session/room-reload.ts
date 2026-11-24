import { type EditorState, Selection, TextSelection } from 'prosemirror-state';
import { markRemote } from '../engine/transaction-kind.js';
import type { SavedState } from '../host/adapters.js';
import type { RoomReload } from '../host/session-adapters.js';
import type { TemplateFile, TemplatePin } from '../model/format/template-format.js';
import type { SessionDocument } from './document-session.js';
import { loadPinnedTemplate, samePin } from './open-document.js';
import type { RoomBinding } from './room-binding.js';
import { type OpenedRoom, roomContent } from './room-open.js';
import { type RoomRun, watchRoomPin } from './room-session.js';
import { defaultState } from './store-session.js';

// A selection at the places the writer left it, as near as the new document has them.
function keptSelection(state: EditorState, kept: Selection): EditorState {
  const { doc } = state;
  const near = (pos: number) => Selection.near(doc.resolve(Math.min(pos, doc.content.size)));
  const head = near(kept.head);
  const selection = kept.empty ? head : TextSelection.between(near(kept.anchor).$from, head.$from);
  return state.apply(markRemote(state.tr.setSelection(selection)).setMeta('addToHistory', false));
}

interface ReloadingRoom {
  run: RoomRun;
  room: OpenedRoom;
  binding: RoomBinding;
  previous: SessionDocument;
  reload: RoomReload;
}

function showReload(
  { run, room, binding, previous, reload }: ReloadingRoom,
  {
    pin,
    template,
    saved,
  }: { pin: TemplatePin | null; template: TemplateFile; saved: SavedState | null },
) {
  const { options, stores } = run;
  const content = roomContent(binding);
  if (!content.ok) {
    room.unreadable.set(content.error);
    room.reloading.set(false);
    return;
  }
  const doc = content.value ?? options.schema.topNodeType.createAndFill();
  const shown = stores.document.get();
  if (!doc || !shown) return;
  const create = options.createState ?? defaultState(options.schema);
  const made = stores.withTemplate(template, () =>
    create(doc, { ...stores.context, room: { plugins: binding.plugins } }),
  );
  const state = keptSelection(made, previous.state.selection);
  const changed = !samePin(shown.pin, pin);
  stores.document.set({
    ...shown,
    state,
    pin,
    template,
    templateUpdate: changed ? null : shown.templateUpdate,
  });
  if (changed) run.follow.followTemplate(pin, saved);
  watchRoomPin(run, binding);
  room.unreadable.set(null);
  room.reloading.set(false);
  const notice = { reason: reload.reason, previous: previous.state.doc };
  stores.reloads.set(notice);
  options.onRoomReload?.(notice);
}

async function loadReloadTemplate(context: ReloadingRoom, pin: TemplatePin | null): Promise<void> {
  const { run, room, binding } = context;
  const loaded = await loadPinnedTemplate(run.options.host, pin, run.signal);
  if (run.signal.aborted || run.current.room !== room || room.binding !== binding) return;
  const current = binding.pin();
  if (!samePin(current, pin)) return loadReloadTemplate(context, current);
  if (loaded.ok) showReload(context, { pin, ...loaded.value });
  else {
    room.unreadable.set(loaded.error);
    room.reloading.set(false);
  }
}

/** Rebinds a refused change's replacement content and template together (DOCE-SESSION-3.11). */
export function reloadRoom(run: RoomRun, room: OpenedRoom, reload: RoomReload) {
  const previous = run.stores.document.get();
  if (run.signal.aborted || run.current.room !== room || !previous) return;
  run.current.stopPin();
  run.drafts.stop();
  const binding = room.rebind(reload.doc);
  room.binding = binding;
  void run.drafts.start(room, null);
  const pin = binding.pin();
  const context = { run, room, binding, previous, reload };
  if (samePin(previous.pin, pin)) {
    showReload(context, { pin, template: previous.template, saved: null });
  } else {
    room.reloading.set(true);
    void loadReloadTemplate(context, pin);
  }
}
