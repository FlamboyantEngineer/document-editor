// The figure sources of the full editor lab: a library of images the asset picker browses beside
// the in-memory host's uploads, and a diagram editor that draws a small diagram at once, as a host's
// own editor would store one.

import type {
  AssetAdapter,
  DiagramAdapter,
  FoundAsset,
  StoredDiagram,
} from '../../src/host/index.js';

const svg = (width: number, height: number, fill: string, label: string) =>
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" viewBox="0 0 ${String(width)} ${String(height)}"><rect width="100%" height="100%" fill="${fill}"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="24" fill="#fff">${label}</text></svg>`,
  );

const image = (id: string, name: string, size: [number, number], fill: string): FoundAsset => ({
  id,
  name,
  url: svg(size[0], size[1], fill, name),
  mediaType: 'image/svg+xml',
  alt: name,
  width: size[0],
  height: size[1],
});

/** The images the lab's asset picker browses. */
export const LAB_IMAGES: readonly FoundAsset[] = [
  image('library-wide', 'Wide panel', [800, 400], '#2563eb'),
  image('library-square', 'Square panel', [300, 300], '#16a34a'),
  image('library-tall', 'Tall panel', [240, 480], '#9333ea'),
];

/** The in-memory host's assets, which also find and render the lab's library of images. */
export function labAssets(base: AssetAdapter): AssetAdapter {
  const library = new Map(LAB_IMAGES.map((asset) => [asset.id, asset]));
  return {
    upload: (file, signal) => base.upload(file, signal),
    resolveUrl: (assetId, snapshotId, at) =>
      library.get(assetId)?.url ?? base.resolveUrl(assetId, snapshotId, at),
    search: (query) => {
      const words = query.trim().toLowerCase();
      const items = LAB_IMAGES.filter((asset) => asset.name.toLowerCase().includes(words));
      return Promise.resolve({ ok: true, value: { items } });
    },
  };
}

const DIAGRAM_SIZE = { width: 480, height: 240 };

const diagramFile = (revision: number) =>
  new File(
    [
      `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240" viewBox="0 0 480 240"><rect width="480" height="240" fill="#f8fafc"/><rect x="30" y="90" width="140" height="60" rx="8" fill="#0ea5e9"/><rect x="310" y="90" width="140" height="60" rx="8" fill="#f97316"/><path d="M170 120 H310" stroke="#334155" stroke-width="3"/><text x="240" y="40" text-anchor="middle" font-family="sans-serif" font-size="18">Diagram ${String(revision)}</text></svg>`,
    ],
    `diagram-${String(revision)}.svg`,
    { type: 'image/svg+xml' },
  );

/** A diagram editor that stores a new drawing of the diagram each time it is opened. */
export function labDiagrams(assets: AssetAdapter): DiagramAdapter {
  let revisions = 0;
  return {
    edit: async (diagram: StoredDiagram | null) => {
      revisions += 1;
      const stored = await assets.upload(diagramFile(revisions));
      if (!stored.ok) return stored;
      const { id, snapshotId } = stored.value;
      return {
        ok: true,
        value: { ...DIAGRAM_SIZE, ...diagram, assetId: id, snapshotId: snapshotId ?? id },
      };
    },
  };
}
