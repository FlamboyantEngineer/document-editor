// The document editor at the sizes the performance budgets name: one section of 5000 blocks, 25
// sections of 200, 1600 blocks under a remote writer, and documents of 5, 24, 40 and 300 pages.

import { sectionsDocument, singleSectionDocument } from './stress/scale-documents.js';
import { mountStressLab } from './stress/stress-lab.js';

// The documents by size, the lightest first; a page holds about 15 of their blocks.
const SCENARIOS = [
  { label: 'About 5 pages', build: () => singleSectionDocument(74) },
  { label: 'About 24 pages', build: () => singleSectionDocument(353) },
  { label: 'About 40 pages', build: () => singleSectionDocument(588) },
  { label: 'About 300 pages', build: () => singleSectionDocument(4420) },
  { label: 'One section, 5000 blocks', build: () => singleSectionDocument(5000) },
  { label: '25 sections of 200 blocks', build: () => sectionsDocument(25, 200) },
  { label: '1600 blocks', build: () => sectionsDocument(8, 200) },
] as const;

mountStressLab({
  build: (size) => (SCENARIOS[size] ?? SCENARIOS[0]).build(),
  sizes: SCENARIOS.map(({ label }, value) => ({ label, value })),
  remote: true,
});
