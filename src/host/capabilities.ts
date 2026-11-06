/**
 * What the current reader may do with one document, as the host's permission system grants it.
 * The editor never reads roles: the host maps its own roles to these capabilities.
 */
export interface EditorCapabilities {
  /** Change content directly. */
  edit: boolean;
  /** Propose content changes as suggestions that another reader accepts or rejects. */
  suggest: boolean;
  /** Add, reply to and react to comments. */
  comment: boolean;
}

/** How the editor treats content input for one mounted document. */
export type EditingMode = 'edit' | 'suggest' | 'comment' | 'read';

/** The state of a live collaboration connection, when there is one. */
export type ConnectionAccess = 'pending' | 'read-write' | 'read-only';

export interface EditingModeContext {
  /** A historical version is open; it never accepts changes. */
  historical?: boolean | undefined;
  /**
   * The access the collaboration connection was granted. While it is `pending`, a reader who may
   * not edit stays read-only, so the editor never offers a change the connection would drop.
   */
  connection?: ConnectionAccess | undefined;
}

/** No capabilities: the document is read-only. */
export const READ_ONLY_CAPABILITIES: EditorCapabilities = Object.freeze({
  edit: false,
  suggest: false,
  comment: false,
});

/** Every capability, for a reader who owns the document. */
export const FULL_CAPABILITIES: EditorCapabilities = Object.freeze({
  edit: true,
  suggest: true,
  comment: true,
});

/**
 * The editing mode for a reader's capabilities. A historical version is always read-only. A reader
 * who may edit edits; one who may only suggest or comment does so once the connection, if any,
 * accepts their writes.
 */
export function resolveEditingMode(
  capabilities: EditorCapabilities,
  context: EditingModeContext = {},
): EditingMode {
  if (context.historical) return 'read';
  if (capabilities.edit) return 'edit';
  if (context.connection === 'pending' || context.connection === 'read-only') return 'read';
  if (capabilities.suggest) return 'suggest';
  if (capabilities.comment) return 'comment';
  return 'read';
}

/**
 * Whether the reader may comment. Comments do not depend on the connection: until it accepts them,
 * they go through the host's document store.
 */
export function canComment(
  capabilities: EditorCapabilities,
  context: EditingModeContext = {},
): boolean {
  return !context.historical && capabilities.comment;
}
