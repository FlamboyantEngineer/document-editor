// A host asked with a deadline: its answer, or why there is none, so a wait on a host promise
// that never settles ends with a reason (DOCE-PAGINATION-12.5).

/** What a host answered before the deadline, or why it gave nothing. */
type Asked<T> =
  | { readonly answered: true; readonly value: T }
  | { readonly answered: false; readonly why: 'failed' | 'timed-out' };

/**
 * Asks with a signal that aborts when `signal` does or once `timeout` ms pass with no answer; a
 * throw or a rejection is `failed`, no answer by the deadline `timed-out`.
 */
export function askBefore<T>(
  ask: (signal: AbortSignal) => PromiseLike<T> | T,
  { signal, timeout }: { readonly signal?: AbortSignal | undefined; readonly timeout: number },
): Promise<Asked<T>> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  return new Promise<Asked<T>>((resolve) => {
    const timer = setTimeout(() => {
      resolve({ answered: false, why: 'timed-out' });
      signal?.removeEventListener('abort', abort);
      // The host may stop its work; whatever it answers now is not read.
      controller.abort(new Error('No answer in time'));
    }, timeout);
    Promise.resolve()
      .then(() => ask(controller.signal))
      .then(
        (value) => resolve({ answered: true, value }),
        () => resolve({ answered: false, why: 'failed' }),
      )
      .finally(() => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      });
  });
}
