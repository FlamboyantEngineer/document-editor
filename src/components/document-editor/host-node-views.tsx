// The host's React node views on a plain view (DOCE-EDITOR-1.8): each node a host view draws gets
// an element of its own, which the view holds, and the host's component is drawn into it through
// a portal in the editor's tree, so it reads the providers the editor's own views read. The node's
// content goes in an element the component places where it renders its children.

import type { RichTextNodeViewProps } from '@flamboyantengineer/ui-components/rich-text-editor';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type {
  Decoration,
  DecorationSource,
  NodeViewConstructor,
  ViewMutationRecord,
} from 'prosemirror-view';
import {
  type ComponentType,
  type ReactNode,
  type ReactPortal,
  useCallback,
  useMemo,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { createHooks } from '../../utils/hooks.js';
import { ownControlOf } from './typed-text.js';

/** The host's React node views by node type name. */
export type HostNodeViews = Readonly<Record<string, ComponentType<RichTextNodeViewProps>>>;

const hooks = createHooks('host-view', ['content']);

// What a host view is drawn with: the node, and its decorations.
interface Drawn {
  readonly node: ProseMirrorNode;
  readonly decorations: readonly Decoration[];
  readonly innerDecorations: DecorationSource;
}

const keepRef = () => undefined;

// Where the component renders its children: the node's content, which the view keeps in an
// element of its own, moved in once React has drawn the place for it.
function NodeContent({ content, inline }: { content: HTMLElement; inline: boolean }) {
  const place = useCallback(
    (element: HTMLElement | null) => {
      if (element && content.parentNode !== element) element.appendChild(content);
    },
    [content],
  );
  const Tag = inline ? 'span' : 'div';
  return <Tag {...hooks.slot('content')} ref={place} />;
}

// One host view's portal: the component, drawn into the element the view holds.
function hostPortal(
  Component: ComponentType<RichTextNodeViewProps>,
  {
    dom,
    content,
    getPos,
    key,
  }: {
    dom: HTMLElement;
    content: HTMLElement | null;
    getPos: () => number | undefined;
    key: string;
  },
  drawn: Drawn,
): ReactPortal {
  const nodeProps = {
    ...drawn,
    getPos: () => getPos() ?? -1,
    contentDOMRef: keepRef,
  };
  return createPortal(
    <Component nodeProps={nodeProps} ref={keepRef}>
      {content ? <NodeContent content={content} inline={drawn.node.isInline} /> : null}
    </Component>,
    dom,
    key,
  );
}

// React's own changes to a host view are not the document's: only those in the node's content are.
function outsideContent(content: HTMLElement | null) {
  return (mutation: ViewMutationRecord) =>
    mutation.type !== 'selection' && !(content && content.contains(mutation.target));
}

/**
 * The host's React node views as a plain view's node views, and the portals that draw them, to
 * render in the editor's tree.
 */
export function useHostNodeViews(views: HostNodeViews | undefined): {
  readonly nodeViews: Readonly<Record<string, NodeViewConstructor>>;
  readonly portals: ReactNode;
} {
  const [portals, setPortals] = useState<ReadonlyMap<string, ReactPortal>>(() => new Map());
  const nodeViews = useMemo(() => {
    let count = 0;
    const change = (edit: (next: Map<string, ReactPortal>) => void) =>
      setPortals((current) => {
        const next = new Map(current);
        edit(next);
        return next;
      });
    const constructorOf =
      (Component: ComponentType<RichTextNodeViewProps>): NodeViewConstructor =>
      (node, view, ...[getPos, decorations, innerDecorations]) => {
        const owner = view.dom.ownerDocument;
        const dom = owner.createElement(node.isInline ? 'span' : 'div');
        dom.className = hooks.className;
        const content = node.isLeaf
          ? null
          : owner.createElement(node.isInline || node.inlineContent ? 'span' : 'div');
        const key = `host-view-${String((count += 1))}`;
        const draw = (drawn: Drawn) =>
          change((next) =>
            next.set(key, hostPortal(Component, { dom, content, getPos, key }, drawn)),
          );
        draw({ node, decorations, innerDecorations });
        return {
          dom,
          contentDOM: content,
          update(next, nextDecorations, nextInner) {
            if (next.type !== node.type) return false;
            draw({ node: next, decorations: nextDecorations, innerDecorations: nextInner });
            return true;
          },
          ignoreMutation: outsideContent(content),
          // An event in a control the view draws, such as a text field, is that control's.
          stopEvent: (event) =>
            !(content && content.contains(event.target as Node | null)) &&
            ownControlOf(event.target, dom) !== null,
          destroy: () => change((next) => next.delete(key)),
        };
      };
    return Object.fromEntries(
      Object.entries(views ?? {}).map(([name, Component]) => [name, constructorOf(Component)]),
    );
  }, [views]);
  return { nodeViews, portals: [...portals.values()] };
}
