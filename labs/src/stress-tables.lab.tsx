// A document of many tables in the document editor: small and wide ones, a tall one across pages,
// merged cells, sized columns, long cell text, tables back to back and runs of small ones.

import { tablesDocument } from './stress/stress-documents.js';
import { mountStressLab } from './stress/stress-lab.js';

mountStressLab({
  build: tablesDocument,
  sizes: [
    { label: 'One set', value: 1 },
    { label: 'Four sets', value: 4 },
    { label: 'Ten sets', value: 10 },
  ],
});
