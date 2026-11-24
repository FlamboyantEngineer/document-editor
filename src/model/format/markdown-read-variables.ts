// `{{key}}` variables for the Markdown reader: two braces, a key of letters, digits, `_`, `.` and
// `-`, and two braces, read as a variable unless a backslash escapes the first brace.

import type { Extension as FromMarkdownExtension, Handle } from 'mdast-util-from-markdown';
import type { Code, Construct, Effects, Extension, State } from 'micromark-util-types';

declare module 'micromark-util-types' {
  interface TokenTypeMap {
    variable: 'variable';
  }
}

declare module 'mdast' {
  interface Variable extends Node {
    type: 'variable';
    key: string;
  }
  interface PhrasingContentMap {
    variable: Variable;
  }
  interface RootContentMap {
    variable: Variable;
  }
}

const OPEN = 123;
const CLOSE = 125;

const isKey = (code: Code) =>
  code !== null &&
  ((code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 95 ||
    code === 46 ||
    code === 45);

const variable: Construct = {
  name: 'variable',
  tokenize(effects: Effects, ok: State, nok: State): State {
    const brace =
      (next: State): State =>
      (code) => {
        if (code !== OPEN) return nok(code);
        effects.consume(code);
        return next;
      };
    const key = (code: Code): State | undefined => {
      if (isKey(code)) {
        effects.consume(code);
        return keyRest;
      }
      return nok(code);
    };
    const keyRest = (code: Code): State | undefined => {
      if (isKey(code)) {
        effects.consume(code);
        return keyRest;
      }
      if (code !== CLOSE) return nok(code);
      effects.consume(code);
      return (last) => {
        if (last !== CLOSE) return nok(last);
        effects.consume(last);
        effects.exit('variable');
        return ok;
      };
    };
    return (code) => {
      effects.enter('variable');
      return brace(brace(key))(code);
    };
  },
};

/** The micromark extension reading `{{key}}` variables. */
export const variables: Extension = { text: { [OPEN]: variable } };

const enter: Handle = function (token) {
  this.enter({ type: 'variable', key: this.sliceSerialize(token).slice(2, -2) }, token);
};

const exit: Handle = function (token) {
  this.exit(token);
};

/** The mdast extension giving each variable a `variable` node with its key. */
export const variablesFromMarkdown: FromMarkdownExtension = {
  enter: { variable: enter },
  exit: { variable: exit },
};
