// Printing a snapshot to PDF in a headless browser, as a server does: the snapshot is loaded in
// the browser's page, which waits until its fonts and images are ready before it prints each page
// on its sheet. The browser is the host's own, reached through the few page methods the common
// browser automation libraries share, so this module imports no browser and no DOM.

/** The options a headless page's `pdf` takes: the print sheets the snapshot names, with colours. */
export interface HeadlessPdfOptions {
  readonly preferCSSPageSize: true;
  readonly printBackground: true;
}

/** A page of a headless browser, such as a Playwright or Puppeteer page. */
export interface HeadlessPage {
  setContent(html: string, options: { waitUntil: 'load' }): Promise<unknown>;
  /** Runs a function in the page and resolves with what it resolves with. */
  evaluate<T>(run: () => Promise<T>): Promise<T>;
  pdf(options: HeadlessPdfOptions): Promise<Uint8Array>;
}

/** How long a headless print waits. */
export interface HeadlessPrintOptions {
  /** How long it waits for the fonts and images, in milliseconds. Defaults to 30 seconds. */
  readonly timeout?: number | undefined;
}

/** A page ready to print: its fonts loaded and every image loaded or failed, naming those. */
interface Readiness {
  readonly failed: readonly string[];
}

// Runs in the browser's page: waits for its fonts and for every image to load or fail.
async function waitForPrintReadiness(): Promise<Readiness> {
  await document.fonts.ready;
  const failed: string[] = [];
  await Promise.all(
    [...document.images].map(async (image) => {
      try {
        await image.decode();
      } catch {
        failed.push(image.currentSrc || image.src);
      }
    }),
  );
  return { failed };
}

/**
 * The outcome of a headless print: the PDF, with the images that failed to load and print as the
 * editor shows a broken image, or a timeout.
 */
export type HeadlessPrintResult =
  { ok: true; pdf: Uint8Array; failedImages: readonly string[] } | { ok: false; reason: 'timeout' };

/**
 * Prints a snapshot (`exportSnapshot`, `exportSnapshotAsync`) to PDF in a headless browser's page:
 * loads it, waits for its fonts and images, and prints each page on its section's sheet with its
 * colours and backgrounds, naming the images that failed to load. Fails, printing nothing, when
 * the fonts and images are not ready in time.
 */
export async function printSnapshot(
  page: HeadlessPage,
  html: string,
  { timeout = 30_000 }: HeadlessPrintOptions = {},
): Promise<HeadlessPrintResult> {
  await page.setContent(html, { waitUntil: 'load' });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeout);
  });
  const ready = await Promise.race([page.evaluate(waitForPrintReadiness), late]);
  clearTimeout(timer);
  if (!ready) return { ok: false, reason: 'timeout' };
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  return { ok: true, pdf, failedImages: ready.failed };
}
