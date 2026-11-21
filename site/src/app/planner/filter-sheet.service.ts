import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/**
 * Asks the planner to open its Filters sheet, from somewhere that found the
 * filters in the way - the slot picker, when they hide what was searched for.
 * MainComponent owns the sheet and listens.
 */
@Injectable({
  providedIn: 'root'
})
export class FilterSheetService {
  private readonly openRequests = new Subject<void>();

  get openRequests$(): Observable<void> {
    return this.openRequests.asObservable();
  }

  open(): void {
    this.openRequests.next();
  }
}
