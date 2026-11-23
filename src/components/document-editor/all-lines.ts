// Who asks for every page to be drawn on the layout engine's lines: the host, through the handle's
// `drawAllLines`, and each snapshot while it is taken. The pages near the screen come back only
// once neither asks, so a snapshot never undoes the host's request or another snapshot's
// (DOCE-PAGINATION-11.6).

/** The requests for every page on forced lines. */
interface AllLines {
  /** The host's request: every page, or only those near the screen once nothing else asks. */
  readonly drawAll: (all: boolean) => void;
  /** A snapshot's request, until the function it returns is called. */
  readonly hold: () => () => void;
}

/** Gathers the requests and tells `apply` whether every page is to be drawn on forced lines. */
export function createAllLines(apply: (all: boolean) => void): AllLines {
  let host = false;
  let holds = 0;
  return {
    drawAll(all) {
      host = all;
      apply(host || holds > 0);
    },
    hold() {
      holds += 1;
      if (holds === 1 && !host) apply(true);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        holds -= 1;
        if (holds === 0 && !host) apply(false);
      };
    },
  };
}
