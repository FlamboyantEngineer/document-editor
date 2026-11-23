// Holds a projection's text layout engine behind the `textLayout: 'pretext'` option: the engine
// module loads on first use, so an editor without the option never loads the layout engine, and
// the engine is made again for each template the pages are laid out with, when code's line
// numbers are turned on or off, and when the language the pages are drawn in changes.

import type { EditorView } from 'prosemirror-view';
import type { TemplateFile } from '../model/index.js';
import type { createPagesTextEngine, forgetFontWidths } from './text-engine.js';
import type { PagesTextEngine } from './text-engine-types.js';

/** How a projection lays its text out with the layout engine. */
export interface TextLayoutSetting {
  /** The template the pages are laid out with now. */
  readonly template: () => TemplateFile;
  /** Whether code blocks are drawn with a gutter of line numbers now; none when not given. */
  readonly codeLineNumbers?: (() => boolean) | undefined;
  /** The node types the host draws with node views of its own. */
  readonly hostViews?: readonly string[] | undefined;
}

/** A projection's text layout engine, once loaded. */
export interface TextEngineHolder {
  /** The engine for the template now; null until its module has loaded. */
  engine(): PagesTextEngine | null;
  /** Moves whenever the engine's lines may have changed: made again, or atoms settled. */
  version(): number;
  /** Settles once the engine's module has loaded. */
  readonly loaded: Promise<unknown>;
  destroy(): void;
}

// The language an element's text is drawn in: its own or its nearest ancestor's `lang`, empty for
// none, as the browser reads it.
const languageOf = (element: Element) => element.closest('[lang]')?.getAttribute('lang') ?? '';

interface EngineModule {
  readonly createPagesTextEngine: typeof createPagesTextEngine;
  readonly forgetFontWidths: typeof forgetFontWidths;
}

/**
 * Loads and holds a text layout engine; `changed` is told when its atoms' sizes settle or font
 * faces load in the measuring document, which makes the engine again: widths measured before a
 * face loaded were measured in a fallback font.
 */
export function holdTextEngine(options: {
  readonly setting: TextLayoutSetting;
  readonly measureIn: HTMLElement;
  readonly changed: () => void;
  /** The view that measures the pages, which atoms are measured as drawn in. */
  readonly view?: (() => EditorView | null) | undefined;
}): TextEngineHolder {
  let made: EngineModule | null = null;
  let current: PagesTextEngine | null = null;
  let numbered = false;
  let spoken = '';
  let version = 0;
  let destroyed = false;
  const loaded = import('./text-engine.js').then((module) => {
    made = module;
  });
  const settled = () => {
    version += 1;
    options.changed();
  };
  const fonts = options.measureIn.ownerDocument.fonts as FontFaceSet | undefined;
  const onFonts = () => {
    if (!made || destroyed || !current) return;
    current.destroy();
    current = null;
    made.forgetFontWidths();
    settled();
  };
  fonts?.addEventListener('loadingdone', onFonts);
  return {
    engine() {
      if (!made || destroyed) return null;
      const template = options.setting.template();
      const codeLineNumbers = options.setting.codeLineNumbers?.() ?? false;
      const language = languageOf(options.measureIn);
      if (current?.template === template && numbered === codeLineNumbers && language === spoken)
        return current;
      numbered = codeLineNumbers;
      spoken = language;
      current?.destroy();
      version += 1;
      current = made.createPagesTextEngine({
        template,
        codeLineNumbers,
        language,
        measureIn: options.measureIn,
        onAtomsSettled: settled,
        view: options.view,
        hostViews: options.setting.hostViews,
      });
      return current;
    },
    version: () => version,
    loaded,
    destroy() {
      destroyed = true;
      fonts?.removeEventListener('loadingdone', onFonts);
      current?.destroy();
      current = null;
    },
  };
}
