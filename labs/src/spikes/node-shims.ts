// Spike (P0-10): the two Node built-ins collaboration-tools' server entry imports, for running its
// room server in a lab page. `randomUUID` is the platform's; `Buffer` is only reached by the
// WebSocket attachment, which a page never runs. A browser-safe server entry would remove this.

export const randomUUID = (): string => globalThis.crypto.randomUUID();

export const Buffer = {
  concat(): never {
    throw new Error('The WebSocket attachment does not run in a page.');
  },
};
