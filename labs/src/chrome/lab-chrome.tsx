import { type FormEvent, useId, useState } from 'react';
import {
  DEFAULT_THEME_ATTRIBUTE,
  isValidThemeAttribute,
  type LabSettings,
  type StylesheetChoice,
  SYSTEM_THEME,
} from './settings.js';

interface LabChromeProps {
  title: string;
  initial: LabSettings;
  /** Builds the href back to the lab index for the current settings; null hides the link. */
  indexHref: ((settings: LabSettings) => string) | null;
  onChange: (settings: LabSettings) => void;
}

type Kind = StylesheetChoice['kind'];

/** The theme choices the picker names; any other value is a custom one typed in. */
const themeChoices = [SYSTEM_THEME, 'light', 'dark'] as const;
type ThemeChoice = (typeof themeChoices)[number] | 'custom';

function toThemeChoice(theme: string): ThemeChoice {
  return (themeChoices as readonly string[]).includes(theme) ? (theme as ThemeChoice) : 'custom';
}

/** The chrome's draft values and the actions that commit them. */
type ChromeState = ReturnType<typeof useChromeState>;

/**
 * The bar stays above the lab's content as the page scrolls, and below every overlay layer, whose
 * default scale starts at the backdrop's 100, so a full-screen modal, drawer or menu covers it
 * rather than sitting under it.
 */
const chromeZIndex = 99;

export const chromeStyles = `
:host {
  all: initial;
  display: block;
  position: sticky;
  top: 0;
  z-index: ${chromeZIndex};
  color-scheme: light dark;
  font: 13px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif;
}
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  padding: 8px 16px;
  background: Canvas;
  color: CanvasText;
  border-bottom: 1px solid GrayText;
}
.title { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
.name { font-weight: 600; }
.back { color: LinkText; }
.controls { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
label { color: CanvasText; }
select, input, button {
  font: inherit;
  color: FieldText;
  background: Field;
  border: 1px solid GrayText;
  border-radius: 4px;
  padding: 2px 6px;
  min-height: 24px;
  box-sizing: border-box;
}
button { color: ButtonText; background: ButtonFace; cursor: pointer; }
input { width: 14ch; }
input[inputmode='url'] { width: 28ch; }
input.attribute { width: 12ch; }
:focus-visible { outline: 2px solid Highlight; outline-offset: 1px; }
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
@media (max-width: 640px) {
  .bar { padding: 8px; }
  input[inputmode='url'] { width: 100%; }
}
`;

/** The settings the chrome has committed, plus the stylesheet kind, URL and attribute being edited. */
function useChromeState(initial: LabSettings, onChange: (settings: LabSettings) => void) {
  const [settings, setSettings] = useState(initial);
  const [kind, setKind] = useState<Kind>(initial.stylesheet.kind);
  const [url, setUrl] = useState(
    initial.stylesheet.kind === 'custom' ? initial.stylesheet.url : '',
  );
  const [attribute, setAttribute] = useState(initial.themeAttribute);
  const [themeChoice, setThemeChoice] = useState(toThemeChoice(initial.theme));

  const commit = (next: LabSettings) => {
    setSettings(next);
    onChange(next);
  };
  const commitUrl = () => {
    const trimmed = url.trim();
    if (trimmed) commit({ ...settings, stylesheet: { kind: 'custom', url: trimmed } });
  };
  return {
    settings,
    kind,
    url,
    attribute,
    themeChoice,
    setUrl,
    setAttribute,
    commit,
    commitUrl,
    chooseTheme(next: ThemeChoice) {
      setThemeChoice(next);
      // A custom theme starts empty, which writes nothing until a value is typed.
      commit({ ...settings, theme: next === 'custom' ? '' : next });
    },
    chooseKind(next: Kind) {
      setKind(next);
      if (next === 'custom') commitUrl();
      else commit({ ...settings, stylesheet: { kind: next } });
    },
    commitAttribute() {
      const name = attribute.trim() || DEFAULT_THEME_ATTRIBUTE;
      if (!isValidThemeAttribute(name)) {
        setAttribute(settings.themeAttribute);
        return;
      }
      setAttribute(name);
      if (name !== settings.themeAttribute) commit({ ...settings, themeAttribute: name });
    },
  };
}

function StylesheetFields({ chrome }: { chrome: ChromeState }) {
  const ids = { stylesheet: useId(), url: useId() };
  return (
    <>
      <label htmlFor={ids.stylesheet}>Stylesheet</label>
      <select
        id={ids.stylesheet}
        value={chrome.kind}
        onChange={(event) => chrome.chooseKind(event.target.value as Kind)}
      >
        <option value="none">Unstyled</option>
        <option value="reference">Reference</option>
        <option value="custom">Custom URL</option>
      </select>
      {chrome.kind === 'custom' ? (
        <>
          <label htmlFor={ids.url} className="visually-hidden">
            Stylesheet URL
          </label>
          <input
            id={ids.url}
            type="text"
            inputMode="url"
            placeholder="https://… or /path/app.css"
            value={chrome.url}
            onChange={(event) => chrome.setUrl(event.target.value)}
            onBlur={chrome.commitUrl}
          />
          <button type="submit">Apply</button>
        </>
      ) : null}
    </>
  );
}

function ThemeFields({ chrome }: { chrome: ChromeState }) {
  const ids = { theme: useId(), value: useId(), attribute: useId() };
  return (
    <>
      <label htmlFor={ids.theme}>Theme</label>
      <select
        id={ids.theme}
        value={chrome.themeChoice}
        onChange={(event) => chrome.chooseTheme(event.target.value as ThemeChoice)}
      >
        <option value={SYSTEM_THEME}>System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="custom">Custom</option>
      </select>
      {chrome.themeChoice === 'custom' ? (
        <>
          <label htmlFor={ids.value} className="visually-hidden">
            Theme value
          </label>
          <input
            id={ids.value}
            type="text"
            placeholder="none"
            value={chrome.settings.theme}
            onChange={(event) =>
              chrome.commit({ ...chrome.settings, theme: event.target.value.trim() })
            }
          />
        </>
      ) : null}
      <label htmlFor={ids.attribute}>on</label>
      <input
        id={ids.attribute}
        type="text"
        className="attribute"
        value={chrome.attribute}
        aria-describedby={`${ids.attribute}-hint`}
        onChange={(event) => chrome.setAttribute(event.target.value)}
        onBlur={chrome.commitAttribute}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          chrome.commitAttribute();
        }}
      />
      <span id={`${ids.attribute}-hint`} className="visually-hidden">
        Root data attribute that receives the theme value, excluding data-lab attributes
      </span>
    </>
  );
}

/** The lab toolbar: back to the index, stylesheet picker and theme attribute. */
export function LabChrome({ title, initial, indexHref, onChange }: LabChromeProps) {
  const chrome = useChromeState(initial, onChange);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    chrome.commitUrl();
  };
  return (
    <div className="bar">
      <div className="title">
        {indexHref ? (
          <a className="back" href={indexHref(chrome.settings)}>
            All labs
          </a>
        ) : null}
        <span className="name">{title}</span>
      </div>
      <form className="controls" onSubmit={submit}>
        <StylesheetFields chrome={chrome} />
        <ThemeFields chrome={chrome} />
      </form>
    </div>
  );
}
