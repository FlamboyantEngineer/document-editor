import { fontsReady, PredictionWorker } from './pretext/client.js';
import { contentBlocks, fixture, readFixture, requireValue } from './pretext/fixtures.js';
import { VirtualPages } from './pretext/html.js';
import { defaultWidth } from './pretext/settings.js';

const status = requireValue(document.querySelector('#pretext-window'), 'page window status');
const reader = requireValue(document.querySelector<HTMLElement>('.pretext-scroll'), 'page reader');
const extent = requireValue(reader.querySelector<HTMLElement>('.pretext-extent'), 'scroll extent');
const pages = new VirtualPages(reader, extent, (visible, first, last, total) => {
  const text = `Page ${String(visible)} of ${String(total)} · Mounted pages ${String(first)}–${String(last)} (${String(extent.childElementCount)} in the DOM)`;
  if (status.textContent !== text) status.textContent = text;
});

function linkedPage() {
  const number = Number(new URLSearchParams(location.hash.slice(1)).get('page'));
  return Number.isSafeInteger(number) && number > 0 ? number - 1 : 0;
}

async function openDocument() {
  await fontsReady();
  const worker = new PredictionWorker();
  try {
    const file = fixture('long');
    const { index, issues } = await worker.request({ file, width: defaultWidth });
    if (!index) throw new Error(issues.join(' · '));
    pages.show(index, contentBlocks(readFixture(file)), 1, linkedPage());
    document.documentElement.dataset.labReady = 'true';
  } finally {
    worker.close();
  }
}

window.addEventListener('hashchange', () => pages.jump(linkedPage()));
// Following the same fragment again after scrolling should reveal the linked page again.
document.querySelector('nav')?.addEventListener('click', (event) => {
  const link = event.target instanceof Element && event.target.closest('a');
  if (link && link.hash === location.hash) pages.jump(linkedPage());
});
void openDocument().catch((error: unknown) => {
  status.textContent = error instanceof Error ? error.message : String(error);
});
