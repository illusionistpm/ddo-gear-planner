import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, Type } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';

import { ListReturnService } from '../build/list-return.service';
import { PageChromeBack } from '../page-chrome/page-chrome.component';

/**
 * Two saved builds side by side, at /compare(/:a(/:b)): each tracked affix's
 * total in both and the change, and what changed in the gear. A page of its
 * own, which reads the builds itself and never loads either into the planner.
 *
 * Only the header is here; the page itself (BuildCompareComponent) and what
 * it computes with load when it's first visited, keeping them out of every
 * other page's initial load.
 */
@Component({
  selector: 'app-compare-page',
  templateUrl: './compare-page.component.html',
  styleUrls: ['./compare-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class ComparePageComponent implements OnInit, OnDestroy {
  readonly plannerLink: PageChromeBack;
  body: Type<unknown> | null = null;
  inputs: { a: string | null; b: string | null } = { a: null, b: null };
  loadFailed = false;

  private subscription?: Subscription;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly cdr: ChangeDetectorRef,
    listReturn: ListReturnService
  ) {
    this.plannerLink = { label: 'Planner', title: 'Back to the planner', url: listReturn.url };
  }

  ngOnInit(): void {
    this.subscription = this.route.paramMap.subscribe(params => {
      this.inputs = { a: params.get('a'), b: params.get('b') };
      this.cdr.markForCheck();
    });
    this.loadBody();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  async loadBody(): Promise<void> {
    this.loadFailed = false;
    try {
      const { BuildCompareComponent } = await import('./build-compare.component');
      this.body = BuildCompareComponent;
    } catch {
      // A deploy since this page loaded can leave its chunk gone.
      this.loadFailed = true;
    }
    this.cdr.markForCheck();
  }
}
