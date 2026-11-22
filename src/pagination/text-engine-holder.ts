// Holds a projection's text layout engine behind the `textLayout: 'pretext'` option: the engine
// module loads on first use, so an editor without the option never loads the layout engine, and
// the engine is made again for each template the pages are laid out with, and when code's line
// numbers are turned on or off.

import type { TemplateFile } from '../model/index.js';
import type { createPagesTextEngine } from './text-engine.js';
import type { PagesTextEngine } from './text-engine-types.js';

/** How a projection lays its text out with the layout engine. */
export interface TextLayoutSetting {
  /** The template the pages are laid out with now. */
  readonly template: () => TemplateFile;
  /** Whether code blocks are drawn with a gutter of line numbers now; none when not given. */
  readonly codeLineNumbers?: (() => boolean) | undefined;
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
}

/** Loads and holds a text layout engine; `changed` is told when its atoms' sizes settle. */
export function holdTextEngine(options: {
  readonly setting: TextLayoutSetting;
  readonly measureIn: HTMLElement;
  readonly changed: () => void;
}): TextEngineHolder {
  let made: EngineModule | null = null;
  let current: PagesTextEngine | null = null;
  let numbered = false;
  let version = 0;
  let destroyed = false;
  const loaded = import('./text-engine.js').then((module) => {
    made = module;
  });
  const settled = () => {
    version += 1;
    options.changed();
  };
  return {
    engine() {
      if (!made || destroyed) return null;
      const template = options.setting.template();
      const codeLineNumbers = options.setting.codeLineNumbers?.() ?? false;
      if (current?.template === template && numbered === codeLineNumbers) return current;
      numbered = codeLineNumbers;
      current?.destroy();
      version += 1;
      current = made.createPagesTextEngine({
        template,
        codeLineNumbers,
        measureIn: options.measureIn,
        onAtomsSettled: settled,
      });
      return current;
    },
    version: () => version,
    loaded,
    destroy() {
      destroyed = true;
      current?.destroy();
      current = null;
    },
  };
}
