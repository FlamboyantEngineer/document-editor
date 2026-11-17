// The math dialog's sheet of common math, each example named beside its LaTeX, and a link to the
// full LaTeX math reference.

import { Link } from '@flamboyantengineer/ui-components/link';
import type { DocumentEditorLabels } from './editor-labels.js';
import type { MathExample } from './math-labels.js';

// Common math as LaTeX writes it, with what each is: math-mode notation only.
const MATH_EXAMPLES: readonly (readonly [MathExample, string])[] = [
  ['fraction', '\\frac{a}{b}'],
  ['root', '\\sqrt{x}'],
  ['power', 'x^{2}'],
  ['index', 'x_{i}'],
  ['sum', '\\sum_{i=1}^{n} x_i'],
  ['integral', '\\int_{a}^{b} f(x)\\,dx'],
  ['limit', '\\lim_{x \\to 0} f(x)'],
  ['derivative', '\\frac{d}{dx} f(x)'],
  ['greek', '\\alpha, \\beta, \\pi'],
];

/** A short cheat sheet of common math under the preview, and a link to the full LaTeX reference. */
export function MathCheatSheet({ labels }: { labels: DocumentEditorLabels }) {
  return (
    <section className="de-math-help" aria-label={labels.mathCheatSheet}>
      <dl className="de-math-help__examples">
        {MATH_EXAMPLES.map(([name, latex]) => (
          <div key={name} className="de-math-help__example">
            <dt>{labels.mathExamples[name]}</dt>
            <dd>
              <code>{latex}</code>
            </dd>
          </div>
        ))}
      </dl>
      <Link href={labels.mathReferenceHref} isExternal>
        {labels.mathReference}
      </Link>
    </section>
  );
}
