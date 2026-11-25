// Which of the one-result invariant's page checks (DOCE-LABS-8.1, 8.9) each real device pixel ratio
// project runs. `playwright.config.ts` leaves the others out of the project, so they are never
// started, and `layout-invariant.spec.ts` skips them should a run select one all the same.

// The zooms at ratios 1.25 and 2: the ends and the middle.
export const DPR_ZOOMS: readonly number[] = [50, 100, 150];
// The zoom at the ratios of display scaling at 150, 175 and 300 percent.
export const SCALING_ZOOMS: readonly number[] = [100];
// The projects that also paint the pages into a canvas.
export const CANVAS_PROJECTS: readonly string[] = [
  'chromium-invariant',
  'chromium-dpr-1.25',
  'chromium-dpr-2',
];
