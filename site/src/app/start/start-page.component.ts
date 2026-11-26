import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, Type } from '@angular/core';

/**
 * Where a visit to the bare site starts (/start): your builds, or a guided
 * new one. Only the header is here; the page itself (StartFlowComponent)
 * loads when it's first visited, keeping it out of the planner's initial load.
 */
@Component({
  selector: 'app-start-page',
  templateUrl: './start-page.component.html',
  styleUrls: ['./start-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class StartPageComponent implements OnInit {
  body: Type<unknown> | null = null;
  loadFailed = false;

  constructor(private readonly cdr: ChangeDetectorRef) { }

  ngOnInit(): void {
    this.loadBody();
  }

  async loadBody(): Promise<void> {
    this.loadFailed = false;
    try {
      const { StartFlowComponent } = await import('./start-flow.component');
      this.body = StartFlowComponent;
    } catch {
      // A deploy since this page loaded can leave its chunk gone.
      this.loadFailed = true;
    }
    this.cdr.markForCheck();
  }
}
