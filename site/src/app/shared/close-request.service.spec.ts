import { TestBed } from '@angular/core/testing';

import { CloseRequestService } from './close-request.service';

function pressEscape(): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event;
}

/** A stand-in for the browser's CloseWatcher: requestClose() is what back/Escape trigger. */
class FakeCloseWatcher extends EventTarget {
  static instances: FakeCloseWatcher[] = [];
  destroyed = false;

  constructor() {
    super();
    FakeCloseWatcher.instances.push(this);
  }

  static get live(): FakeCloseWatcher[] {
    return FakeCloseWatcher.instances.filter(w => !w.destroyed);
  }

  /** What the browser does on a close request: the newest live watcher closes. */
  static backGesture() {
    const top = FakeCloseWatcher.live.at(-1);
    if (top) {
      top.destroyed = true;
      top.dispatchEvent(new Event('close'));
    }
  }

  destroy() {
    this.destroyed = true;
  }
}

describe('CloseRequestService', () => {
  let service: CloseRequestService;

  afterEach(() => {
    delete (window as { CloseWatcher?: unknown }).CloseWatcher;
    FakeCloseWatcher.instances = [];
  });

  describe('without CloseWatcher (Escape only)', () => {
    beforeEach(() => {
      service = TestBed.inject(CloseRequestService);
    });

    it('calls the most recently opened overlay on Escape, one per press', () => {
      const closed: string[] = [];
      service.listen(() => { closed.push('first'); });
      service.listen(() => { closed.push('second'); });

      pressEscape();
      expect(closed).toEqual(['second']);
      pressEscape();
      expect(closed).toEqual(['second', 'first']);
      pressEscape();
      expect(closed).toEqual(['second', 'first']);
    });

    it('ignores other keys and Escape that something else already handled', () => {
      const onClose = vi.fn();
      service.listen(onClose);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      const handled = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
      handled.preventDefault();
      document.dispatchEvent(handled);

      expect(onClose).not.toHaveBeenCalled();
    });

    it('stops listening once released', () => {
      const onClose = vi.fn();
      const release = service.listen(onClose);
      release();
      release();

      pressEscape();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('stays registered when onClose refuses', () => {
      let allow = false;
      const onClose = vi.fn(() => allow);
      service.listen(onClose);

      pressEscape();
      allow = true;
      pressEscape();
      pressEscape();

      expect(onClose).toHaveBeenCalledTimes(2);
    });
  });

  describe('with CloseWatcher', () => {
    beforeEach(() => {
      (window as { CloseWatcher?: unknown }).CloseWatcher = FakeCloseWatcher;
      service = TestBed.inject(CloseRequestService);
    });

    it('gives each overlay its own watcher, closed newest first', () => {
      const closed: string[] = [];
      service.listen(() => { closed.push('first'); });
      service.listen(() => { closed.push('second'); });
      expect(FakeCloseWatcher.live.length).toBe(2);

      FakeCloseWatcher.backGesture();
      expect(closed).toEqual(['second']);
      FakeCloseWatcher.backGesture();
      expect(closed).toEqual(['second', 'first']);
    });

    it('leaves Escape to the browser rather than handling it twice', () => {
      const onClose = vi.fn();
      service.listen(onClose);

      pressEscape();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('destroys the watcher when the overlay closes some other way', () => {
      const release = service.listen(() => undefined);
      release();
      expect(FakeCloseWatcher.live.length).toBe(0);
    });

    it('arms a fresh watcher when onClose refuses', () => {
      let allow = false;
      const onClose = vi.fn(() => allow);
      service.listen(onClose);

      FakeCloseWatcher.backGesture();
      expect(FakeCloseWatcher.live.length).toBe(1);

      allow = true;
      FakeCloseWatcher.backGesture();
      expect(onClose).toHaveBeenCalledTimes(2);
      expect(FakeCloseWatcher.live.length).toBe(0);
    });
  });
});
