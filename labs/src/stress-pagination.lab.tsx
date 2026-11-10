// The cases pagination finds hardest, in the document editor: a paragraph, a code block, a list and
// a quote longer than a page, a run of headings, many and long footnotes on one page, page breaks
// in a row, empty paragraphs, a table row taller than a page and many short blocks.

import { paginationDocument } from './stress/stress-documents.js';
import { mountStressLab } from './stress/stress-lab.js';

mountStressLab({ build: paginationDocument });
