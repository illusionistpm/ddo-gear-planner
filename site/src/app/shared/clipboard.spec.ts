import { Clipboard } from './clipboard';

describe('Clipboard', () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    // jsdom doesn't implement execCommand, and spyOn needs an existing property to wrap.
    if (!document.execCommand) {
      document.execCommand = () => false;
    }
  });

  afterEach(() => {
    // navigator.clipboard is normally a read-only, non-configurable
    // accessor - only overridden in tests that explicitly stub it below
    // (via defineProperty(configurable: true)), so this restore is a no-op
    // everywhere else.
    if (Object.getOwnPropertyDescriptor(navigator, 'clipboard')?.configurable) {
      Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
    }
  });

  // Typed narrowly (not against the DOM lib's own Clipboard interface) since
  // that name is shadowed in this file by the class under test.
  function stubNavigatorClipboard(clipboard: {
    writeText?: (text: string) => Promise<void>;
  } | undefined): void {
    Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
  }

  it('uses navigator.clipboard.writeText when available, reporting success synchronously', () => {
    const writeText = vi.fn().mockName('writeText').mockResolvedValue(undefined);
    stubNavigatorClipboard({ writeText });

    const result = Clipboard.copy('hello');

    expect(writeText).toHaveBeenCalledWith('hello');
    // True immediately, without awaiting the Promise writeText returns -
    // the call is what matters (it must happen synchronously, inside the
    // gesture); this deliberately doesn't wait on it. See clipboard.ts.
    expect(result).toBe(true);
  });

  it('does not throw when navigator.clipboard.writeText rejects - a best-effort failure, not a caller-visible one', () => {
    const writeText = vi.fn().mockName('writeText').mockRejectedValue(new Error('denied'));
    stubNavigatorClipboard({ writeText });

    expect(() => Clipboard.copy('hello')).not.toThrow();
  });

  it('falls back to execCommand when navigator.clipboard is unavailable, reporting its real result', () => {
    stubNavigatorClipboard(undefined);
    vi.spyOn(document, 'execCommand').mockReturnValue(true);

    const result = Clipboard.copy('hello');

    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(result).toBe(true);
  });

  it('reports failure (not a false "Copied!") when the execCommand fallback itself fails', () => {
    stubNavigatorClipboard(undefined);
    vi.spyOn(document, 'execCommand').mockReturnValue(false);

    const result = Clipboard.copy('hello');

    expect(result).toBe(false);
  });

  it('falls back to execCommand when navigator.clipboard exists but has no writeText (an older/partial implementation)', () => {
    stubNavigatorClipboard({});
    vi.spyOn(document, 'execCommand').mockReturnValue(true);

    const result = Clipboard.copy('hello');

    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(result).toBe(true);
  });

  it('removes the temporary textarea it creates for the execCommand fallback', () => {
    stubNavigatorClipboard(undefined);
    vi.spyOn(document, 'execCommand').mockReturnValue(true);

    Clipboard.copy('hello');

    expect(document.querySelector('textarea')).toBeNull();
  });
});
