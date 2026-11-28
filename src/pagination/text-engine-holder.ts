// Holds a projection's text layout engine behind the `textLayout: 'pretext'` option: the engine
// module loads on first use, so an editor without the option never loads the layout engine, and
// the engine is made again for each template the pages are laid out with, when code's line
// numbers are turned on or off, and when the language the document is laid out in changes. It
// measures with the fonts the host serves (DOCE-HOST-1.14.1), and asks for a family a new
// template names.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import type { SuggestionMarkup } from '../layout-engine/hidden-suggestions.js';
import type { MathLayouter } from '../layout-engine/math-atoms.js';
import {
  documentLanguage,
  type LayoutRules,
  type ResolvedFootnoteSettings,
  type TemplateFile,
} from '../model/index.js';
import { stableKey } from '../utils/stable-key.js';
import { templateFontFamilies } from './fonts.js';
import type { PagesFonts, ServedFonts } from './served-fonts.js';
import type { createPagesTextEngine, forgetFontWidths } from './text-engine.js';
import type { PagesTextEngine } from './text-engine-types.js';

/** How a projection lays its text out with the layout engine. */
export interface TextLayoutSetting {
  /** The template the pages are laid out with now. */
  readonly template: () => TemplateFile;
  /** Whether code blocks are drawn with a gutter of line numbers now; none when not given. */
  readonly codeLineNumbers?: (() => boolean) | undefined;
  /**
   * The node types the host draws with node views of its own now; another set makes the engine
   * again (DOCE-PAGINATION-7.17).
   */
  readonly hostViews?: (() => readonly string[]) | undefined;
  /** The host's layout rules now, whose `size` sizes its nodes (DOCE-PAGINATION-14.1). */
  readonly layoutRules?: (() => LayoutRules | undefined) | undefined;
  /** The served fonts the text is measured with; no engine is made without them. */
  readonly fonts: PromiseLike<PagesFonts>;
  /**
   * How the pages show suggestions now; those it hides take no room (DOCE-PAGINATION-11.12). All
   * shown when not given.
   */
  readonly markup?: (() => SuggestionMarkup) | undefined;
  /**
   * The language the document is laid out in now: its own, else its template's
   * (DOCE-PAGINATION-9.16); the template's, else `en`, when not given. Never the host page's.
   */
  readonly language?: (() => string) | undefined;
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
  /**
   * Moves whenever the engine's lines may have changed: made again, atoms settled, or provisional
   * math laid out again (DOCE-PAGINATION-12.13).
   */
  version(): number;
  /** Settles once the engine's module has loaded, or failed to, which leaves no engine. */
  readonly loaded: Promise<unknown>;
  /** Why no engine can be made: the served fonts cannot be read, or the module failed to load. */
  failure?(): string | null;
  destroy(): void;
}

interface EngineModule {
  readonly createPagesTextEngine: typeof createPagesTextEngine;
  readonly forgetFontWidths: typeof forgetFontWidths;
}

// The engine's module once loaded, with the math layouter it sizes math with, if any.
type LoadedEngine = EngineModule & { readonly layouter: MathLayouter | null };

// Loads the engine's module, the served fonts and the math layouter; a layouter that fails to load
// leaves math in the reserved box (DOCE-PAGINATION-12.9).
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

// What the engine takes from the setting beside its template: the host's views, the markup and
// the math layouter it loaded.
const settingInputs = ({ layoutRules, markup }: TextLayoutSetting, { layouter }: LoadedEngine) => ({
  layoutRules,
  markup,
  mathLayouter: () => layouter,
});

// What an engine is made for besides the served fonts: read from the setting on each ask.
interface Making {
  readonly template: TemplateFile;
  readonly codeLineNumbers: boolean;
  readonly language: string;
  readonly hostViews: readonly string[];
}

function makingNow(setting: TextLayoutSetting): Making {
  const template = setting.template();
  return {
    template,
    codeLineNumbers: setting.codeLineNumbers?.() ?? false,
    language: setting.language?.() ?? documentLanguage(null, template),
    hostViews: [...new Set(setting.hostViews?.())].sort(),
  };
}

// Whether an engine made for one setting serves another: an equal template, as a host that
// builds its template on each render hands over, keeps it.
const sameMaking = (made: Making, now: Making) =>
  sameTemplate(made.template, now.template) &&
  made.codeLineNumbers === now.codeLineNumbers &&
  made.language === now.language &&
  made.hostViews.length === now.hostViews.length &&
  made.hostViews.every((type, index) => type === now.hostViews[index]);

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

// The document the pages' engine was last numbered with.
interface Counted {
  doc: ProseMirrorNode | null;
  footnoteNumbering?: ResolvedFootnoteSettings['numbering'] | undefined;
}

// Numbers an engine made again with the document the one before it was last numbered with, so a
// region drawn before the next layout draws its footnotes with their numbers
// (DOCE-PAGINATION-10.7), and gives its `number`, which keeps each document it is numbered with.
function numberedLike(engine: PagesTextEngine, counted: Counted) {
  if (counted.doc) engine.number(counted.doc, counted.footnoteNumbering);
  const count = engine.number.bind(engine);
  return (doc: ProseMirrorNode, footnoteNumbering?: ResolvedFootnoteSettings['numbering']) => {
    counted.doc = doc;
    counted.footnoteNumbering = footnoteNumbering;
    count(doc, footnoteNumbering);
  };
}

// Each template's content as text, read once for as long as it is kept: a template is never
// changed in place.
const templateKeys = new WeakMap<TemplateFile, string>();

function templateKey(template: TemplateFile): string {
  let key = templateKeys.get(template);
  if (key === undefined) {
    key = stableKey(template);
    templateKeys.set(template, key);
  }
  return key;
}

// Whether a template is the engine's own or an equal copy, as a host that builds its template on
// each render hands over; either keeps the engine and every block it laid out.
const sameTemplate = (made: TemplateFile, template: TemplateFile) =>
  made === template || templateKey(made) === templateKey(template);

/**
 * Loads and holds a text layout engine; `changed` is told when the served faces of a family the
 * template newly names arrive, which makes the engine again.
 */
export function holdTextEngine(options: {
  readonly setting: TextLayoutSetting;
  readonly changed: () => void;
  /** The state the pages are laid out from, whose math views typeset its math. */
  readonly state?: (() => EditorState | null) | undefined;
}): TextEngineHolder {
  let made: LoadedEngine | null = null;
  let fonts: PagesFonts | null = null;
  let current: PagesTextEngine | null = null;
  let making: Making | null = null;
  const counted: Counted = { doc: null };
  let version = 0;
  const markups = markupChanges(options.setting.markup);
  let destroyed = false;
  // Settles either way: served fonts that fail leave no engine (DOCE-PAGINATION-12.5), and the
  // pages say why, so nothing waits on a rejection no one handles.
  let failed: string | null = null;
  const loaded = loadEngine(options.setting).then(
    ([module, served, layouter]) => {
      made = { ...module, layouter };
      fonts = served;
    },
    () => {
      failed = 'engine-failed';
    },
  );
  const settled = () => {
    version += 1;
    options.changed();
  };
  // The holder's version moves with the engine's atoms (DOCE-PAGINATION-12.13), and keeps what
  // they moved when the engine is made again, so it never goes back.
  const atoms = () => current?.atomsVersion?.() ?? 0;
  const drop = () => {
    version += atoms();
    current?.destroy();
    current = null;
  };
  // The engine measures again once the faces of a family the template names newly arrive.
  const askFor = (template: TemplateFile) => {
    const served = fonts;
    if (served?.phase !== 'pretext') return;
    const wanted = templateFontFamilies(template).filter((family) => !served.isFontServed(family));
    if (!wanted.length) return;
    void served.add(wanted).then((added) => {
      if (!added || destroyed) return;
      drop();
      settled();
    });
  };
  return {
    engine() {
      if (!made || destroyed || fonts?.phase !== 'pretext') return null;
      const now = makingNow(options.setting);
      if (current && making && sameMaking(making, now)) return current;
      making = now;
      drop();
      version += 1;
      askFor(now.template);
      const { language } = now;
      const engine = made.createPagesTextEngine({
        ...servedInputs(fonts),
        ...now,
        state: options.state,
        ...settingInputs(options.setting, made),
      });
      // What draws the pages draws them in the language they were laid out in (DOCE-PAGINATION-13.10).
      current = Object.assign(engine, { language, number: numberedLike(engine, counted) });
      return current;
    },
    // Another markup keeps the engine, but moves the lines it draws, as math laid out again does.
    version: () => version + markups() + atoms(),
    loaded,
    failure: () => failed ?? (fonts?.phase === 'browser' ? fonts.reason : null),
    destroy() {
      destroyed = true;
      drop();
    },
  };
}

/**
 * The engine a projection's pages lay out with now; else why they can have none (none held, or the
 * one held cannot be made); else null while it loads.
 */
export function engineOrFailure(text: TextEngineHolder | null): PagesTextEngine | string | null {
  if (!text) return 'no-engine';
  return text.engine() ?? text.failure?.() ?? null;
}
