import type { HostError, SavedState } from '../host/adapters.js';
import type { RoomReload } from '../host/session-adapters.js';
import type { TemplateFile, TemplatePin } from '../model/format/template-format.js';
import type { SessionDocument } from './document-session.js';
import { loadPinnedTemplate, samePin } from './open-document.js';
import type { RoomBinding } from './room-binding.js';
import { type OpenedRoom, roomContent } from './room-open.js';
import { keepRoomSelection } from './room-selection.js';
import { type RoomRun, watchRoomPin } from './room-session.js';
import { defaultState } from './store-session.js';

interface ReloadingRoom {
  run: RoomRun;
  room: OpenedRoom;
  binding: RoomBinding;
  previous: SessionDocument;
  reload: RoomReload;
}

const isCurrentReload = ({ run, room, binding }: ReloadingRoom) =>
  !run.signal.aborted && run.current.room === room && room.binding === binding;

function failReload(context: ReloadingRoom, error: HostError) {
  if (!isCurrentReload(context)) return;
  context.room.unreadable.set(error);
  if (isCurrentReload(context)) context.room.reloading.set(false);
}

function completeReload(context: ReloadingRoom) {
  const { run, room, reload, previous } = context;
  if (!isCurrentReload(context)) return;
  room.unreadable.set(null);
  if (!isCurrentReload(context)) return;
  room.reloading.set(false);
  if (!isCurrentReload(context)) return;
  const notice = { reason: reload.reason, previous: previous.state.doc };
  run.stores.reloads.set(notice);
  if (isCurrentReload(context)) run.options.onRoomReload?.(notice);
}

function showReload(
  context: ReloadingRoom,
  {
    pin,
    template,
    saved,
  }: { pin: TemplatePin | null; template: TemplateFile; saved: SavedState | null },
) {
  const { run, binding, previous } = context;
  const { options, stores } = run;
  if (!isCurrentReload(context)) return;
  const content = roomContent(binding);
  if (!content.ok) return failReload(context, content.error);
  const doc = content.value ?? options.schema.topNodeType.createAndFill();
  if (!doc) return;
  const create = options.createState ?? defaultState(options.schema);
  const made = stores.withTemplate(template, () =>
    create(doc, { ...stores.context, room: { plugins: binding.plugins } }),
  );
  const state = keepRoomSelection(made, previous.state.selection);
  const shown = stores.document.get();
  if (!shown || !isCurrentReload(context) || !samePin(binding.pin(), pin)) return;
  const changed = !samePin(shown.pin, pin);
  watchRoomPin(run, binding);
  stores.document.set({
    ...shown,
    state,
    pin,
    template,
    templateUpdate: changed ? null : shown.templateUpdate,
  });
  if (changed && isCurrentReload(context)) run.follow.followTemplate(pin, saved);
  completeReload(context);
}

async function loadReloadTemplate(
  context: ReloadingRoom,
  pin: TemplatePin | null,
  isLatest: () => boolean,
): Promise<void> {
  if (!isCurrentReload(context)) return;
  const { run, binding } = context;
  const loaded = await loadPinnedTemplate(run.options.host, pin, run.signal);
  if (!isCurrentReload(context) || !isLatest() || !samePin(binding.pin(), pin)) return;
  if (loaded.ok) showReload(context, { pin, ...loaded.value });
  else failReload(context, loaded.error);
}

function followReloadTemplate(context: ReloadingRoom) {
  const { run, room, binding, previous } = context;
  let latest = 0;
  const follow = (pin: TemplatePin | null) => {
    if (!isCurrentReload(context)) return;
    const request = ++latest;
    if (samePin(previous.pin, pin)) {
      showReload(context, { pin, template: previous.template, saved: null });
    } else {
      room.reloading.set(true);
      void loadReloadTemplate(context, pin, () => request === latest);
    }
  };
  watchRoomPin(run, binding, follow);
  follow(binding.pin());
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
  followReloadTemplate({ run, room, binding, previous, reload });
}
