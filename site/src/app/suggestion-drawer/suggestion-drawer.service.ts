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

  readonly state$ = this.drawerState.asObservable();

  get currentState(): SuggestionDrawerState | null {
    return this.drawerState.value;
  }

  openSlot(slot: string) {
    this.drawerState.next({ kind: 'slot', slot });
  }

  openBonusType(affixName: string, bonusType: string, sortOwnedToTop: boolean) {
    this.drawerState.next({ kind: 'bonusType', affixName, bonusType, sortOwnedToTop });
  }

  openSet(setName: string) {
    this.drawerState.next({ kind: 'set', setName });
  }

  close() {
    this.drawerState.next(null);
  }
}
