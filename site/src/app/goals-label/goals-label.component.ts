import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * The name of a Build Goals control, as that control shows it right now - so
 * help text that names one matches its button on a phone as well as a desktop.
 *
 * - `editor-button`: the toolbar's "+ Build Goals", "+ Goals" below the
 *   side-by-side breakpoint (995px) - planner-toolbar.component.css.
 * - `view-tab`: the view switch's "Build Goals", "Goals" below 768px.
 *
 * Keep the breakpoints in step with the toolbar's CSS.
 */
@Component({
    selector: 'app-goals-label',
    template: `@if (for === 'editor-button') {<span class="fas fa-plus goals-label-icon" aria-hidden="true"></span> }<span class="goals-label-full">Build Goals</span><span class="goals-label-short">Goals</span>`,
    styles: [`
      :host { white-space: nowrap; }
      .goals-label-icon { font-size: 0.85em; }
      .goals-label-short { display: none; }
      @media (max-width: 994.98px) {
        :host(.editor-button) .goals-label-full { display: none; }
        :host(.editor-button) .goals-label-short { display: inline; }
      }
      @media (max-width: 767.98px) {
        :host(.view-tab) .goals-label-full { display: none; }
        :host(.view-tab) .goals-label-short { display: inline; }
      }
    `],
    host: { '[class]': 'for' },
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class GoalsLabelComponent {
  @Input() for: 'editor-button' | 'view-tab' = 'editor-button';
}
