import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/** The buttons that open the list. */
export type ShoppingListEntryPoint = 'toolbar' | 'menu';

/**
 * Whether the shopping list has taken the planner's place on screen. Kept in
 * memory only: a reload comes back to the planner.
 */
@Injectable({ providedIn: 'root' })
export class ShoppingListViewService {
  private readonly openSubject = new BehaviorSubject(false);
  readonly isOpen$: Observable<boolean> = this.openSubject.asObservable();
  /** Which button opened the list last, for analytics. */
  openedFrom: ShoppingListEntryPoint | null = null;

  get isOpen(): boolean {
    return this.openSubject.value;
  }

  open(from: ShoppingListEntryPoint): void {
    this.openedFrom = from;
    this.openSubject.next(true);
  }

  close(): void {
    this.openSubject.next(false);
  }
}
