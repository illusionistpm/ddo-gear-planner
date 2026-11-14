import { Location } from '@angular/common';
import { Directive, inject, OnDestroy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { distinctUntilChanged, filter } from 'rxjs/operators';

import { urlFragmentOf, urlWithoutFragment } from '../build/build-route';
import { QueryParamsService } from '../build/query-params.service';

/**
 * A view of the planner that the URL's fragment says is open: the shopping
 * list, the crafting slots. The fragment is the state, so a reload comes back
 * to the view and the app's own URL writes (edits, saves, signing in) keep it.
 * Only one fragment fits in a URL, so at most one such view is open.
 *
 * Opening a view is a step in the browser's history, so Back (the browser's,
 * or Android's) closes it, as the view's own close does. Opened from the URL
 * there's no step to go back to, so closing just takes the fragment off.
 *
 * `EntryPoint` names what opened the view, for analytics; 'url' is a URL that
 * already said so (a reload, say, or Forward).
 */
@Directive()
export abstract class FragmentViewService<EntryPoint extends string> implements OnDestroy {
  protected readonly router = inject(Router);
  private readonly queryParams = inject(QueryParamsService);
  private readonly location = inject(Location);
  private readonly openSubject = new BehaviorSubject<boolean>(false);
  readonly isOpen$: Observable<boolean> = this.openSubject.pipe(distinctUntilChanged());
  /** What opened the view last, for analytics. */
  openedFrom: EntryPoint | 'url' | null = null;
  private readonly subscription: Subscription;
  /**
   * The URL open() added to history, while it's still the current one. Saving
   * with the view open replaces it with the saved build's, so Back would then
   * leave the build rather than close the view.
   */
  private pushedUrl: string | null = null;

  protected constructor(
    private readonly fragment: string,
    private readonly isFragment: (fragment: string | null | undefined) => boolean
  ) {
    this.followUrl();
    this.subscription = this.router.events.pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => this.followUrl());
  }

  get isOpen(): boolean {
    return this.openSubject.value;
  }

  open(from: EntryPoint): void {
    this.openedFrom = from;
    this.openSubject.next(true);
    if (this.queryParams.writeViewFragment(this.fragment, false)) {
      this.pushedUrl = `${urlWithoutFragment(this.router.url)}#${this.fragment}`;
    }
  }

  close(): void {
    this.openSubject.next(false);
    const pushed = this.pushedUrl !== null && this.pushedUrl === this.router.url;
    this.pushedUrl = null;
    if (pushed) {
      this.location.back();
    } else {
      this.queryParams.writeViewFragment(null, true);
    }
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  private followUrl(): void {
    const open = this.isFragment(urlFragmentOf(this.router.url));
    if (open && !this.isOpen) {
      this.openedFrom = 'url';
    }
    this.openSubject.next(open);
  }
}
