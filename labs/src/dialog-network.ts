// The editor options lab's side of its dropped connection (`labs/dialog-network-worker.js`): the
// service worker is registered when the lab opens, and armed to fail the next request for a
// dialog's code.

/** Registers the worker; resolves once it controls the page, false where none can. */
export async function startDialogNetwork(): Promise<boolean> {
  const workers = globalThis.navigator.serviceWorker as ServiceWorkerContainer | undefined;
  if (!workers) return false;
  await workers.register('dialog-network-worker.js');
  await workers.ready;
  if (workers.controller) return true;
  return new Promise((resolve) => {
    workers.addEventListener('controllerchange', () => resolve(true), { once: true });
  });
}

/** Makes the next request for a dialog's code fail; resolves once the worker is armed. */
export function failNextDialogLoad(): Promise<boolean> {
  const workers = globalThis.navigator.serviceWorker as ServiceWorkerContainer | undefined;
  const controller = workers?.controller;
  if (!workers || !controller) return Promise.resolve(false);
  return new Promise((resolve) => {
    workers.addEventListener('message', (event) => resolve(event.data === 'armed'), {
      once: true,
    });
    controller.postMessage('fail-next-dialog');
  });
}
