import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/** How long an Undo stays on offer. */
export const UNDO_OFFER_MS = 10_000;

/** The last edit that can be taken back: what it did, in words, and how to reverse it. */
export interface UndoOffer {
  message: string;
  undo: () => void;
}

/**
 * One Undo at a time, on offer for a few seconds after an edit that removes
 * something from the plan (see UndoStripComponent, which shows it). A new
 * offer replaces the last; whoever makes an offer withdraws it with the
 * function `offer` returns once its undo would no longer be right.
 */
@Injectable({
  providedIn: 'root'
})
export class UndoService implements OnDestroy {
  private current = new BehaviorSubject<UndoOffer | null>(null);
  private timer?: ReturnType<typeof setTimeout>;

  get offer$(): Observable<UndoOffer | null> {
    return this.current.asObservable();
  }

  /** Puts an Undo on offer. Returns a function that withdraws this offer, and only this one. */
  offer(offer: UndoOffer): () => void {
    clearTimeout(this.timer);
    this.current.next(offer);
    this.timer = setTimeout(() => this.withdraw(offer), UNDO_OFFER_MS);
    return () => this.withdraw(offer);
  }

  /** Takes the offer up: it goes away first, so its undo can make an offer of its own. */
  undo(): void {
    const offer = this.current.value;
    if (!offer) {
      return;
    }
    this.dismiss();
    offer.undo();
  }

  dismiss(): void {
    clearTimeout(this.timer);
    if (this.current.value) {
      this.current.next(null);
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  private withdraw(offer: UndoOffer): void {
    if (this.current.value === offer) {
      this.dismiss();
    }
  }
}
