import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable, of, Subscription } from 'rxjs';
import { catchError, distinctUntilChanged, map } from 'rxjs/operators';

import { AuthService } from '../shared/auth.service';
import { CurrentBuildService } from './current-build.service';
import { GroupsService, GroupSummary } from './groups.service';

/**
 * Your shopping lists of several builds (GET /api/groups/mine), while
 * signed in: for the shopping list's Lists menu, the planner's Rejoin
 * button, and so Add builds goes back to a list the build is already on
 * rather than starting another.
 */
@Injectable({ providedIn: 'root' })
export class MyListsService implements OnDestroy {
  private readonly listsSubject = new BehaviorSubject<readonly GroupSummary[]>([]);
  private readonly subscription: Subscription;
  private signedIn = false;

  /** All your lists, most recently active first; empty while signed out or until they've loaded. */
  readonly lists$: Observable<readonly GroupSummary[]>;

  /** The list the build on screen is on, if it's a saved build of yours on one: the most recently active. */
  readonly rejoin$: Observable<GroupSummary | null>;

  constructor(auth: AuthService, private readonly groups: GroupsService, private readonly currentBuild: CurrentBuildService) {
    this.subscription = auth.isAuthenticated$.pipe(distinctUntilChanged()).subscribe(signedIn => {
      this.signedIn = signedIn;
      if (signedIn) {
        this.refresh();
      } else {
        this.listsSubject.next([]);
      }
    });
    this.lists$ = this.listsSubject.pipe(
      map(lists => [...lists].sort((a, b) => a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    );
    this.rejoin$ = combineLatest([this.listsSubject, currentBuild.state$]).pipe(
      map(() => this.listFor(this.yourSavedBuildId())),
      distinctUntilChanged()
    );
  }

  /** Reads the lists again: one may have been joined, left or ended. */
  refresh(): void {
    if (!this.signedIn) {
      return;
    }
    this.groups.listMine().pipe(catchError(() => of(null))).subscribe(lists => {
      if (lists) {
        // A Worker from before yourBuildIds (the site and Worker deploy apart) leaves it out.
        this.listsSubject.next(lists.map(list => ({ ...list, yourBuildIds: list.yourBuildIds ?? [] })));
      }
    });
  }

  /** The most recently active list holding this build of yours; null for none. */
  listFor(buildId: string | null): GroupSummary | null {
    if (!buildId) {
      return null;
    }
    const holding = this.listsSubject.value.filter(list => list.yourBuildIds.includes(buildId));
    return holding.reduce<GroupSummary | null>((latest, list) => !latest || list.updatedAt > latest.updatedAt ? list : latest, null);
  }

  /** The build on screen, if it's a saved build of yours. */
  yourSavedBuildId(): string | null {
    const { savedBuildId, ownership } = this.currentBuild.value;
    return ownership === 'owned' ? savedBuildId : null;
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }
}
