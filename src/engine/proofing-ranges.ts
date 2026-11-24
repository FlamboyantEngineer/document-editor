import type { Mapping } from 'prosemirror-transform';
import type { Decoration } from 'prosemirror-view';
import type { ProofingIssueAt } from './proofing.js';

type IssueIdentity = Pick<
  ProofingIssueAt,
  'from' | 'to' | 'source' | 'kind' | 'rule' | 'text' | 'category'
>;

/** Identifies one provider's issue at one occurrence in the document. */
export function proofingIssueKey(issue: IssueIdentity): string {
  const { from, to, source, kind, rule, text, category } = issue;
  return `${String(from)}:${String(to)}:${JSON.stringify([source, kind, rule?.id, text, category])}`;
}

/** Moves a proofing issue's key through an edit, leaving other issue types as they are. */
export function mapProofingIssueKey(key: string, mapping: Mapping): string | null {
  const prefix = /^(\d+):(\d+):/.exec(key);
  if (!prefix) return key;
  const from = mapping.map(Number(prefix[1]), 1);
  const to = mapping.map(Number(prefix[2]), -1);
  if (from >= to) return null;
  return `${String(from)}:${String(to)}:${key.slice(prefix[0].length)}`;
}

/** Reads the issue at its decoration's current positions. */
export function issueFromDecoration({ from, to, spec }: Decoration): ProofingIssueAt {
  const issue = { ...(spec as { issue: ProofingIssueAt }).issue, from, to };
  return { ...issue, key: proofingIssueKey(issue) };
}
