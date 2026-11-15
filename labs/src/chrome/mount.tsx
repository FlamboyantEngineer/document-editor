// The lab chrome every lab page loads beside its own script (labs/build/chrome.js): the shared lab
// bar of ui-components in #lab-chrome, and on the index the links that carry the settings into each
// lab. Each lab marks itself ready; the index has nothing else to wait for, so the chrome marks it.

import { mountLabBar } from '@flamboyantengineer/ui-components/labs';
import { labStorage } from './storage.js';

function updateIndexLinks(index: HTMLElement, search: string) {
  for (const link of index.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const page = link.getAttribute('href')?.split('?')[0] ?? '';
    link.setAttribute('href', `${page}${search}`);
  }
}

function mountLabChrome(): void {
  const host = document.getElementById('lab-chrome');
  if (!host) throw new Error('Lab page is missing #lab-chrome');
  const index = document.getElementById('lab-index');
  mountLabBar({
    host,
    title: index ? 'Labs' : document.title.replace(/ · Labs$/, ''),
    indexHref: index ? null : 'index.html',
    storage: labStorage(),
    onSettingsChange: index ? (_settings, search) => updateIndexLinks(index, search) : undefined,
  });
  if (index) document.documentElement.dataset.labReady = 'true';
}

mountLabChrome();
