// A very long document of varied content in the document editor: chapters of headings, text with
// footnotes, nested lists, tables, code, quotes and rules after a table of contents, in sizes up
// to a few hundred pages.

import { longDocument } from './stress/stress-documents.js';
import { mountStressLab } from './stress/stress-lab.js';

mountStressLab({
  build: longDocument,
  sizes: [
    { label: '20 chapters', value: 20 },
    { label: '60 chapters', value: 60 },
    { label: '150 chapters', value: 150 },
  ],
});
