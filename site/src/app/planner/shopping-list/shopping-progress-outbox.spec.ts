import {
  addToOutbox, dropOutbox, outboxRequestBody, readOutbox, settleOutbox, SHOPPING_OUTBOX_STORAGE_KEY
} from './shopping-progress-outbox';

describe('shopping progress outbox', () => {
  beforeEach(() => localStorage.removeItem(SHOPPING_OUTBOX_STORAGE_KEY));
  afterEach(() => localStorage.removeItem(SHOPPING_OUTBOX_STORAGE_KEY));

  it('merges queued changes key by key, the later winning', () => {
    addToOutbox('b1', { patch: { a: 1, b: 1 }, picksPatch: { Ring: ['Q1'] } });
    addToOutbox('b1', { patch: { b: null }, published: { needed: ['a'], route: {} } });
    addToOutbox('b2', { patch: { z: 0 } });

    expect(readOutbox('b1')).toEqual({
      patch: { a: 1, b: null }, picksPatch: { Ring: ['Q1'] }, published: { needed: ['a'], route: {} }
    });
    expect(readOutbox('b2')).toEqual({ patch: { z: 0 }, picksPatch: {} });
  });

  it('settles only what is still queued as it was sent', () => {
    addToOutbox('b1', { patch: { a: 1, b: 1 }, picksPatch: { Ring: ['Q1'] }, published: { needed: ['a'], route: {} } });
    const sent = readOutbox('b1')!;
    addToOutbox('b1', { patch: { b: 0 }, picksPatch: { Neck: ['Q2'] } });

    settleOutbox('b1', sent);

    expect(readOutbox('b1')).toEqual({ patch: { b: 0 }, picksPatch: { Neck: ['Q2'] } });
  });

  it('forgets a build once everything is settled, and clears storage when no build is left', () => {
    addToOutbox('b1', { patch: { a: 1 } });

    settleOutbox('b1', readOutbox('b1')!);

    expect(readOutbox('b1')).toBeNull();
    expect(localStorage.getItem(SHOPPING_OUTBOX_STORAGE_KEY)).toBeNull();
  });

  it('drops one build\'s queue', () => {
    addToOutbox('b1', { patch: { a: 1 } });
    addToOutbox('b2', { patch: { a: 1 } });

    dropOutbox('b1');

    expect(readOutbox('b1')).toBeNull();
    expect(readOutbox('b2')).not.toBeNull();
  });

  it('leaves empty parts out of the request body', () => {
    expect(outboxRequestBody({ patch: { a: 1 }, picksPatch: {} })).toEqual({ patch: { a: 1 } });
    expect(outboxRequestBody({ patch: {}, picksPatch: {}, published: { needed: [], route: {} } }))
      .toEqual({ needed: [], route: {} });
  });

  it('starts over from storage that isn\'t its own', () => {
    localStorage.setItem(SHOPPING_OUTBOX_STORAGE_KEY, '{"v":7}');

    expect(readOutbox('b1')).toBeNull();
    addToOutbox('b1', { patch: { a: 1 } });
    expect(readOutbox('b1')?.patch).toEqual({ a: 1 });
  });
});
