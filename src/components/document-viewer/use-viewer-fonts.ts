import { type RefObject, useEffect, useMemo, useState } from 'react';
import { type FaceRegistration, registerFaces } from '../../document/font-registry.js';
import type { FontFiles } from '../../host/font-files.js';
import type { TemplateFile } from '../../model/index.js';
import { aliasTemplateFonts, resolveServedTemplate } from '../../pagination/served-template.js';

interface ViewerFonts {
  readonly files: FontFiles;
  readonly registration: FaceRegistration;
  readonly refused: ReadonlySet<string>;
}

/** Resolves the viewer's template in the families its document can draw (DOCE-PAGINATION-13.8). */
export function useViewerFonts(
  template: TemplateFile,
  files: FontFiles | null,
  root: RefObject<HTMLElement | null>,
): TemplateFile {
  const [drawn, setDrawn] = useState<ViewerFonts | null>(null);
  useEffect(() => {
    const doc = root.current?.ownerDocument;
    if (!doc || !files?.faces.length) return undefined;
    const registration = registerFaces(doc, files);
    let active = true;
    void registration.loaded.then((refused) => {
      if (active && (registration.renamed || refused.size))
        setDrawn({ files, registration, refused });
    });
    return () => {
      active = false;
      registration.release();
      // A replacement or an Activity resume can register the same files under different names.
      setDrawn((current) => (current?.registration === registration ? null : current));
    };
  }, [files, root]);
  const current = drawn?.files === files ? drawn : null;
  return useMemo(() => {
    const resolved = resolveServedTemplate(template, files, current?.refused).template;
    return current ? aliasTemplateFonts(resolved, current.registration.drawnFamily) : resolved;
  }, [template, files, current]);
}
