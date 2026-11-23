import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The name of the view switch's Build Goals tab, as it shows right now -
 * "Build Goals", "Goals" below 768px - so help text that names it matches
 * the tab on a phone as well as a desktop.
 *
 * Keep the breakpoint in step with planner-toolbar.component.css.
 */
@Component({
    selector: 'app-goals-label',
    template: `<span class="goals-label-full">Build Goals</span><span class="goals-label-short">Goals</span>`,
    styles: [`
      :host { white-space: nowrap; }
      .goals-label-short { display: none; }
      @media (max-width: 767.98px) {
        .goals-label-full { display: none; }
        .goals-label-short { display: inline; }
      }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class GoalsLabelComponent { }
