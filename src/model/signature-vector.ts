// The canonical vector a signature is stored and rendered as: a view box and a list of validated
// path definitions. Raw SVG markup is never stored, so a signature cannot carry script, links or
// styling; parsing reads geometry only and fails closed on anything else. Server-safe.

/** One stroke or filled region; paint resolves to `currentColor` when rendered. */
export interface SignaturePath {
  d: string;
  fill: boolean;
  strokeWidth: number | null;
  /** An SVG transform as its six matrix components `[a, b, c, d, e, f]`. */
  transform?: SignatureMatrix;
}

/** An SVG transform reduced to its six matrix components. */
export type SignatureMatrix = [number, number, number, number, number, number];

/** The stored signature. */
export interface SignatureVector {
  viewBox: { width: number; height: number };
  paths: SignaturePath[];
}

/** The outcome of reading an untrusted value as a signature vector. */
export type SignatureVectorParseResult =
  { ok: true; vector: SignatureVector } | { ok: false; reason: string };

/** Bounds every stored signature keeps. */
export const SIGNATURE_VECTOR_LIMITS = Object.freeze({
  maxPaths: 512,
  maxSinglePathLength: 16 * 1024,
  maxTotalPathLength: 64 * 1024,
  maxViewBoxDimension: 10000,
  maxStrokeWidth: 1000,
});

/**
 * The whole alphabet of SVG path data. It admits no `<`, `>`, quotes, `&`, parentheses, `:` or
 * `#`, so markup, entities, `url(...)` and script URLs cannot be written in it.
 */
const PATH_GRAMMAR = /^[MmLlHhVvCcSsQqTtAaZz0-9eE+\-.,\s]+$/;

type Failure = { ok: false; reason: string };

const fail = (reason: string): Failure => ({ ok: false, reason });

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Whether a value is path data: non-empty, within bounds, starting with a moveto. */
export function validateSignaturePathData(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= SIGNATURE_VECTOR_LIMITS.maxSinglePathLength &&
    PATH_GRAMMAR.test(trimmed) &&
    /^[Mm]/.test(trimmed)
  );
}

function readMatrix(value: unknown): SignatureMatrix | null {
  if (!Array.isArray(value) || value.length !== 6) return null;
  return value.every(isFiniteNumber) ? (value as SignatureMatrix) : null;
}

function isIdentity([a, b, c, d, e, f]: SignatureMatrix): boolean {
  return a === 1 && b === 0 && c === 0 && d === 1 && e === 0 && f === 0;
}

function readViewBox(value: unknown): SignatureVector['viewBox'] | Failure {
  if (!isObject(value)) return fail('Signature vector requires a viewBox.');
  const { width, height } = value;
  if (!isFiniteNumber(width) || !isFiniteNumber(height) || width <= 0 || height <= 0) {
    return fail('Signature viewBox width and height must be positive numbers.');
  }
  const max = SIGNATURE_VECTOR_LIMITS.maxViewBoxDimension;
  if (width > max || height > max) {
    return fail(`Signature viewBox dimensions must not exceed ${String(max)}.`);
  }
  return { width, height };
}

function readStrokeWidth(value: unknown): number | null | Failure {
  if (value === undefined || value === null) return null;
  if (!isFiniteNumber(value) || value <= 0 || value > SIGNATURE_VECTOR_LIMITS.maxStrokeWidth) {
    return fail('Signature stroke width must be a positive number within bounds.');
  }
  return value;
}

function readPath(entry: unknown): SignaturePath | Failure {
  if (!isObject(entry)) return fail('Each signature path must be an object.');
  if (!validateSignaturePathData(entry.d)) {
    return fail('Signature path data contains characters outside the allowed SVG path grammar.');
  }
  const strokeWidth = readStrokeWidth(entry.strokeWidth);
  if (isObject(strokeWidth)) return strokeWidth;
  const path: SignaturePath = { d: entry.d.trim(), fill: entry.fill === true, strokeWidth };
  if (entry.transform !== undefined && entry.transform !== null) {
    const matrix = readMatrix(entry.transform);
    if (!matrix) return fail('Signature path transform must be six finite numbers.');
    if (!isIdentity(matrix)) path.transform = matrix;
  }
  if (!path.fill && path.strokeWidth === null) {
    return fail('Each signature path must be filled or stroked.');
  }
  return path;
}

function readPaths(value: unknown): SignaturePath[] | Failure {
  if (!Array.isArray(value) || value.length === 0) {
    return fail('Signature vector requires at least one path.');
  }
  const { maxPaths, maxTotalPathLength } = SIGNATURE_VECTOR_LIMITS;
  if (value.length > maxPaths) {
    return fail(`Signature vector must not exceed ${String(maxPaths)} paths.`);
  }
  const paths: SignaturePath[] = [];
  let total = 0;
  for (const entry of value) {
    const path = readPath(entry);
    if ('ok' in path) return path;
    total += path.d.length;
    if (total > maxTotalPathLength) {
      return fail(
        `Signature path data must not exceed ${String(maxTotalPathLength)} characters in total.`,
      );
    }
    paths.push(path);
  }
  return paths;
}

/**
 * Reads an untrusted value as a signature vector. Any violation rejects the whole value, so a
 * caller never stores a signature it only partly understood.
 */
export function parseSignatureVector(value: unknown): SignatureVectorParseResult {
  if (!isObject(value)) return fail('Signature vector must be an object.');
  const viewBox = readViewBox(value.viewBox);
  if ('ok' in viewBox) return viewBox;
  const paths = readPaths(value.paths);
  if ('ok' in paths) return paths;
  return { ok: true, vector: { viewBox, paths } };
}

/** The signature vector a value holds, or null when it holds none. */
export function normalizeSignatureVector(value: unknown): SignatureVector | null {
  const result = parseSignatureVector(value);
  return result.ok ? result.vector : null;
}

const escapeMarkup = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * A signature vector as SVG markup, drawn in `currentColor` as the editor draws it, for print and
 * static renders without a DOM. It reads the value through `normalizeSignatureVector`, so only
 * validated geometry is written; null when the value holds no signature. `label` names the image.
 */
export function signatureSvgMarkup(value: unknown, label = ''): string | null {
  const vector = normalizeSignatureVector(value);
  if (!vector) return null;
  const { width, height } = vector.viewBox;
  const paths = vector.paths.map((path) => {
    const attrs = [
      `d="${escapeMarkup(path.d)}"`,
      `fill="${path.fill ? 'currentColor' : 'none'}"`,
      `stroke="${path.fill ? 'none' : 'currentColor'}"`,
      path.strokeWidth === null ? '' : `stroke-width="${String(path.strokeWidth)}"`,
      path.transform ? `transform="matrix(${path.transform.join(' ')})"` : '',
    ];
    return `<path ${attrs.filter(Boolean).join(' ')}></path>`;
  });
  const box = `0 0 ${String(width)} ${String(height)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" role="img" aria-label="${escapeMarkup(label)}">${paths.join('')}</svg>`;
}
