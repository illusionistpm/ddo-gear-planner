import { DOCUMENT } from '@angular/common';
import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';

/**
 * The browser's CloseWatcher API, which TypeScript's DOM lib doesn't declare
 * yet. A watcher receives "close requests": the Android back gesture/button
 * and the Escape key. It never touches session history, which matters here:
 * every gear edit pushes a history entry (QueryParamsService), so back
 * already means "undo the last edit", and the usual push-a-dummy-entry
 * trick for closing an overlay on back would tangle with that.
 */
interface CloseWatcherLike extends EventTarget {
  destroy(): void;
}
type CloseWatcherConstructor = new () => CloseWatcherLike;

/** Returned by {@link CloseRequestService.listen}; call it when the overlay closes by any other route. */
export type CloseRequestRelease = () => void;

interface Entry {
  onClose: () => boolean | void;
  watcher: CloseWatcherLike | null;
  released: boolean;
}

/**
 * Lets an open overlay (drawer, dialog, panel) close on the back gesture and
 * on Escape, through one code path.
 *
 * - Where `CloseWatcher` exists (Chromium, including Android Chrome/Edge/
 *   Samsung Internet), each overlay gets a watcher. The browser routes
 *   back and Escape to the most recently opened one, so stacked overlays
 *   close one at a time.
 * - Elsewhere only Escape is available: a single document listener hands it
 *   to the most recently opened overlay, mirroring the watcher's stacking.
 *   Back keeps its normal meaning there.
 *
 * `onClose` may return `false` to refuse (e.g. a dialog mid-save); the
 * overlay then stays registered for the next request. A watcher is spent
 * once it fires, so a refusal arms a fresh one.
 */
@Injectable({ providedIn: 'root' })
export class CloseRequestService implements OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly zone = inject(NgZone);
  private readonly stack: Entry[] = [];
  private keydownAttached = false;

  private readonly onKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) {
      return;
    }
    const top = this.stack[this.stack.length - 1];
    // An overlay with a live watcher gets this Escape from the browser.
    if (top && !top.watcher) {
      this.zone.run(() => this.fire(top));
    }
  };

  private get CloseWatcher(): CloseWatcherConstructor | undefined {
    const view = this.document.defaultView as (Window & { CloseWatcher?: CloseWatcherConstructor }) | null;
    return view?.CloseWatcher;
  }

  /**
   * Registers an overlay that has just opened. Call the returned function
   * when it closes some other way (its close button, backdrop, navigation,
   * component destroy); it is safe to call more than once.
   */
  listen(onClose: () => boolean | void): CloseRequestRelease {
    const entry: Entry = { onClose, watcher: null, released: false };
    this.stack.push(entry);
    if (this.CloseWatcher) {
      this.arm(entry);
    } else {
      this.attachKeydown();
    }
    return () => this.release(entry);
  }

  ngOnDestroy() {
    for (const entry of [...this.stack]) {
      this.release(entry);
    }
    this.detachKeydown();
  }

  private arm(entry: Entry) {
    const Ctor = this.CloseWatcher;
    if (!Ctor) {
      return;
    }
    try {
      const watcher = new Ctor();
      watcher.addEventListener('close', () => {
        entry.watcher = null;
        this.zone.run(() => this.fire(entry));
      });
      entry.watcher = watcher;
    } catch {
      // Throws only when the document isn't fully active; fall back to Escape.
      this.attachKeydown();
    }
  }

  private fire(entry: Entry) {
    if (entry.released) {
      return;
    }
    const refused = entry.onClose() === false;
    if (refused) {
      if (!entry.released && !entry.watcher && this.CloseWatcher) {
        this.arm(entry);
      }
      return;
    }
    this.release(entry);
  }

  private release(entry: Entry) {
    if (entry.released) {
      return;
    }
    entry.released = true;
    entry.watcher?.destroy();
    entry.watcher = null;
    const index = this.stack.indexOf(entry);
    if (index >= 0) {
      this.stack.splice(index, 1);
    }
    if (this.stack.length === 0) {
      this.detachKeydown();
    }
  }

  private attachKeydown() {
    if (!this.keydownAttached) {
      this.document.addEventListener('keydown', this.onKeydown);
      this.keydownAttached = true;
    }
  }

  private detachKeydown() {
    if (this.keydownAttached) {
      this.document.removeEventListener('keydown', this.onKeydown);
      this.keydownAttached = false;
    }
  }
}
