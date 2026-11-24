// A timer that runs its task once a pause passes with no new request, as saving and keeping drafts
// wait for the writer to stop. What the task does, and when to run it at once, stays with the caller.

/** A trailing timer's controls. */
interface TrailingTimer {
  /** Starts the pause again; the task runs when it ends. */
  readonly schedule: () => void;
  /** Drops a task waiting to run. */
  readonly cancel: () => void;
  /** Whether a task waits to run. */
  readonly isPending: () => boolean;
}

/** Runs `run` once `delay` milliseconds pass with no new `schedule`. */
export function createTrailingTimer(delay: number, run: () => void): TrailingTimer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const schedule = () => {
    cancel();
    timer = setTimeout(() => {
      timer = null;
      run();
    }, delay);
  };
  return { schedule, cancel, isPending: () => timer !== null };
}
