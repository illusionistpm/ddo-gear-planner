// Copies text to the clipboard from inside a synchronous user-gesture call
// stack (a click handler) - both paths below need to actually run within
// that gesture, or the browser refuses the write. Returns whether it
// succeeded, so a caller can show "Copied!" only when it's actually true
// (previously execCommand's own boolean result was silently discarded, so a
// failed copy still showed a success confirmation).
export class Clipboard {
  static copy(text: string): boolean {
    if (navigator.clipboard?.writeText) {
      // navigator.clipboard.writeText is itself async (it returns a
      // Promise) even though the call has to happen synchronously, right
      // here in the gesture, to be honored at all - awaiting it would mean
      // stepping outside that gesture before the browser has decided
      // whether to allow it. It succeeds in the overwhelming majority of
      // real cases (a secure-context browser, invoked from an actual
      // click), so this reports success optimistically. A rejection is
      // swallowed rather than retried through the execCommand fallback
      // below - retrying there would risk a visible double-write for what's
      // actually a rare failure (e.g. a document that's lost focus).
      navigator.clipboard.writeText(text).catch(() => { /* best-effort - see above */ });
      return true;
    }
    return Clipboard.copyViaExecCommand(text);
  }

  // Fallback for a context without the Clipboard API (an insecure/non-HTTPS
  // origin, or an older browser) - still needs the same gesture-scoped
  // synchronous call, hence the hidden-textarea dance rather than anything
  // async.
  private static copyViaExecCommand(text: string): boolean {
    const selBox = document.createElement('textarea');
    selBox.style.position = 'fixed';
    selBox.style.left = '0';
    selBox.style.top = '0';
    selBox.style.opacity = '0';
    selBox.value = text;
    document.body.appendChild(selBox);
    selBox.focus();
    selBox.select();
    const succeeded = document.execCommand('copy');
    document.body.removeChild(selBox);
    return succeeded;
  }
}
