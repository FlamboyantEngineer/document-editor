// When a lab with document editors is ready for a test: once every editor's pages are settled, laid
// out with no layout due and drawn by the views that follow them, such as a table of contents
// taking its page numbers (`data-layout-state`).

// Whether every document editor on the page has settled its pages, and there is one.
function isSettled(): boolean {
  const editors = [...document.querySelectorAll('.de-document-editor')];
  return (
    editors.length > 0 &&
    editors.every((editor) => editor.getAttribute('data-layout-state') === 'settled')
  );
}

/** Marks the lab ready (`data-lab-ready`) once every document editor on the page has settled. */
export function markReadyWhenSettled(): void {
  const mark = () => {
    if (!isSettled()) return false;
    document.documentElement.dataset.labReady = 'true';
    return true;
  };
  if (mark()) return;
  const observer = new MutationObserver(() => {
    if (mark()) observer.disconnect();
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-layout-state'],
  });
}
