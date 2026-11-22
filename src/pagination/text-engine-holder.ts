// Holds a projection's text layout engine behind the `textLayout: 'pretext'` option: the engine
// module loads on first use, so an editor without the option never loads the layout engine, and
// the engine is made again for each template the pages are laid out with.

import type { TemplateFile } from '../model/index.js';
import type { createPagesTextEngine, forgetFontWidths } from './text-engine.js';
import type { PagesTextEngine } from './text-engine-types.js';

/** How a projection lays its text out with the layout engine. */
export interface TextLayoutSetting {
  /** The template the pages are laid out with now. */
  readonly template: () => TemplateFile;
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
}): TextEngineHolder {
  let made: EngineModule | null = null;
  let current: PagesTextEngine | null = null;
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
      if (current?.template === template) return current;
      current?.destroy();
      version += 1;
      current = made.createPagesTextEngine({
        template,
        measureIn: options.measureIn,
        onAtomsSettled: settled,
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
