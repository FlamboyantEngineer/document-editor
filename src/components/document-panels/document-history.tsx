// The history pane: a document's versions on the base library's VersionHistory, grouped with the
// automatic versions folded under named ones. The reader saves a named version, renames and
// restores one, views one in place of the document and compares two; the banner over a version
// shown names it and its template and returns to the document.

import { Banner } from '@flamboyantengineer/ui-components/banner';
import { Button } from '@flamboyantengineer/ui-components/button';
import type { Key } from '@flamboyantengineer/ui-components/core';
import { Modal } from '@flamboyantengineer/ui-components/modal';
import { TextField } from '@flamboyantengineer/ui-components/text-field';
import {
  VersionHistory,
  type VersionHistoryVersion,
} from '@flamboyantengineer/ui-components/version-history';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import { useEffect, useRef, useState } from 'react';
import type { VersionChangeDisplay } from '../../engine/version-changes.js';
import type {
  DocumentVersion,
  EditorPerson,
  HostResult,
  IdentityAdapter,
} from '../../host/adapters.js';
import { type EditorCapabilities, READ_ONLY_CAPABILITIES } from '../../host/capabilities.js';
import type { TemplateFile } from '../../model/format/template-format.js';
import type { DocumentSession, SessionStateUpdate } from '../../session/document-session.js';
import type { VersionGroup } from '../../session/version-groups.js';
import {
  createDocumentVersions,
  type DocumentVersions,
  type DocumentVersionsOptions,
  type HistoricalView,
} from '../../session/versions.js';
import { usePeople } from '../../utils/use-people.js';
import { useSessionValue } from '../document-session/document-session.js';
import { DEFAULT_HISTORY_LABELS, type DocumentHistoryLabels } from './history-labels.js';

export interface DocumentHistoryProps<R> {
  /** The document's versions (`createDocumentVersions`). */
  readonly versions: DocumentVersions<R>;
  /**
   * What the reader may do: open the history, save and name versions, and edit to restore one.
   * Defaults to the session's live capabilities.
   */
  readonly capabilities?: EditorCapabilities | undefined;
  /** What the reader has now, which a historical view keeps until the reader returns. */
  readonly returnTo: R;
  /** Called with what the reader had before a historical view, once it ends. */
  readonly onReturn: (returnTo: R) => void;
  /** Names the people who saved versions. */
  readonly identity?: IdentityAdapter | undefined;
  readonly labels?: Partial<DocumentHistoryLabels> | undefined;
  readonly className?: string | undefined;
}

export interface DocumentHistoryBannerProps<R> {
  readonly versions: DocumentVersions<R>;
  readonly onReturn: (returnTo: R) => void;
  readonly labels?: Partial<DocumentHistoryLabels> | undefined;
  readonly className?: string | undefined;
}

/** The props a historical view gives the document editor in place of the document's own. */
export interface HistoricalEditorProps {
  state: EditorState;
  onStateChange: (update: SessionStateUpdate) => void;
  /** The template the version pins. */
  template: TemplateFile;
  /** A historical version never accepts changes. */
  editable: false;
  /** The older version compared with, or null. */
  compare: { previous: ProseMirrorNode; display?: VersionChangeDisplay | undefined } | null;
}

/**
 * Follows a session's versions while the component is shown, and again whenever the session
 * changes; null until the first are followed. The other options are read when they are.
 */
export function useDocumentVersions<R>(
  options: Omit<DocumentVersionsOptions, 'session'> & { session: DocumentSession | null },
): DocumentVersions<R> | null {
  const [versions, setVersions] = useState<DocumentVersions<R> | null>(null);
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const { session } = options;
  useEffect(() => {
    if (!session) return;
    const opened = createDocumentVersions<R>({ ...latest.current, session });
    // The versions are followed outside React, by this effect, and stop with it.

    setVersions(opened);
    return () => opened.close();
  }, [session]);
  return versions?.session === session ? versions : null;
}

// A host failure as an error the base library's dialogs show.
async function orThrow<T>(result: Promise<HostResult<T>>) {
  const settled = await result;
  if (!settled.ok) throw new Error(settled.error.message ?? settled.error.kind);
}

// The people who saved the versions, by id.
const authorsOf = (versions: readonly DocumentVersion[]) =>
  versions.flatMap((version) => version.author ?? []);

type People = ReadonlyMap<string, EditorPerson>;

const toRow = (
  version: DocumentVersion,
  { labels, people }: { labels: DocumentHistoryLabels; people: People },
): VersionHistoryVersion => {
  const name = version.author === null ? undefined : people.get(version.author)?.name;
  return {
    id: version.revision,
    label: version.label ?? undefined,
    time: version.savedAt,
    person: name === undefined ? undefined : { name },
    summary: labels.versionSummary(version),
  };
};

const toRows = (
  groups: readonly VersionGroup[],
  context: { labels: DocumentHistoryLabels; people: People },
) =>
  groups.map(({ version, folded }) => ({
    ...toRow(version, context),
    children: folded.length ? folded.map((each) => toRow(each, context)) : undefined,
  }));

// The versions a historical view shows, as the history's selection.
const viewKeys = (view: HistoricalView<unknown> | null): Key[] => {
  if (!view) return [];
  const shown = view.version.version.revision;
  return view.previous ? [view.previous.version.revision, shown] : [shown];
};

// Names and saves a new version.
function SaveVersion<R>({
  versions,
  labels,
}: {
  versions: DocumentVersions<R>;
  labels: DocumentHistoryLabels;
}) {
  const [isOpen, setOpen] = useState(false);
  const [name, setName] = useState('');
  return (
    <>
      <Button onPress={() => setOpen(true)}>{labels.saveVersion}</Button>
      <Modal
        isOpen={isOpen}
        onOpenChange={(open) => {
          setOpen(open);
          if (!open) setName('');
        }}
        title={labels.saveVersionTitle}
        size="sm"
        primaryAction={{
          label: labels.save,
          isDisabled: !name.trim(),
          onPress: async (close) => {
            await orThrow(versions.saveVersion(name.trim()));
            close();
          },
        }}
      >
        <TextField label={labels.versionName} value={name} onChange={setName} autoFocus />
      </Modal>
    </>
  );
}

// The capabilities given, or else the session's live ones; none until the document loads.
function useReaderCapabilities<R>(
  versions: DocumentVersions<R>,
  given: EditorCapabilities | undefined,
): EditorCapabilities {
  const document = useSessionValue(versions.session.document);
  return given ?? document?.capabilities ?? READ_ONLY_CAPABILITIES;
}

/** A document's versions, to save, name, view, compare and restore (DOCE-VERSIONS-4). */
export function DocumentHistory<R>(props: DocumentHistoryProps<R>) {
  const { versions, returnTo, onReturn } = props;
  const capabilities = useReaderCapabilities(versions, props.capabilities);
  const labels = { ...DEFAULT_HISTORY_LABELS, ...props.labels };
  const list = useSessionValue(versions.list);
  const view = useSessionValue(versions.view);
  const people = usePeople(props.identity, authorsOf(list.versions));
  const [picked, setPicked] = useState<ReadonlySet<Key>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const current = list.versions[0]?.revision ?? null;
  const show = (revision: string, compareWith?: string) => {
    setError(null);
    versions.viewVersion(revision, { returnTo, compareWith }).then(
      (shown) => {
        if (!shown.ok) setError(shown.error.message ?? shown.error.kind);
      },
      // A version that could not be read at all says so too, as one the host refused does.
      (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)),
    );
  };
  const leave = () => {
    if (view) onReturn(versions.returnFromView() ?? returnTo);
  };
  if (!capabilities.history)
    return <Banner className={props.className} description={labels.noHistory} />;
  return (
    <div className={props.className}>
      {capabilities.saveVersion ? <SaveVersion versions={versions} labels={labels} /> : null}
      {error ? <Banner tone="danger" description={error} onDismiss={() => setError(null)} /> : null}
      <VersionHistory
        aria-label={labels.history}
        versions={toRows(list.groups, { labels, people })}
        currentKey={current}
        selectedKeys={picked.size === 2 ? picked : viewKeys(view)}
        isLoading={list.status === 'loading'}
        error={list.status === 'failed' ? (list.error?.message ?? list.error?.kind) : undefined}
        onRetry={() => void versions.refresh()}
        onSelectionChange={(keys) => {
          const [first, second] = [...keys].map(String);
          setPicked(second === undefined ? new Set() : keys);
          if (second !== undefined) return;
          if (first === undefined || first === current) leave();
          else show(first);
        }}
        onCompare={([older, newer]) => {
          setPicked(new Set());
          show(String(newer), String(older));
        }}
        onRename={
          capabilities.saveVersion
            ? (key, label) => orThrow(versions.rename(String(key), label.trim() || null))
            : undefined
        }
        onRestore={
          capabilities.edit
            ? async (key) => {
                leave();
                await orThrow(versions.restore(String(key)));
              }
            : undefined
        }
      />
    </div>
  );
}

/**
 * The document editor's props while a version shows in place of the document (DOCE-VERSIONS-5.1):
 * its content, read-only, with the template it pins, compared with the older version if any.
 */
export function historicalEditorProps<R>(
  versions: DocumentVersions<R>,
  { view, display }: { view: HistoricalView<R>; display?: VersionChangeDisplay | undefined },
): HistoricalEditorProps {
  return {
    state: view.version.state,
    onStateChange: versions.updateView,
    template: view.version.template,
    editable: false,
    compare: view.previous ? { previous: view.previous.state.doc, display } : null,
  };
}

/** Over a version shown in place of the document: what it is, its template, and the way back (DOCE-VERSIONS-5). */
export function DocumentHistoryBanner<R>(props: DocumentHistoryBannerProps<R>) {
  const { versions, onReturn } = props;
  const labels = { ...DEFAULT_HISTORY_LABELS, ...props.labels };
  const view = useSessionValue(versions.view);
  if (!view) return null;
  const shown = view.version;
  const title = labels.versionTitle(shown.version);
  return (
    <Banner
      className={props.className}
      tone="info"
      title={
        view.previous
          ? labels.comparing(labels.versionTitle(view.previous.version), title)
          : labels.viewing(title)
      }
      description={shown.pin ? labels.pinnedTemplate(shown.pin) : undefined}
      actions={
        <Button
          onPress={() => {
            const back = versions.returnFromView();
            if (back !== null) onReturn(back);
          }}
        >
          {labels.returnToCurrent}
        </Button>
      }
    />
  );
}
