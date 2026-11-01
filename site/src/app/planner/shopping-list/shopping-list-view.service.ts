import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Whether the shopping list has taken the planner's place on screen. Kept in
 * memory only: a reload comes back to the planner.
 */
@Injectable({ providedIn: 'root' })
export class ShoppingListViewService {
  private readonly openSubject = new BehaviorSubject(false);
  readonly isOpen$: Observable<boolean> = this.openSubject.asObservable();

  get isOpen(): boolean {
    return this.openSubject.value;
  }

  open(): void {
    this.openSubject.next(true);
  }

  close(): void {
    this.openSubject.next(false);
  }
}
