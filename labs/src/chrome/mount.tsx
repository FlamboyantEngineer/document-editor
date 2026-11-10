// The lab chrome every lab page loads beside its own script (labs/build/chrome.js): the top bar in
// #lab-chrome, and on the index the links that carry the settings into each lab. Each lab marks
// itself ready; the index has nothing else to wait for, so the chrome marks it.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { chromeStyles, LabChrome } from './lab-chrome.js';
import {
  applySettings,
  type LabSettings,
  labStorage,
  readSettings,
  rememberSettings,
  settingsSearch,
  watchColorScheme,
} from './settings.js';

function readPageTitle(): string {
  return document.title.replace(/ · Labs$/, '');
}

/**
 * Applies `settings` now and again whenever the reader's colour scheme changes, which a system
 * theme follows, and draws the chrome in the scheme a light or dark theme sets.
 */
function applyFollowingScheme(initial: LabSettings, host: HTMLElement) {
  let current = initial;
  const apply = () => {
    applySettings(current);
    host.style.setProperty('color-scheme', document.documentElement.dataset.labScheme ?? null);
  };
  apply();
  watchColorScheme(apply);
  return (next: LabSettings) => {
    current = next;
    apply();
  };
}

/** Mounts the chrome in a shadow root so neither the chosen stylesheet nor the lab can restyle it. */
function mountChrome(
  initial: LabSettings,
  onSettings: (settings: LabSettings) => void,
  isIndex: boolean,
) {
  const host = document.getElementById('lab-chrome');
  if (!host) throw new Error('Lab page is missing #lab-chrome');
  const apply = applyFollowingScheme(initial, host);
  host.setAttribute('aria-label', 'Lab settings');
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(chromeStyles);
  shadow.adoptedStyleSheets = [sheet];
  const container = document.createElement('div');
  shadow.append(container);

  const change = (settings: LabSettings) => {
    apply(settings);
    rememberSettings(settings, labStorage());
    history.replaceState(
      null,
      '',
      `${location.pathname}${settingsSearch(settings, location.search)}${location.hash}`,
    );
    onSettings(settings);
  };

  createRoot(container).render(
    <StrictMode>
      <LabChrome
        title={isIndex ? 'Labs' : readPageTitle()}
        initial={initial}
        indexHref={isIndex ? null : (settings) => `index.html${settingsSearch(settings)}`}
        onChange={change}
      />
    </StrictMode>,
  );
}

function updateIndexLinks(index: HTMLElement, settings: LabSettings) {
  for (const link of index.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const page = link.getAttribute('href')?.split('?')[0] ?? '';
    link.setAttribute('href', `${page}${settingsSearch(settings)}`);
  }
}

function mountLabChrome(): void {
  const settings = readSettings(location.search, labStorage());
  const index = document.getElementById('lab-index');
  if (!index) {
    mountChrome(settings, () => {}, false);
    return;
  }
  updateIndexLinks(index, settings);
  mountChrome(settings, (next) => updateIndexLinks(index, next), true);
  document.documentElement.dataset.labReady = 'true';
}

mountLabChrome();
