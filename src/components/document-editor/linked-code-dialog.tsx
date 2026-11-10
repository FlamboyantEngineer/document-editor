// The linked code dialog: an address the host resolves to code, previewed as it resolves. It
// changes the linked code selected, or inserts it.

import { CodeBlock } from '@flamboyantengineer/ui-components/code-block';
import { TextField } from '@flamboyantengineer/ui-components/text-field';
import type { EditorView } from 'prosemirror-view';
import { useEffect, useState } from 'react';
import { setLinkedCode } from '../../engine/index.js';
import type { CodeSourceAdapter, ResolvedCode } from '../../host/index.js';
import { applying, type DialogProps, EditorModal, selectedNode, titleOf } from './dialog-parts.js';

type CodeState =
  | { readonly status: 'idle' | 'loading' | 'missing' | 'failed' }
  | { readonly status: 'ready'; readonly code: ResolvedCode };

// The code an address names, resolved by the host a moment after the address stops changing.
function useResolvedCode(view: EditorView, url: string, source: CodeSourceAdapter): CodeState {
  const address = url.trim();
  const [answer, setAnswer] = useState<{ address: string; state: CodeState } | null>(null);
  useEffect(() => {
    const owner = view.dom.ownerDocument.defaultView;
    if (!owner || !address) return undefined;
    const controller = new owner.AbortController();
    const settle = (state: CodeState) => {
      if (!controller.signal.aborted) setAnswer({ address, state });
    };
    const timer = owner.setTimeout(() => {
      source.resolve(address, controller.signal).then(
        (result) =>
          settle(
            result.ok
              ? { status: 'ready', code: result.value }
              : { status: result.error.kind === 'not-found' ? 'missing' : 'failed' },
          ),
        () => settle({ status: 'failed' }),
      );
    }, 300);
    return () => {
      owner.clearTimeout(timer);
      controller.abort();
    };
  }, [view, address, source]);
  if (!address) return { status: 'idle' };
  return answer?.address === address ? answer.state : { status: 'loading' };
}

// The dialog's status and error lines for the code's state.
function codeMessages(code: CodeState, labels: DialogProps['labels']) {
  if (code.status === 'loading') return { status: labels.codeStatus('loading') };
  if (code.status === 'missing' || code.status === 'failed') {
    return { error: labels.codeStatus(code.status) };
  }
  return {};
}

// The linked code to insert, once the address resolved.
function linkedCode(url: string, code: ResolvedCode | null, language: unknown) {
  return setLinkedCode({
    url: url.trim(),
    code: code?.code ?? '',
    language: code?.language ?? (typeof language === 'string' ? language : undefined),
    startLine: code?.startLine,
  });
}

/** Inserts linked code, or changes the linked code selected. */
export function LinkedCodeDialog({
  view,
  labels,
  onClose,
  codeSource,
}: DialogProps & { codeSource: CodeSourceAdapter }) {
  const [node] = useState(() => selectedNode(view.state, ['linked_code_block']));
  const [url, setUrl] = useState(typeof node?.attrs.url === 'string' ? node.attrs.url : '');
  const code = useResolvedCode(view, url, codeSource);
  const ready = code.status === 'ready' ? code.code : null;
  return (
    <EditorModal
      view={view}
      onClose={onClose}
      data-dialog="linked-code"
      size="lg"
      title={titleOf(node ? labels.editLinkedCode : labels.linkedCode)}
      {...codeMessages(code, labels)}
      primaryAction={applying(view, {
        label: node ? labels.applyAction : labels.insertAction,
        command: linkedCode(url, ready, node?.attrs.language),
        isDisabled: !ready,
      })}
    >
      <TextField
        label={labels.codeAddress}
        type="url"
        autoFocus
        tracksChanges={false}
        value={url}
        onChange={setUrl}
      />
      {ready ? <CodeBlock code={ready.code} language={ready.language} lineNumbers /> : null}
    </EditorModal>
  );
}
