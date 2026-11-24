// Holds a projection's text layout engine behind the `textLayout: 'pretext'` option: the engine
// module loads on first use, so an editor without the option never loads the layout engine, and
// the engine is made again for each template the pages are laid out with, when code's line
// numbers are turned on or off, and when the language the pages are drawn in changes. It
// measures with the fonts the host serves (DOCE-HOST-1.14.1), and asks for a family a new
// template names.

import type { EditorView } from 'prosemirror-view';
import type { SuggestionMarkup } from '../layout-engine/hidden-suggestions.js';
import type { MathLayouter } from '../layout-engine/math-atoms.js';
import type { TemplateFile } from '../model/index.js';
import { templateFontFamilies } from './fonts.js';
import type { PageVariablesOptions } from './page-variables.js';
import type { PagesFonts, ServedFonts } from './served-fonts.js';
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
  /** The served fonts the text is measured with; no engine is made without them. */
  readonly fonts: PromiseLike<PagesFonts>;
  /**
   * How the pages show suggestions now; those it hides take no room (DOCE-PAGINATION-11.12). All
   * shown when not given.
   */
  readonly markup?: (() => SuggestionMarkup) | undefined;
  /** Where the template variables get their values, as the page variables draw them. */
  readonly variables?: PageVariablesOptions | undefined;
  /**
   * The math layouter typeset math is sized and drawn from (DOCE-PAGINATION-12.10), awaited with
   * the engine; null, or none, measures math as the browser draws it.
   */
  readonly mathLayouter?: PromiseLike<MathLayouter | null> | undefined;
}

/** A projection's text layout engine, once loaded. */
export interface TextEngineHolder {
  /** The engine for the template now; null until its module has loaded. */
  engine(): PagesTextEngine | null;
  /** Moves whenever the engine's lines may have changed: made again, or atoms settled. */
  version(): number;
  /** Settles once the engine's module has loaded. */
  readonly loaded: Promise<unknown>;
  /** Makes the engine again, so its atoms are measured again, as after the screen changed. */
  remeasure(): void;
  destroy(): void;
}

// The language an element's text is drawn in: its own or its nearest ancestor's `lang`, empty for
// none, as the browser reads it.
const languageOf = (element: Element) => element.closest('[lang]')?.getAttribute('lang') ?? '';

interface EngineModule {
  readonly createPagesTextEngine: typeof createPagesTextEngine;
  readonly forgetFontWidths: typeof forgetFontWidths;
}

// The engine's module once loaded, with the math layouter it sizes math with, if any.
type LoadedEngine = EngineModule & { readonly layouter: MathLayouter | null };

// Loads the engine's module, the served fonts and the math layouter; a layouter that fails to load
// leaves math measured as drawn.
const loadEngine = (setting: TextLayoutSetting) =>
  Promise.all([
    import('./text-engine.js'),
    setting.fonts,
    Promise.resolve(setting.mathLayouter ?? null).catch(() => null),
  ]);

// What the engine takes from the host's served fonts: its widths, which families are served, the
// room it keeps for unserved glyphs, where it reports them, and the font files.
function servedInputs(fonts: ServedFonts) {
  return {
    measureContext: fonts.measureContext,
    isFontServed: (family: string) => fonts.isFontServed(family),
    reserve: fonts.reserve,
    missing: (text: string) => fonts.missing(text),
    fonts: fonts.files,
  };
}

// What the engine takes from the setting beside its template: the host's views, the markup, the
// variables' values and the math layouter it loaded.
const settingInputs = (
  { hostViews, markup, variables }: TextLayoutSetting,
  { layouter }: LoadedEngine,
) => ({ hostViews, markup, variables, mathLayouter: () => layouter });

// How many times the markup the pages are laid out in has changed, as it is read.
function markupChanges(markup: (() => SuggestionMarkup) | undefined): () => number {
  let shown: SuggestionMarkup = 'all';
  let changes = 0;
  return () => {
    const now = markup?.() ?? 'all';
    if (now !== shown) [shown, changes] = [now, changes + 1];
    return changes;
  };
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
  let made: LoadedEngine | null = null;
  let fonts: PagesFonts | null = null;
  let current: PagesTextEngine | null = null;
  let numbered = false;
  let spoken = '';
  let version = 0;
  const markups = markupChanges(options.setting.markup);
  let destroyed = false;
  const loaded = loadEngine(options.setting).then(([module, served, layouter]) => {
    made = { ...module, layouter };
    fonts = served;
  });
  const settled = () => {
    version += 1;
    options.changed();
  };
  const drop = () => {
    current?.destroy();
    current = null;
  };
  // The engine measures again once the faces of a family the template names newly arrive.
  const askFor = (template: TemplateFile) => {
    if (fonts?.phase !== 'pretext') return;
    void fonts.add(templateFontFamilies(template)).then((added) => {
      if (!added || destroyed) return;
      drop();
      settled();
    });
  };
  // A face loading in the measuring document may change what atoms measure as drawn, so the
  // engine is made again; its text widths still come from the served files.
  const faces = options.measureIn.ownerDocument.fonts as FontFaceSet | undefined;
  const onFonts = () => {
    if (!made || destroyed || !current) return;
    drop();
    made.forgetFontWidths();
    settled();
  };
  faces?.addEventListener('loadingdone', onFonts);
  return {
    engine() {
      if (!made || destroyed || fonts?.phase !== 'pretext') return null;
      const template = options.setting.template();
      const codeLineNumbers = options.setting.codeLineNumbers?.() ?? false;
      const language = languageOf(options.measureIn);
      if (current?.template === template && numbered === codeLineNumbers && language === spoken)
        return current;
      numbered = codeLineNumbers;
      spoken = language;
      current?.destroy();
      version += 1;
      askFor(template);
      const engine = made.createPagesTextEngine({
        ...servedInputs(fonts),
        template,
        codeLineNumbers,
        language,
        measureIn: options.measureIn,
        onAtomsSettled: settled,
        view: options.view,
        ...settingInputs(options.setting, made),
      });
      // What draws the pages draws them in the language they were laid out in (DOCE-PAGINATION-13.10).
      current = Object.assign(engine, { language });
      return current;
    },
    // Another markup keeps the engine, but moves the lines it draws.
    version: () => version + markups(),
    loaded,
    remeasure: drop,
    destroy() {
      destroyed = true;
      faces?.removeEventListener('loadingdone', onFonts);
      drop();
    },
  };
}
