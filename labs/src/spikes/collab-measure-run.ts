// Spike (P0-10): prints the binding's measurements for the long stress document at 20 and 150
// chapters (about 40 and 330 laid-out pages). `npx tsx labs/src/spikes/collab-measure-run.ts`

import { longDocument } from '../stress/stress-documents.js';
import { measure } from './collab-measure.js';

for (const chapters of [20, 150]) {
  // A first run warms the JIT; the second is the one reported.
  measure(longDocument(chapters), 50);
  console.log(JSON.stringify({ chapters, ...measure(longDocument(chapters)) }, null, 2));
}
