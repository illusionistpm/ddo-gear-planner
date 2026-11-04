import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, combineLatest, Observable, of, Subscription } from 'rxjs';
import { distinctUntilChanged, filter, map, switchMap, take, tap } from 'rxjs/operators';

import { buildPath } from '../build/build-route';
import { BuildsService } from '../build/builds.service';
import { SHOPPING_LIST_FRAGMENT } from '../build/shopping-list-link';
import { FriendBuild, FriendShoppingList, FriendShoppingListService } from '../planner/shopping-list/friend-shopping-list.service';
import { AnalyticsService } from '../shared/analytics.service';
import { AuthService } from '../shared/auth.service';
import { ThemeService } from '../shared/theme.service';
import { FriendBuildHeading } from '../shopping-list/shopping-list.component';

const SITE_TITLE = 'DDO Gear Planner';

/**
 * A friend's view of what a saved build still needs, at
 * /still-needed/:shortId(/:slug): a page of its own, for helping someone
 * farm their gear. It reads the build itself and never loads it into the
 * planner, which is reached only by asking for it: Open in planner opens
 * it in a new tab, leaving this one as it was.
 *
 * The build's owner, signed in, gets their own list on the planner instead,
 * where they can tick things off.
 */
@Component({
  selector: 'app-still-needed-page',
  templateUrl: './still-needed-page.component.html',
  styleUrls: ['./still-needed-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class StillNeededPageComponent implements OnInit, OnDestroy {
  build: FriendBuild = { status: 'loading' };
  list: FriendShoppingList | null = null;
  heading: FriendBuildHeading | null = null;

  private readonly retrySubject = new BehaviorSubject<void>(undefined);
  private subscription?: Subscription;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly friendList: FriendShoppingListService,
    private readonly builds: BuildsService,
    private readonly auth: AuthService,
    private readonly analytics: AnalyticsService,
    private readonly title: Title,
    readonly theme: ThemeService,
    private readonly cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    const shortId$ = this.route.paramMap.pipe(map(params => params.get('shortId') ?? ''), distinctUntilChanged());
    this.subscription = combineLatest([shortId$, this.retrySubject]).pipe(
      switchMap(([shortId]) => this.load(shortId))
    ).subscribe(list => {
      this.list = list;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  /** Bound to the error panel's "Try again". */
  retry(): void {
    this.retrySubject.next();
  }

  private load(shortId: string): Observable<FriendShoppingList | null> {
    return this.friendList.build(shortId).pipe(
      tap(build => this.showBuild(shortId, build)),
      switchMap(build => {
        if (build.status !== 'ready') {
          return of(null);
        }
        this.openYourOwnInstead(shortId, build.name);
        return this.friendList.list(shortId, build.entries);
      })
    );
  }

  private showBuild(shortId: string, build: FriendBuild): void {
    this.build = build;
    this.heading = build.status === 'ready' ? { name: build.name, plannerPath: buildPath(shortId, build.name) } : null;
    this.title.setTitle(build.status === 'ready' && build.name ? `Still needed for ${build.name} - ${SITE_TITLE}` : SITE_TITLE);
    if (build.status === 'error') {
      this.analytics.track('still_needed_load_error', { error: build.error });
    }
    this.cdr.markForCheck();
  }

  /** A build of yours: your own list, which you can tick off, says more. */
  private openYourOwnInstead(shortId: string, name: string): void {
    this.auth.isAuthenticated$.pipe(
      take(1),
      filter(Boolean),
      switchMap(() => this.builds.listMine())
    ).subscribe({
      next: mine => {
        if (mine.some(build => build.shortId === shortId)) {
          this.router.navigateByUrl(`${buildPath(shortId, name)}#${SHOPPING_LIST_FRAGMENT}`, { replaceUrl: true });
        }
      },
      // Best effort: the friend's view is still right, just less useful to its owner.
      error: () => undefined
    });
  }
}
