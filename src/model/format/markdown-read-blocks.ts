// Markdown's blocks, as markdown-it tokenizes them, read into stored blocks: headings, paragraphs,
// quotes, lists with their start number and checked items, fenced and indented code with its
// language, `$$` display math, rules and GitHub tables with their alignment. HTML blocks are left
// out with a warning; figures and captions are taken in afterwards, as the library's writer places
// them. The tokens come flat, each block opened and closed by a token, so the blocks are built
// with a stack of their own and no nesting runs out of call stack.

import type { Token } from 'markdown-it';
import { joinText } from '../../import/stored-inline.js';
import type { StoredNode } from './document-format.js';
import { withObjects } from './markdown-read-captions.js';
import { type InlineContext, readInline } from './markdown-read-inline.js';

const withContent = (type: string, content: StoredNode[], attrs?: Record<string, unknown>) => ({
  type,
  ...(attrs ? { attrs } : {}),
  ...(content.length ? { content } : {}),
});

const TASK_BOX = /^\[([ xX])\][ \t]/;

// A bulleted item whose first paragraph starts with a task list box, as a checked or unchecked
// item without the box. A numbered item keeps its box as text: a checklist is a bulleted list.
// `boxed` holds the paragraphs whose Markdown starts with a box, one no backslash escapes.
function taskItem(item: StoredNode, boxed: WeakSet<StoredNode>): StoredNode {
  const [first, ...rest] = item.content ?? [];
  const [text, ...inline] = first && boxed.has(first) ? (first.content ?? []) : [];
  const box = text?.type === 'text' && !text.marks ? TASK_BOX.exec(text.text ?? '') : null;
  if (!first || !text || !box) return item;
  const after = (text.text ?? '').slice(box[0].length);
  const content = joinText([...(after ? [{ ...text, text: after }] : []), ...inline]);
  return {
    type: item.type,
    attrs: { checked: box[1] !== ' ' },
    content: [withContent('paragraph', content), ...rest],
  };
}

function listOf(open: Token, items: StoredNode[], boxed: WeakSet<StoredNode>): StoredNode {
  const ordered = open.type === 'ordered_list_open';
  const start = Number(open.attrGet('start') ?? 1);
  return {
    type: ordered ? 'orderedList' : 'bulletList',
    ...(ordered && start !== 1 ? { attrs: { start } } : {}),
    content: ordered ? items : items.map((item) => taskItem(item, boxed)),
  };
}

function cellOf(open: Token, content: StoredNode[]): StoredNode {
  const align = /text-align:(center|right)/.exec(String(open.attrGet('style') ?? ''))?.[1];
  return {
    type: open.type === 'th_open' ? 'tableHeader' : 'tableCell',
    ...(align ? { attrs: { align } } : {}),
    content: [withContent('paragraph', content)],
  };
}

// A paragraph holding only `$$` math, which is display math written on one line.
function paragraphOf(content: StoredNode[], display: boolean): StoredNode {
  const [only] = content;
  if (!display || content.length !== 1 || only?.type !== 'math')
    return withContent('paragraph', content);
  const source = only.attrs?.source;
  return withContent('mathBlock', [], source ? { source } : undefined);
}

// The block a closing token ends, from the token that opened it and the content between them.
function closed(frame: Open, boxed: WeakSet<StoredNode>): StoredNode[] {
  const { token: open, content } = frame;
  switch (open.type) {
    case 'paragraph_open': {
      const paragraph = paragraphOf(content, frame.display);
      if (frame.box) boxed.add(paragraph);
      return [paragraph];
    }
    case 'heading_open': {
      const level = Number(open.tag.slice(1));
      return [withContent('heading', content, level > 1 ? { level } : undefined)];
    }
    case 'blockquote_open':
      return [withContent('blockquote', withObjects(content))];
    case 'list_item_open':
      return [withContent('listItem', withObjects(content))];
    case 'bullet_list_open':
    case 'ordered_list_open':
      return [listOf(open, content, boxed)];
    case 'table_open':
      return [{ type: 'table', content: [{ type: 'caption' }, ...content] }];
    case 'tr_open':
      return [{ type: 'tableRow', content }];
    case 'th_open':
    case 'td_open':
      return [cellOf(open, content)];
    default:
      return content;
  }
}

const codeOf = (text: string, language?: string) =>
  withContent(
    'codeBlock',
    text ? [{ type: 'text', text }] : [],
    language ? { language } : undefined,
  );

// A token standing for a whole block, or the inline content of the block it is in.
function leafOf(token: Token, context: InlineContext): StoredNode[] {
  switch (token.type) {
    case 'inline':
      return readInline(token.children ?? [], context);
    case 'fence':
      return [codeOf(token.content.replace(/\n$/, ''), token.info.trim().split(/\s/)[0])];
    case 'code_block':
      return [codeOf(token.content.replace(/\n+$/, ''))];
    case 'math_block': {
      // Text after the opening `$$` is the block's label, which an equation does not hold.
      if (token.info) context.warnings.add('content-left-out', 'math label');
      const source = token.content.replace(/\n$/, '');
      return [withContent('mathBlock', [], source ? { source } : undefined)];
    }
    case 'hr':
      return [{ type: 'rule' }];
    case 'html_block':
      context.warnings.add('content-left-out', 'HTML block');
      return [];
    default:
      return [];
  }
}

interface Open {
  readonly token: Token;
  readonly content: StoredNode[];
  /** Whether the block holds only `$$` math, read as display math. */
  display: boolean;
  /** Whether its Markdown starts with a task list box. */
  box: boolean;
}

/** markdown-it block tokens as stored blocks, with figures and captions as the writer places them. */
export function readBlocks(tokens: readonly Token[], context: InlineContext): StoredNode[] {
  const root: StoredNode[] = [];
  const stack: Open[] = [];
  const boxed = new WeakSet<StoredNode>();
  const into = () => stack[stack.length - 1]?.content ?? root;
  for (const token of tokens) {
    if (token.nesting === 1) stack.push({ token, content: [], display: false, box: false });
    else if (token.nesting === -1) {
      const open = stack.pop();
      if (open) into().push(...closed(open, boxed));
    } else {
      const parent = stack[stack.length - 1];
      const children = token.children ?? [];
      if (parent && children.length === 1 && children[0]?.markup === '$$') parent.display = true;
      if (parent && token.type === 'inline' && TASK_BOX.test(token.content)) parent.box = true;
      into().push(...leafOf(token, context));
    }
  }
  return withObjects(root);
}
