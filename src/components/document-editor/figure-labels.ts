// The text of the editor's chrome for figures: inserting an image or a diagram, the figure dialog
// and its sources, and the resize dialog. Part of the editor's labels (`DocumentEditorLabels`).

/** Why a figure's size is refused: not whole pixels, below the smallest, or above the widest. */
export interface FigureSizeProblem {
  readonly side: 'width' | 'height';
  readonly kind: 'whole' | 'min' | 'max';
  /** The smallest or widest size, in pixels. */
  readonly limit: number;
}

/** The text of the figure controls, menus and dialogs. */
export interface FigureLabels {
  readonly figure: string;
  /** The figure menu's entries, which insert an image or a diagram. */
  readonly imageFigure: string;
  readonly diagramFigure: string;
  /** Names the choice between an image and a diagram, and each kind. */
  readonly figureType: string;
  readonly figureTypes: Readonly<Record<'image' | 'diagram', string>>;
  readonly chooseImage: string;
  /** Opens the host's diagram editor on a new diagram, or on the figure's. */
  readonly drawDiagram: (existing: boolean) => string;
  readonly diagramEditing: string;
  readonly diagramFailed: string;
  readonly height: string;
  readonly keepProportions: string;
  readonly editFigure: string;
  readonly figureFile: string;
  readonly figureAddress: string;
  readonly altText: string;
  readonly width: string;
  readonly uploading: string;
  readonly uploadFailed: string;
  /** Opens the resize dialog of the figure selected, and its title. */
  readonly resizeFigure: string;
  readonly resizeFigureTitle: string;
  /** Under the width field: the widest a figure takes, the page content width, in pixels. */
  readonly figureMaxWidth: (max: number) => string;
  /** Why a size the writer typed is refused. */
  readonly figureSizeProblem: (problem: FigureSizeProblem) => string;
  /** Names the figure dialog's preview of the image, and what it shows before there is one. */
  readonly figurePreview: string;
  readonly figurePreviewEmpty: string;
  /** Under the upload control: the largest image an upload takes; and a file refused for it. */
  readonly uploadLimit: (maxBytes: number) => string;
  readonly uploadTooLarge: (maxBytes: number) => string;
  /** A file whose natural size its bytes do not give: another format, damaged, or an SVG without one. */
  readonly imageUnreadable: (name: string) => string;
  /** The figure dialog's error when the image at the address typed gives no natural size. */
  readonly addressUnreadable: string;
  /** Tells the reader a paste was dropped because the document changed while its images uploaded. */
  readonly pasteAgain: string;
  /** Tells the reader a paste waits for its images at addresses to load, to find their size. */
  readonly pastedImagesLoading: string;
  /** Once for a paste: its images at these addresses gave no size in time, so were left out of it. */
  readonly pastedImagesLeftOut: (addresses: readonly string[]) => string;
}

// Addresses named in a message: the first few, then how many more.
const NAMED_ADDRESSES = 3;
const namedAddresses = (addresses: readonly string[]) =>
  addresses.length <= NAMED_ADDRESSES
    ? addresses.join(', ')
    : `${addresses.slice(0, NAMED_ADDRESSES).join(', ')} and ${String(addresses.length - NAMED_ADDRESSES)} more`;

// A size in bytes in whole megabytes, or kilobytes below one.
const sizeOf = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${String(Math.round(bytes / (1024 * 1024)))} MB`
    : `${String(Math.max(1, Math.round(bytes / 1024)))} KB`;

/** The figure controls' English text. */
export const DEFAULT_FIGURE_LABELS: FigureLabels = {
  figure: 'Figure',
  imageFigure: 'Image…',
  diagramFigure: 'Diagram…',
  figureType: 'Figure type',
  figureTypes: { image: 'Image', diagram: 'Diagram' },
  chooseImage: 'Choose an image…',
  drawDiagram: (existing) => (existing ? 'Edit diagram…' : 'Draw diagram…'),
  diagramEditing: 'Editing the diagram…',
  diagramFailed: 'The diagram could not be saved.',
  height: 'Height (px)',
  keepProportions: 'Keep proportions',
  editFigure: 'Edit figure…',
  figureFile: 'Upload an image',
  figureAddress: 'Image address',
  altText: 'Alternative text',
  width: 'Width (px)',
  uploading: 'Uploading…',
  uploadFailed: 'The image could not be uploaded.',
  resizeFigure: 'Resize…',
  resizeFigureTitle: 'Resize figure',
  figureMaxWidth: (max) => `At most ${String(max)} px, the page content width.`,
  figureSizeProblem: ({ side, kind, limit }) => {
    const name = side === 'width' ? 'The width' : 'The height';
    if (kind === 'whole') return `${name} must be a whole number of pixels.`;
    if (kind === 'min') return `${name} must be at least ${String(limit)} px.`;
    return `${name} can be at most ${String(limit)} px, the page content width.`;
  },
  figurePreview: 'Preview',
  figurePreviewEmpty: 'The image shows here once it is chosen.',
  uploadLimit: (maxBytes) => `Up to ${sizeOf(maxBytes)}.`,
  uploadTooLarge: (maxBytes) =>
    `The image is larger than ${sizeOf(maxBytes)}, the most an upload takes.`,
  imageUnreadable: (name) =>
    `The size of ${name} could not be read: it may be damaged, in a format the editor does not read, or an SVG that states no size.`,
  addressUnreadable:
    'The image at this address could not be read, so its size is unknown. Check the address, or upload the image.',
  pasteAgain: 'The document changed while the images uploaded. Paste them again.',
  pastedImagesLoading: 'Loading the pasted images…',
  pastedImagesLeftOut: (addresses) =>
    addresses.length === 1
      ? `The image at ${addresses[0] ?? ''} did not load, so its size is unknown. It was left out of the paste.`
      : `${String(addresses.length)} images did not load, so their sizes are unknown, and were left out of the paste: ${namedAddresses(addresses)}.`,
};
