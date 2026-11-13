// A file a reader could not read at all, as opposed to content it left out with a warning.

/** Why a file could not be read at all: not of its format, damaged, or over a limit. */
export type ImportFailure = 'unreadable' | 'damaged' | 'too-large';

/** The error a reader throws inside, which the reader's caller gets as a failed result. */
export interface ImportError extends Error {
  name: 'ImportError';
  failure: ImportFailure;
}

/** An import error of a kind, with its message. */
export function importError(failure: ImportFailure, message: string): ImportError {
  return Object.assign(new Error(message), { name: 'ImportError' as const, failure });
}

/** Whether an error is an import error. */
export function isImportError(error: unknown): error is ImportError {
  return error instanceof Error && error.name === 'ImportError';
}
