// The surfaces few sessions open, which load the first time one opens rather than with the editor
// (DOCE-ENTRY-2.2), and the way a host warms them ahead of that, such as once the editor is ready
// and the browser is idle.

/** How each surface that loads on first use loads. */
export const SURFACE_LOADERS = {
  figure: () => import('./figure-dialog.js'),
  reference: () => import('./reference-dialog.js'),
  abbreviation: () => import('./abbreviation-dialog.js'),
  script: () => import('./script-dialog.js'),
  'linked-code': () => import('./linked-code-dialog.js'),
  symbols: () => import('@flamboyantengineer/ui-components/character-grid'),
} as const;

/** A surface the editor loads the first time it opens. */
export type LazyEditorSurface = keyof typeof SURFACE_LOADERS;

/**
 * Loads the surfaces named, or all of them, ahead of their first use, so they open without a wait.
 * A surface already loaded costs nothing; one that fails to load loads again when it opens.
 */
export async function preloadEditorSurfaces(
  names: readonly LazyEditorSurface[] = Object.keys(SURFACE_LOADERS) as LazyEditorSurface[],
): Promise<void> {
  await Promise.allSettled(names.map((name) => SURFACE_LOADERS[name]()));
}
