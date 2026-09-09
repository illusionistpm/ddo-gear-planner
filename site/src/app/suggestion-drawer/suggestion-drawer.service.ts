import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type SuggestionDrawerState =
  | { kind: 'slot'; slot: string }
  | { kind: 'bonusType'; affixName: string; bonusType: string; sortOwnedToTop: boolean }
  | { kind: 'set'; setName: string };

@Injectable({
  providedIn: 'root'
})
export class SuggestionDrawerService {
  private drawerState = new BehaviorSubject<SuggestionDrawerState | null>(null);
  // Views navigated away from while the drawer stayed open, so drilling from the
  // bonus-type list into a set (and similar) offers a way back.
  private history: SuggestionDrawerState[] = [];

  readonly state$ = this.drawerState.asObservable();

  get currentState(): SuggestionDrawerState | null {
    return this.drawerState.value;
  }

  get canGoBack(): boolean {
    return this.history.length > 0;
  }

  private navigateTo(next: SuggestionDrawerState) {
    const current = this.drawerState.value;
    if (current) {
      this.history.push(current);
    }
    this.drawerState.next(next);
  }

  openSlot(slot: string) {
    this.navigateTo({ kind: 'slot', slot });
  }

  openBonusType(affixName: string, bonusType: string, sortOwnedToTop: boolean) {
    this.navigateTo({ kind: 'bonusType', affixName, bonusType, sortOwnedToTop });
  }

  openSet(setName: string) {
    this.navigateTo({ kind: 'set', setName });
  }

  back() {
    const previous = this.history.pop() ?? null;
    this.drawerState.next(previous);
  }

  close() {
    this.history = [];
    this.drawerState.next(null);
  }
}
