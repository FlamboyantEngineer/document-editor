// What the toolbar's and the menubar's insert items offer, from what the host provides.

import { useMemo } from 'react';
import { customStyleNames } from '../../engine/index.js';
import type { DocumentEditorProps } from './document-editor.js';
import type { InsertFeatures } from './insert-controls.js';
import { DEFAULT_SYMBOLS } from './symbols.js';

/** What the insert items offer, kept while the host's features stay the same. */
export function useInsertFeatures(props: DocumentEditorProps): InsertFeatures {
  const linkedCode = Boolean(props.codeSource);
  const glossary = Boolean(props.glossary);
  const scripts = Boolean(props.scriptRunner);
  const references = Boolean(props.referenceSource);
  const diagrams = Boolean(props.diagrams);
  const { assets } = props;
  const imageSearch = useMemo(() => assets?.search?.bind(assets), [assets]);
  const symbols = props.symbols ?? DEFAULT_SYMBOLS;
  const custom = customStyleNames(props.template).join('\n');
  const { variables } = props;
  const templateContent = Boolean(props.onRegionChange ?? props.onTemplatePartChange);
  return useMemo<InsertFeatures>(
    () => ({
      linkedCode,
      symbols,
      glossary,
      // Custom styles are for a template's own content; document authors keep to the built-in ones.
      customStyles: custom && templateContent ? custom.split('\n') : [],
      template: props.template,
      scripts,
      references,
      referenceKinds: props.referenceKinds,
      diagrams,
      imageSearch,
      variables,
      templateContent,
    }),
    [
      linkedCode,
      symbols,
      glossary,
      custom,
      props.template,
      scripts,
      references,
      props.referenceKinds,
      diagrams,
      imageSearch,
      variables,
      templateContent,
    ],
  );
}
