// The templates lab's template file checks, as a host's server makes them on a template it is
// given: the file upgraded to the current format (`upgradeTemplateFile`) and validated
// (`validateTemplateFile`, with the schema, so its content and images are checked too), each error
// naming its setting; and, once it reads, the sections every document of it has
// (`requiredTemplateSections`), the settings it leaves unset (`missingTemplateSettings`) and the
// host's keyed records it inherits (`extensionRecord`, an entry set to `false` removing the one
// inherited).

import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  createDocumentSchema,
  extensionRecord,
  missingTemplateSettings,
  requiredTemplateSections,
  resolveTemplateFile,
  type TemplateFile,
  upgradeTemplateFile,
  validateTemplateFile,
} from '../../src/model/index.js';

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

// A template with something wrong in each part a server checks.
const BROKEN = {
  formatVersion: 1,
  id: 'field notes!',
  parent: 'field notes!',
  page: { size: 'Huge' },
  styles: {
    heading1: { numbering: { format: '1-x' } },
    custom: { '9 lives': { font: 'Georgia' } },
  },
  header: {
    content: [
      { type: 'image', attrs: { src: 'https://example.com/logo.png', width: 120, height: 40 } },
    ],
  },
  sections: [
    { name: 'Body', required: true },
    { name: 'notes', content: [{ type: 'nothing-known', content: [] }] },
    { name: 'notes' },
  ],
};

// A root template that leaves most settings to the stylesheet, with the host's own keyed records.
const ROOT: TemplateFile = {
  formatVersion: 1,
  id: 'field-notes',
  styles: { paragraph: { font: 'Georgia', size: '12px' } },
  extensions: { stamps: { draft: { label: 'Draft' }, final: { label: 'Final' } } },
  sections: [
    {
      name: 'cover',
      label: 'Cover',
      required: true,
      editable: false,
      content: [paragraph('Field notes')],
    },
    { name: 'body', label: 'Body', required: true },
    { name: 'appendix', label: 'Appendix', insertable: true },
  ],
};

// A template of it that drops one stamp and adds another.
const CHILD: TemplateFile = {
  formatVersion: 1,
  id: 'field-notes-site',
  parent: 'field-notes',
  extensions: { stamps: { draft: false, reviewed: { label: 'Reviewed' } } },
};

const SCHEMA = createDocumentSchema();

const resolved = (template: TemplateFile) =>
  resolveTemplateFile(template, {
    loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : id === ROOT.id ? ROOT : null),
    baseTemplateId: BASE_TEMPLATE_ID,
  });

// What the checks report on the template file given as JSON.
function check(source: string): unknown {
  let file: unknown;
  try {
    file = JSON.parse(source);
  } catch {
    return { errors: ['The template file is not JSON'] };
  }
  const upgraded = upgradeTemplateFile(file);
  const errors = validateTemplateFile(upgraded, { schema: SCHEMA });
  if (errors.length) return { errors };
  const template = upgraded as TemplateFile;
  return {
    errors,
    required: requiredTemplateSections(template).map((section) => section.name),
    missing: missingTemplateSettings(template).length,
  };
}

/** Wires the template file controls of the templates lab. */
export function mountTemplateFileCheck(): void {
  const source = document.querySelector<HTMLTextAreaElement>('#template-file');
  const output = document.querySelector<HTMLElement>('#template-file-output');
  if (!source || !output) return;
  source.value = JSON.stringify(BROKEN, null, 2);
  const show = (value: unknown) => {
    output.textContent = JSON.stringify(value, null, 2);
  };
  const on = (id: string, run: () => unknown) =>
    document.querySelector(`#${id}`)?.addEventListener('click', () => show(run()));
  on('check-template-file', () => check(source.value));
  on('use-root-template', () => {
    source.value = JSON.stringify(ROOT, null, 2);
    return check(source.value);
  });
  on('missing-settings', () => ({
    root: missingTemplateSettings(ROOT).slice(0, 5),
    rootCount: missingTemplateSettings(ROOT).length,
    resolvedCount: missingTemplateSettings(resolved(ROOT)).length,
  }));
  on('extension-records', () => ({
    root: extensionRecord(resolved(ROOT), 'stamps'),
    child: extensionRecord(resolved(CHILD), 'stamps'),
  }));
}
