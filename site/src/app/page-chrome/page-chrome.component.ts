import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

import { ThemeService } from '../shared/theme.service';

/** Where a page's way back to the planner goes: a link, or (no url) a button the page handles. */
export interface PageChromeBack {
  label: string;
  title: string;
  /** A route to follow; without one, `back` emits. */
  url?: string;
  /** Opens the link in a new tab, as a friend's build does. */
  newTab?: boolean;
}

/**
 * The header of a page that takes the planner's place, such as a shopping
 * list: the site's name, the way back to the planner, the page's own actions
 * (projected), and the planner's Ko-fi, day/night and info buttons.
 */
@Component({
  selector: 'app-page-chrome',
  templateUrl: './page-chrome.component.html',
  styleUrls: ['./page-chrome.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class PageChromeComponent {
  @Input() backTo: PageChromeBack | null = null;
  @Output() back = new EventEmitter<void>();

  constructor(readonly theme: ThemeService) { }
}
