import { TestBed } from '@angular/core/testing';

import { UNDO_OFFER_MS, UndoOffer, UndoService } from './undo.service';

describe('UndoService', () => {
  let service: UndoService;
  let current: UndoOffer | null;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    service = TestBed.inject(UndoService);
    service.offer$.subscribe(offer => current = offer);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs the offer\'s undo once, and takes the offer away first', () => {
    let offerDuringUndo: UndoOffer | null | undefined;
    const undo = vi.fn(() => { offerDuringUndo = current; });
    service.offer({ message: 'Cleared Helm', undo });

    service.undo();
    service.undo();

    expect(undo).toHaveBeenCalledTimes(1);
    expect(offerDuringUndo).toBeNull();
    expect(current).toBeNull();
  });

  it('stops offering after a few seconds', () => {
    service.offer({ message: 'Cleared Helm', undo: vi.fn() });

    vi.advanceTimersByTime(UNDO_OFFER_MS - 1);
    expect(current?.message).toBe('Cleared Helm');
    vi.advanceTimersByTime(1);
    expect(current).toBeNull();
  });

  it('replaces the last offer with a new one, which gets its own full time', () => {
    service.offer({ message: 'first', undo: vi.fn() });
    vi.advanceTimersByTime(UNDO_OFFER_MS - 1);
    service.offer({ message: 'second', undo: vi.fn() });

    vi.advanceTimersByTime(UNDO_OFFER_MS - 1);
    expect(current?.message).toBe('second');
  });

  it('lets whoever made an offer withdraw it, but not a later one', () => {
    const withdrawFirst = service.offer({ message: 'first', undo: vi.fn() });
    service.offer({ message: 'second', undo: vi.fn() });

    withdrawFirst();
    expect(current?.message).toBe('second');
  });
});
