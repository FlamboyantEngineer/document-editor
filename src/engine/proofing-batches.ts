import type { ProoferAdapter, ProofingText } from '../host/proofing-adapters.js';
import type { ProofingOptions, ProofingStatus, SourcedIssue } from './proofing.js';
import { type ProofedBlock, proofingTextKey, segmentsOf } from './proofing-text.js';

type ProofingLimits = Pick<ProofingOptions, 'batch' | 'batchLength' | 'textLength'>;

interface CheckedSegment {
  readonly key: string;
  readonly offset: number;
  readonly input: ProofingText;
}

const positiveLimit = (value: number | undefined, fallback: number) =>
  Math.max(1, Math.floor(value ?? fallback) || 1);

/** Selects a group of blocks to check, always making progress on a long block. */
export function selectProofingBlocks(
  unchecked: readonly ProofedBlock[],
  options: ProofingLimits,
): ProofedBlock[] {
  const limit = positiveLimit(options.batchLength, 6000);
  const count = positiveLimit(options.batch, 50);
  const blocks: ProofedBlock[] = [];
  let length = 0;
  for (const block of unchecked) {
    if (blocks.length >= count || (blocks.length > 0 && length + block.text.length > limit)) break;
    blocks.push(block);
    length += block.text.length;
  }
  return blocks;
}

function* segmentBatches(blocks: readonly ProofedBlock[], options: ProofingLimits) {
  const limit = positiveLimit(options.batchLength, 6000);
  const count = positiveLimit(options.batch, 50);
  const segmentLimit = Math.min(limit, positiveLimit(options.textLength, 2000));
  let batch: CheckedSegment[] = [];
  let length = 0;
  for (const block of blocks) {
    const key = proofingTextKey(block);
    for (const { text, offset } of segmentsOf(block.text, segmentLimit)) {
      if (batch.length >= count || length + text.length > limit) {
        yield batch;
        batch = [];
        length = 0;
      }
      batch.push({ key, offset, input: { text, language: block.language } });
      length += text.length;
    }
  }
  if (batch.length > 0) yield batch;
}

function collectIssues(
  results: Map<string, SourcedIssue[]>,
  segments: readonly CheckedSegment[],
  issues: readonly (readonly SourcedIssue[])[],
) {
  segments.forEach(({ key, offset, input }, index) => {
    for (const issue of issues[index] ?? []) {
      if (issue.from < 0 || issue.to > input.text.length || issue.to <= issue.from) continue;
      results.get(key)?.push({ ...issue, from: issue.from + offset, to: issue.to + offset });
    }
  });
}

function reasonOf(error: unknown): string | null {
  const reason = (error as { reason?: unknown } | null | undefined)?.reason;
  return typeof reason === 'string' ? reason : null;
}

const statusOf = (passed: number, failed: number): ProofingStatus =>
  failed === 0 ? 'ready' : passed === 0 ? 'unavailable' : 'degraded';

interface CheckOptions {
  readonly proofers: readonly ProoferAdapter[];
  readonly signal: AbortSignal;
  readonly limits: ProofingLimits;
}

/** Checks every segment in a group, keeping offsets relative to the original block. */
export async function checkProofingBlocks(
  blocks: readonly ProofedBlock[],
  { proofers, signal, limits }: CheckOptions,
) {
  const results = new Map<string, SourcedIssue[]>();
  for (const block of blocks) results.set(proofingTextKey(block), []);
  let passed = 0;
  let failed = 0;
  let reason: string | null = null;
  for (const segments of segmentBatches(blocks, limits)) {
    if (signal.aborted) break;
    const texts = segments.map(({ input }) => input);
    const answers = await Promise.allSettled(
      proofers.map(async (proofer, source) => {
        const found = await proofer.check(texts, { signal });
        return found.map((issues) => issues.map((issue) => ({ ...issue, source })));
      }),
    );
    for (const answer of answers) {
      if (answer.status === 'fulfilled') {
        passed += 1;
        collectIssues(results, segments, answer.value);
      } else {
        failed += 1;
        reason ??= reasonOf(answer.reason);
      }
    }
  }
  return { results, status: statusOf(passed, failed), reason };
}
