import { expect, test } from '@playwright/test';

// Which of CI's Chromium builds paints HTML into a canvas (the HTML-in-Canvas API), and with which
// switch. Probe for the canvas page renderer: draws a red box into a canvas and reads one pixel.
const probe = (attribute: string) => `
  <canvas id="c" width="40" height="40" ${attribute}><div id="box" style="width:40px;height:40px;background:red"></div></canvas>
  <script>
    window.result = new Promise((resolve) => {
      const canvas = document.getElementById('c');
      const context = canvas.getContext('2d');
      const api = {
        content: canvas.content,
        layoutSubtree: canvas.layoutSubtree,
        updateElementGeometry: typeof canvas.updateElementGeometry,
        canvasKeys: Object.getOwnPropertyNames(HTMLCanvasElement.prototype).join(','),
        contextKeys: Object.getOwnPropertyNames(CanvasRenderingContext2D.prototype).filter((key) => /Element/.test(key)).join(','),
      };
      const draw = () => {
        try {
          context.drawElementImage(document.getElementById('box'), 0, 0, 40, 40);
          const [r, g, b] = context.getImageData(20, 20, 1, 1).data;
          resolve({ ...api, pixel: [r, g, b] });
        } catch (error) {
          resolve({ ...api, error: String(error) });
        }
      };
      canvas.addEventListener('paint', draw, { once: true });
      canvas.requestPaint?.();
      setTimeout(draw, 1000);
    });
  </script>`;

const builds = [
  { name: 'headless shell, flag', channel: undefined, flag: true },
  { name: 'headless shell, no flag', channel: undefined, flag: false },
  { name: 'new headless, flag', channel: 'chromium', flag: true },
  { name: 'new headless, no flag', channel: 'chromium', flag: false },
];

for (const build of builds) {
  test(`probe: ${build.name}`, async ({ playwright }) => {
    const browser = await playwright.chromium.launch({
      ...(build.channel ? { channel: build.channel } : {}),
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      args: build.flag ? ['--enable-blink-features=CanvasDrawElement'] : [],
    });
    const page = await browser.newPage();
    const result: Record<string, unknown> = {};
    for (const attribute of ['layoutsubtree', 'content="drawable"']) {
      await page.setContent(probe(attribute));
      result[attribute] = await page.evaluate(
        () => (window as unknown as { result: unknown }).result,
      );
    }
    const version = browser.version();
    await browser.close();
    // Fails on purpose so CI prints what each build offers.
    expect({ version, result }).toEqual({ build: build.name });
  });
}
