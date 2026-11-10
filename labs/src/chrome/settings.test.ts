import { createSafeStorage } from '@flamboyantengineer/ui-components/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applySettings,
  defaultSettings,
  readSettings,
  rememberSettings,
  resolveTheme,
  settingsSearch,
} from './settings.js';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

const throwingStorage = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
} as unknown as Storage;

afterEach(() => {
  document.getElementById('lab-stylesheet')?.remove();
  const names = [
    'data-theme',
    'data-mode',
    'data-lab-theme-attribute',
    'data-lab-scheme',
    'data-lab-stylesheet',
    'data-lab-stylesheet-state',
  ];
  for (const name of names) document.documentElement.removeAttribute(name);
});

describe('readSettings', () => {
  it('DOCE-LABS-1.5 defaults to the reference sheet and the system theme, and keeps an empty theme', () => {
    expect(readSettings('', memoryStorage())).toEqual(defaultSettings);
    expect(defaultSettings).toEqual({
      stylesheet: { kind: 'reference' },
      theme: 'system',
      themeAttribute: 'data-theme',
    });
    expect(readSettings('?theme=', memoryStorage()).theme).toBe('');
    expect(readSettings('', memoryStorage({ 'labs:theme': '' })).theme).toBe('');
  });

  it('DOCE-LABS-1.5 prefers the query string over the remembered choice', () => {
    const storage = memoryStorage({ 'labs:stylesheet': 'none', 'labs:theme': 'light' });
    expect(readSettings('?stylesheet=/app.css&theme=dark', storage)).toEqual({
      stylesheet: { kind: 'custom', url: '/app.css' },
      theme: 'dark',
      themeAttribute: 'data-theme',
    });
    expect(readSettings('', storage)).toMatchObject({
      stylesheet: { kind: 'none' },
      theme: 'light',
    });
  });

  it('DOCE-LABS-1.5 ignores an invalid theme attribute and survives refusing storage', () => {
    expect(readSettings('?themeAttribute=1bad', null).themeAttribute).toBe('data-theme');
    const refusing = createSafeStorage(throwingStorage);
    expect(readSettings('', refusing)).toEqual(defaultSettings);
    expect(() => rememberSettings(defaultSettings, refusing)).not.toThrow();
  });

  it('DOCE-LABS-1.4 rejects event handlers and reserved lab attributes from queries and storage', () => {
    for (const attribute of ['onpointerover', 'style', 'class', 'data-lab-stylesheet-state']) {
      expect(readSettings(`?themeAttribute=${attribute}`, null).themeAttribute).toBe('data-theme');
      expect(
        readSettings('', memoryStorage({ 'labs:theme-attribute': attribute })).themeAttribute,
      ).toBe('data-theme');
    }
  });
});

describe('settings round trip', () => {
  it('DOCE-LABS-1.5 remembers and re-reads a choice', () => {
    const storage = memoryStorage();
    rememberSettings(
      { stylesheet: { kind: 'custom', url: 'x.css' }, theme: 'dark', themeAttribute: 'data-mode' },
      storage,
    );
    expect(readSettings('', storage)).toEqual({
      stylesheet: { kind: 'custom', url: 'x.css' },
      theme: 'dark',
      themeAttribute: 'data-mode',
    });
  });

  it('DOCE-LABS-1.5 writes the query string, leaving defaults out and keeping unrelated parameters', () => {
    expect(settingsSearch(defaultSettings, '?case=3')).toBe('?case=3');
    expect(settingsSearch(defaultSettings, '?stylesheet=none')).toBe('');
    expect(settingsSearch({ ...defaultSettings, theme: '' })).toBe('?theme=');
    expect(
      settingsSearch({ stylesheet: { kind: 'none' }, theme: 'dark', themeAttribute: 'data-mode' }),
    ).toBe('?stylesheet=none&theme=dark&themeAttribute=data-mode');
  });
});

describe('applySettings', () => {
  it('DOCE-LABS-1.4 writes theme text only to safe data attributes', () => {
    const theme = 'document.documentElement.dataset.executed="yes"';
    applySettings({ ...defaultSettings, theme, themeAttribute: 'onpointerover' });
    expect(document.documentElement).not.toHaveAttribute('onpointerover');
    expect(document.documentElement).toHaveAttribute('data-theme', theme);
    applySettings({
      ...defaultSettings,
      theme: 'hidden',
      themeAttribute: 'data-lab-stylesheet-state',
    });
    expect(document.documentElement).toHaveAttribute('data-lab-stylesheet-state', 'loading');
    expect(document.documentElement).toHaveAttribute('data-theme', 'hidden');
  });

  it('DOCE-LABS-1.3 reports an invalid stylesheet URL and recovers on the next choice', () => {
    applySettings(defaultSettings);
    applySettings({
      ...defaultSettings,
      stylesheet: { kind: 'custom', url: 'http://[' },
      theme: 'dark',
    });
    expect(document.documentElement.dataset.labStylesheetState).toBe('error');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.getElementById('lab-stylesheet')).toBeNull();
    applySettings(defaultSettings);
    expect(document.documentElement.dataset.labStylesheetState).toBe('loading');
    expect(document.getElementById('lab-stylesheet')?.getAttribute('href')).toBe(
      'build/reference.css',
    );
  });

  it('DOCE-LABS-1.3 ignores load events from a stylesheet that has been replaced', () => {
    applySettings(defaultSettings);
    const previous = document.getElementById('lab-stylesheet') as HTMLLinkElement;
    applySettings({ ...defaultSettings, stylesheet: { kind: 'custom', url: '/host.css' } });
    previous.dispatchEvent(new Event('load'));
    expect(document.documentElement.dataset.labStylesheetState).toBe('loading');
    const current = document.getElementById('lab-stylesheet') as HTMLLinkElement;
    current.dispatchEvent(new Event('load'));
    expect(document.documentElement.dataset.labStylesheetState).toBe('loaded');
    previous.dispatchEvent(new Event('error'));
    expect(document.documentElement.dataset.labStylesheetState).toBe('loaded');
    applySettings({ ...defaultSettings, stylesheet: { kind: 'none' } });
    current.dispatchEvent(new Event('load'));
    expect(document.documentElement.dataset.labStylesheetState).toBe('none');
  });

  it('DOCE-LABS-1.3 adds, keeps, swaps and removes the stylesheet link', () => {
    applySettings(defaultSettings);
    const link = document.getElementById('lab-stylesheet') as HTMLLinkElement;
    expect(link).toHaveAttribute('href', 'build/reference.css');
    expect(document.documentElement.dataset.labStylesheet).toBe('reference');
    expect(document.documentElement.dataset.labStylesheetState).toBe('loading');
    applySettings({ ...defaultSettings, theme: 'dark' });
    expect(document.getElementById('lab-stylesheet')).toBe(link);

    applySettings({ ...defaultSettings, stylesheet: { kind: 'custom', url: '/host.css' } });
    expect(document.getElementById('lab-stylesheet')?.getAttribute('href')).toBe('/host.css');
    expect(document.documentElement.dataset.labStylesheet).toBe('custom');

    applySettings({ ...defaultSettings, stylesheet: { kind: 'none' } });
    expect(document.getElementById('lab-stylesheet')).toBeNull();
    expect(document.documentElement.dataset.labStylesheetState).toBe('none');
  });

  it('DOCE-LABS-1.3 makes the stylesheet hold the first paint', () => {
    applySettings(defaultSettings);
    expect(document.getElementById('lab-stylesheet')).toHaveAttribute('blocking', 'render');
  });

  it('DOCE-LABS-1.4 writes light or dark for the system theme, from the colour scheme', () => {
    const dark = { matchMedia: () => ({ matches: true }) } as unknown as Window;
    const light = { matchMedia: () => ({ matches: false }) } as unknown as Window;
    expect(resolveTheme('system', dark)).toBe('dark');
    expect(resolveTheme('system', light)).toBe('light');
    expect(resolveTheme('night', dark)).toBe('night');
    applySettings({ ...defaultSettings, theme: 'dark' });
    expect(document.documentElement.dataset.labScheme).toBe('dark');
    applySettings({ ...defaultSettings, theme: 'night' });
    expect(document.documentElement).toHaveAttribute('data-theme', 'night');
    expect(document.documentElement.dataset.labScheme).toBeUndefined();
  });

  it('DOCE-LABS-1.4 moves the theme between attributes', () => {
    applySettings({ ...defaultSettings, theme: 'dark' });
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    applySettings({ ...defaultSettings, theme: 'dark', themeAttribute: 'data-mode' });
    expect(document.documentElement).not.toHaveAttribute('data-theme');
    expect(document.documentElement).toHaveAttribute('data-mode', 'dark');
    applySettings({ ...defaultSettings, theme: '', themeAttribute: 'data-mode' });
    expect(document.documentElement).not.toHaveAttribute('data-mode');
  });
});
