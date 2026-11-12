// The document editor at the sizes the performance budgets name: one section of 5000 blocks, 25
// sections of 200, 1600 blocks under a remote writer, documents of 5, 24, 40 and 300 pages, and
// 300 pages beside 500 comment threads.

import {
  reviewDocument,
  sectionsDocument,
  singleSectionDocument,
} from './stress/scale-documents.js';
import { mountStressLab } from './stress/stress-lab.js';

// 300 pages with 500 open threads, built once: the document and the threads the margin lists.
const REVIEW = reviewDocument(4420, 500);
const REVIEW_SIZE = 7;

// The documents by size, the lightest first; a page holds about 15 of their blocks.
const SCENARIOS = [
  { label: 'About 5 pages', build: () => singleSectionDocument(74) },
  { label: 'About 24 pages', build: () => singleSectionDocument(353) },
  { label: 'About 40 pages', build: () => singleSectionDocument(588) },
  { label: 'About 300 pages', build: () => singleSectionDocument(4420) },
  { label: 'One section, 5000 blocks', build: () => singleSectionDocument(5000) },
  { label: '25 sections of 200 blocks', build: () => sectionsDocument(25, 200) },
  { label: '1600 blocks', build: () => sectionsDocument(8, 200) },
  { label: 'About 300 pages, 500 comment threads', build: () => REVIEW.file },
] as const;

mountStressLab({
  build: (size) => (SCENARIOS[size] ?? SCENARIOS[0]).build(),
  sizes: SCENARIOS.map(({ label }, value) => ({ label, value })),
  remote: true,
  threads: (size) => (size === REVIEW_SIZE ? REVIEW.threads : null),
});
