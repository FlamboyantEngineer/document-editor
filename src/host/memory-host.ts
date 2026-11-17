import type { StoredContent } from '../model/format/document-format.js';
import type { TemplateFile } from '../model/format/template-format.js';
import type { GlossaryEntry } from '../model/glossary.js';
import { sliceCodeLines } from '../model/linked-code.js';
import type { ReferenceTargetBaseline } from '../model/reference-format.js';
import type {
  AssetAdapter,
  CodeSourceAdapter,
  CompletionContext,
  EditorHost,
  EditorPerson,
  ExternalReference,
  GlossaryAdapter,
  IdentityAdapter,
  ScriptDiagnostic,
  ScriptRunnerAdapter,
  ScriptRunRequest,
  ScriptVocabularyEntry,
  StoredAsset,
  StoredDocument,
  TemplateStoreAdapter,
  VersionStoreAdapter,
} from './adapters.js';
import { type EditorCapabilities, FULL_CAPABILITIES } from './capabilities.js';
import { createMemoryComments, type MemoryCommentsOptions } from './memory-comments.js';
import { createMemoryCompletion } from './memory-completion.js';
import {
  createMemoryDocuments,
  createMemoryHistory,
  createMemoryVersions,
  notFound,
} from './memory-documents.js';
import { createMemoryReferences, matchesQuery } from './memory-references.js';
import {
  createMemoryDrafts,
  createMemorySessionParts,
  type MemoryHostControls,
} from './memory-session.js';
import { createMemoryTemplates } from './memory-templates.js';
import type { DraftsAdapter, LifecycleAdapter } from './session-adapters.js';

export interface MemoryHostOptions {
  /** The reader. Defaults to a person named Reader. */
  person?: EditorPerson | undefined;
  /** Other people the identity adapter knows. */
  people?: readonly EditorPerson[] | undefined;
  /** The reader's capabilities on every document. Defaults to all of them. */
  capabilities?: EditorCapabilities | undefined;
  documents?: readonly Pick<StoredDocument, 'id' | 'content'>[] | undefined;
  templates?: readonly TemplateFile[] | undefined;
  /** The comment threads the store starts with, and the time comments are posted at. */
  comments?: MemoryCommentsOptions | undefined;
  /** The glossary's entries at first. */
  glossary?: readonly GlossaryEntry[] | undefined;
  /** The citations of other documents the reference source finds. */
  citations?: readonly ExternalReference[] | undefined;
  /** The targets each cited document holds, by the document's id, which a citation may name. */
  citationTargets?: Readonly<Record<string, readonly ReferenceTargetBaseline[]>> | undefined;
  /** Source files the code source resolves, by URL without its fragment. */
  code?: Readonly<Record<string, string>> | undefined;
  /** Produces a script's content; without it the host runs no scripts. A throw is a failure. */
  scripts?: ((request: ScriptRunRequest) => StoredContent) | undefined;
  /**
   * The key of what a script reads, recorded as each output's `provenance.inputs` and given as the
   * runner's `inputsKey`; without it outputs record no inputs and none is stale.
   */
  scriptInputsKey?: ((request: Omit<ScriptRunRequest, 'purpose'>) => string) | undefined;
  /** The names the scripts can use, which the script editor completes and documents. */
  scriptVocabulary?: readonly ScriptVocabularyEntry[] | undefined;
  /** Checks a script without running it, returning its problems. */
  checkScript?: ((source: string) => readonly ScriptDiagnostic[]) | undefined;
  /** The time a document is saved at, which its version records. Defaults to now. */
  now?: (() => Date) | undefined;
  /** Answers a completion request; without it the host has no completion provider. */
  complete?: ((context: CompletionContext) => string) | undefined;
}

const DEFAULT_PERSON: EditorPerson = { id: 'reader', name: 'Reader' };

function createMemoryIdentity(person: EditorPerson, people: readonly EditorPerson[]) {
  const everyone = [person, ...people.filter((other) => other.id !== person.id)];
  const identity: IdentityAdapter = {
    currentPerson: () => person,
    findPeople: (query) => {
      const needle = query.trim().toLowerCase();
      return Promise.resolve(everyone.filter((other) => other.name.toLowerCase().includes(needle)));
    },
    resolvePeople: (ids) => {
      const wanted = new Set(ids);
      return Promise.resolve(everyone.filter((other) => wanted.has(other.id)));
    },
  };
  return identity;
}

/** Keeps uploads as object URLs for the page session. */
function createMemoryAssets(): AssetAdapter {
  const assets = new Map<string, StoredAsset>();
  return {
    upload: (file) => {
      const asset: StoredAsset = {
        id: `asset-${assets.size + 1}`,
        url: URL.createObjectURL(file),
        name: file.name,
        mediaType: file.type,
      };
      assets.set(asset.id, asset);
      return Promise.resolve({ ok: true, value: asset });
    },
    resolveUrl: (assetId) => assets.get(assetId)?.url ?? '',
  };
}

/** Keeps a glossary in memory: entries found by their abbreviation or expansion, added with ids. */
function createMemoryGlossary(initial: readonly GlossaryEntry[], now: () => Date): GlossaryAdapter {
  const entries = new Map(initial.map((entry) => [entry.id, { ...entry }]));
  const copy = (entry: GlossaryEntry): GlossaryEntry => ({ ...entry });
  return {
    search: (query) =>
      Promise.resolve({
        ok: true,
        value: [...entries.values()]
          .filter(
            (entry) =>
              !entry.archivedAt && matchesQuery(query, entry.abbreviation, entry.expansion),
          )
          .map(copy),
      }),
    create: ({ abbreviation, expansion }) => {
      const at = now().toISOString();
      const entry: GlossaryEntry = {
        id: `glossary-${String(entries.size + 1)}`,
        abbreviation: abbreviation.trim(),
        expansion: expansion.trim(),
        archivedAt: null,
        createdBy: 'reader',
        createdAt: at,
        updatedAt: at,
      };
      entries.set(entry.id, entry);
      return Promise.resolve({ ok: true, value: copy(entry) });
    },
    resolve: (ids) =>
      Promise.resolve({
        ok: true,
        value: ids.flatMap((id) => {
          const entry = entries.get(id);
          return entry ? [copy(entry)] : [];
        }),
      }),
  };
}

/** Resolves linked code from source files by URL, the lines its fragment names. */
function createMemoryCodeSource(files: Readonly<Record<string, string>>): CodeSourceAdapter {
  return {
    resolve: (url) => {
      const source = files[url.trim().replace(/#.*$/, '')];
      if (source === undefined) return Promise.resolve(notFound(url));
      return Promise.resolve({ ok: true, value: sliceCodeLines(source, url) });
    },
  };
}

/** Runs scripts with the function given, its throw an `unavailable` failure with the thrown message. */
function createMemoryScripts(
  produce: NonNullable<MemoryHostOptions['scripts']>,
  { scriptVocabulary, checkScript, scriptInputsKey }: MemoryHostOptions,
): ScriptRunnerAdapter {
  return {
    vocabulary: scriptVocabulary,
    ...(checkScript
      ? { check: (source: string) => Promise.resolve({ ok: true, value: checkScript(source) }) }
      : {}),
    ...(scriptInputsKey
      ? {
          inputsKey: (request: Omit<ScriptRunRequest, 'purpose'>) =>
            Promise.resolve({ ok: true, value: scriptInputsKey(request) }),
        }
      : {}),
    run: (request) => {
      try {
        const content = produce(request);
        const { blockId, source, document } = request;
        const provenance = scriptInputsKey
          ? { inputs: scriptInputsKey({ blockId, source, document }) }
          : null;
        return Promise.resolve({ ok: true, value: { content, provenance } });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Promise.resolve({ ok: false, error: { kind: 'unavailable', message } });
      }
    },
  };
}

/** An in-memory host, with the controls a lab or test changes it through while it runs. */
export interface MemoryHost extends EditorHost {
  drafts: DraftsAdapter;
  lifecycle: LifecycleAdapter;
  memory: MemoryHostControls;
  /** The template store, which a template workspace opens, saves and versions templates in. */
  templates: TemplateStoreAdapter;
}

// The stores' requests, each taking the latency set and failing as the controls say.
function withFaults(
  {
    documents,
    versions,
    templates,
    drafts,
  }: Pick<MemoryHost, 'documents' | 'drafts'> & {
    versions: VersionStoreAdapter;
    templates: TemplateStoreAdapter;
  },
  faulty: ReturnType<typeof createMemorySessionParts>['faulty'],
) {
  return {
    documents: {
      ...documents,
      load: faulty('documents.load', documents.load),
      save: faulty('documents.save', documents.save),
    },
    versions: {
      ...versions,
      list: faulty('versions.list', versions.list),
      load: faulty('versions.load', versions.load),
      ...(versions.loadSnapshot
        ? { loadSnapshot: faulty('versions.load', versions.loadSnapshot) }
        : {}),
      ...(versions.create ? { create: faulty('versions.create', versions.create) } : {}),
    },
    templates: { ...templates, load: faulty('templates.load', templates.load) },
    drafts: { ...drafts, put: faulty('drafts.put', drafts.put) },
  };
}

/**
 * A complete host that keeps everything in memory, for demos, tests and standalone use. Saves check
 * the base revision, so conflict handling can be exercised without a server; `memory` injects
 * latency and failures, changes the reader's capabilities and drives the page lifecycle.
 */
export function createMemoryHost(options: MemoryHostOptions = {}): MemoryHost {
  const identity = createMemoryIdentity(options.person ?? DEFAULT_PERSON, options.people ?? []);
  const now = options.now ?? (() => new Date());
  const comments = createMemoryComments(identity, options.comments);
  const templates = createMemoryTemplates(options.templates ?? [], {
    author: () => identity.currentPerson().id,
    now,
  });
  const history = createMemoryHistory(() => identity.currentPerson().id, now, {
    discussion: comments.snapshot,
    template: (content) => templates.snapshot(content.template ?? null),
  });
  for (const document of options.documents ?? []) history.record(document.id, document.content);
  const session = createMemorySessionParts(options.capabilities ?? FULL_CAPABILITIES);
  const stores = withFaults(
    {
      documents: createMemoryDocuments(history),
      versions: createMemoryVersions(history),
      templates,
      drafts: createMemoryDrafts(),
    },
    session.faulty,
  );
  return {
    identity,
    permissions: session.permissions,
    ...stores,
    lifecycle: session.lifecycle,
    memory: session.controls,
    assets: createMemoryAssets(),
    codeSource: createMemoryCodeSource(options.code ?? {}),
    glossary: createMemoryGlossary(options.glossary ?? [], now),
    references: createMemoryReferences(options),
    comments,
    ...(options.scripts ? { scripts: createMemoryScripts(options.scripts, options) } : {}),
    ...(options.complete ? { completion: createMemoryCompletion(options.complete) } : {}),
  };
}
