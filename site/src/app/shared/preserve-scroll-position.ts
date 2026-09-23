// Clicking a remove/clear button whose row or slot disappears right after
// scrolls its `.planner-tab-panel` back to (0, 0) in Chrome - but not
// because of the removal. It's the browser's native "scroll the newly
// focused element into view" behavior, which native focus() runs
// synchronously as part of a click's default action (confirmed with a
// static, Angular-free repro: focusing a button positioned near the top of
// an `overflow-y: auto` region - even one that's already fully visible -
// makes the browser realign that region to the very top). That default
// action fires on mousedown, before the click event (and this app's
// (click) removal handler) ever runs, so by the time a (click) handler
// could react, the jump has already happened - the fix has to intervene
// earlier. Bind this to (mousedown) on the same button: it captures the
// panel's scroll position before the browser's focus/scroll runs, then
// reasserts it on the next two animation frames (one for the focus jump,
// one for Angular's own DOM update from the removal a moment later).
export function preserveScrollOnMouseDown(event: Event) {
  const target = event.currentTarget;
  const panel = target instanceof HTMLElement ? findScrollableAncestor(target) : null;
  if (!panel) {
    return;
  }

  const scrollTop = panel.scrollTop;
  requestAnimationFrame(() => {
    panel.scrollTop = scrollTop;
    requestAnimationFrame(() => {
      panel.scrollTop = scrollTop;
    });
  });
}

// Not every remove button lives in `.planner-tab-panel` - the suggestion
// drawer has its own scrollable region - so walk up to whichever ancestor
// is actually scrolling rather than naming one class.
function findScrollableAncestor(element: HTMLElement): HTMLElement | null {
  let node = element.parentElement;
  while (node) {
    if (node.scrollHeight > node.clientHeight && /(auto|scroll)/.test(getComputedStyle(node).overflowY)) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}
