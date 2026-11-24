// Inline math between single dollar signs, as Pandoc reads it, for the Markdown reader: no space
// just inside either sign and no digit right after the closing one, so a price such as `$5-$10`
// stays text. A dollar sign a backslash escapes does not close it and stays in its source. The
// math's source is taken as written, so Markdown inside it, such as `*`, is not read.
//
// Whether a dollar sign closes math depends only on the characters beside it, never on where the
// math opened, so once an opening finds no closing up to the end of its text, no later opening in
// that text looks again: reading takes work in proportion to the text.

import type { Extension as FromMarkdownExtension, Handle } from 'mdast-util-from-markdown';
import type { Code, Construct, Effects, Extension, State, Tokenizer } from 'micromark-util-types';

const DOLLAR = 36;
const BACKSLASH = 92;

declare module 'micromark-util-types' {
  interface TokenTypeMap {
    pandocMath: 'pandocMath';
    pandocMathSign: 'pandocMathSign';
    pandocMathData: 'pandocMathData';
  }
}

// Line endings (-5 to -3), tabs and virtual spaces (-2, -1) and the space.
const isSpace = (code: Code) => code !== null && (code < 0 || code === 32);
const isDigit = (code: Code) => code !== null && code >= 48 && code <= 57;

/** The text after the furthest opening known to have no closing before the end of its text. */
interface Unclosed {
  from: number;
  to: number;
}

// A closing dollar sign: one not followed by a digit.
const closing: Construct = {
  tokenize(effects: Effects, ok: State, nok: State): State {
    return (code) => {
      effects.enter('pandocMathSign');
      effects.consume(code);
      effects.exit('pandocMathSign');
      return (next) => (isDigit(next) ? nok(next) : ok(next));
    };
  },
  partial: true,
};

function mathConstruct(unclosed: Unclosed): Construct {
  const tokenize: Tokenizer = function (effects, ok, nok) {
    const opened = this.now().offset;
    let previous: Code = DOLLAR;

    const data = (code: Code): State | undefined => {
      if (code === null) {
        unclosed.from = opened;
        unclosed.to = this.now().offset;
        return nok(code);
      }
      if (code === DOLLAR && !isSpace(previous)) {
        effects.exit('pandocMathData');
        return effects.attempt(closing, done, reopen)(code);
      }
      if (code < -2) {
        effects.exit('pandocMathData');
        effects.enter('lineEnding');
        effects.consume(code);
        effects.exit('lineEnding');
        previous = code;
        effects.enter('pandocMathData');
        return data;
      }
      effects.consume(code);
      previous = code;
      return code === BACKSLASH ? escaped : data;
    };

    // The character after a backslash, a dollar sign included, belongs to the math.
    const escaped = (code: Code): State | undefined => {
      if (code === null || code < -2) return data(code);
      effects.consume(code);
      previous = code;
      return data;
    };

    const reopen = (code: Code): State | undefined => {
      effects.enter('pandocMathData');
      effects.consume(code);
      previous = code;
      return data;
    };

    const done = (code: Code): State | undefined => {
      effects.exit('pandocMath');
      return ok(code);
    };

    return (code) => {
      if (opened >= unclosed.from && opened <= unclosed.to) return nok(code);
      effects.enter('pandocMath');
      effects.enter('pandocMathSign');
      effects.consume(code);
      effects.exit('pandocMathSign');
      return (next) => {
        if (next === null || next === DOLLAR || isSpace(next)) return nok(next);
        effects.enter('pandocMathData');
        return data(next);
      };
    };
  };
  return { name: 'pandocMath', tokenize };
}

// Math between double dollar signs in a line of text, display math when it is all its paragraph
// holds; an unclosed opening is looked for once, as above.
function doubleConstruct(unclosed: Unclosed): Construct {
  const tokenize: Tokenizer = function (effects, ok, nok) {
    const opened = this.now().offset;
    let signs = 0;
    const data = (code: Code): State | undefined => {
      if (code === null) {
        unclosed.from = opened;
        unclosed.to = this.now().offset;
        return nok(code);
      }
      if (code === DOLLAR) {
        effects.exit('pandocMathData');
        return effects.attempt(closingDouble, done, reopen)(code);
      }
      return consume(code);
    };
    const consume = (code: Code): State | undefined => {
      if (code !== null && code < -2) {
        effects.exit('pandocMathData');
        effects.enter('lineEnding');
        effects.consume(code);
        effects.exit('lineEnding');
        effects.enter('pandocMathData');
        return data;
      }
      effects.consume(code);
      return code === BACKSLASH ? escaped : data;
    };
    const escaped = (code: Code): State | undefined =>
      code === null || code < -2 ? data(code) : (effects.consume(code), data);
    const reopen = (code: Code): State | undefined => {
      effects.enter('pandocMathData');
      effects.consume(code);
      return data;
    };
    const done = (code: Code): State | undefined => {
      effects.exit('pandocMath');
      return ok(code);
    };
    const open = (code: Code): State | undefined => {
      if (code === DOLLAR && signs < 2) {
        effects.consume(code);
        signs += 1;
        return open;
      }
      effects.exit('pandocMathSign');
      if (signs < 2 || code === null || code === DOLLAR) return nok(code);
      effects.enter('pandocMathData');
      return consume(code);
    };
    return (code) => {
      if (opened >= unclosed.from && opened <= unclosed.to) return nok(code);
      effects.enter('pandocMath');
      effects.enter('pandocMathSign');
      return open(code);
    };
  };
  return { name: 'pandocDisplayMath', tokenize };
}

// Two closing dollar signs.
const closingDouble: Construct = {
  tokenize(effects: Effects, ok: State, nok: State): State {
    return (code) => {
      effects.enter('pandocMathSign');
      effects.consume(code);
      return (next) => {
        if (next !== DOLLAR) return nok(next);
        effects.consume(next);
        effects.exit('pandocMathSign');
        return ok;
      };
    };
  },
  partial: true,
};

/** The micromark extension reading inline math between single dollar signs, for one document. */
export function pandocMath(): Extension {
  return {
    text: {
      [DOLLAR]: [doubleConstruct({ from: -1, to: -1 }), mathConstruct({ from: -1, to: -1 })],
    },
  };
}

const enter: Handle = function (token) {
  this.enter({ type: 'inlineMath', value: '' }, token);
};

const exit: Handle = function (token) {
  const node = this.stack[this.stack.length - 1];
  const source = this.sliceSerialize(token);
  const signs = source.startsWith('$$') ? 2 : 1;
  if (node?.type === 'inlineMath') node.value = source.slice(signs, -signs);
  this.exit(token);
};

/** The mdast extension giving each such math an `inlineMath` node with its source. */
export const pandocMathFromMarkdown: FromMarkdownExtension = {
  enter: { pandocMath: enter },
  exit: { pandocMath: exit },
};
