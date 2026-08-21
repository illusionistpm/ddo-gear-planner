import { ChangeDetectionStrategy, Component, HostListener } from '@angular/core';
import { environment } from '../environments/environment';
import { PlannerOnboardingService } from './planner-onboarding.service';

@Component({
  selector: 'app-admin-link',
  template: `
    <div class="admin-menu" (click)="$event.stopPropagation()">
      <button
        class="admin-button"
        type="button"
        [attr.aria-expanded]="panelOpen"
        aria-haspopup="menu"
        (click)="togglePanel()"
      >
        Admin
      </button>

      <div *ngIf="panelOpen" class="admin-panel" role="menu">
        <label class="admin-toggle">
          <span>
            <strong>Performance logging</strong>
            <small>Console timing traces</small>
          </span>
          <input
            type="checkbox"
            [checked]="performanceLoggingEnabled"
            (change)="setPerformanceLogging($event)"
          >
        </label>

        <button type="button" class="admin-panel-action" role="menuitem" (click)="resetOnboarding()">
          <span>
            <strong>Reset onboarding</strong>
            <small>Show intro cues again</small>
          </span>
        </button>

        <a class="admin-panel-link" [href]="adminUrl" role="menuitem">Open admin page</a>
      </div>
    </div>
  `,
  styles: [`
    :host {
      align-self: stretch;
      display: inline-flex;
      flex: 0 0 auto;
      margin-left: 0.4rem;
      position: relative;
    }

    .admin-menu {
      align-self: stretch;
      display: inline-flex;
      font-size: 0.875rem;
      position: relative;
    }

    .admin-button {
      align-items: center;
      background: var(--surface-subtle-color);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      color: var(--text-secondary);
      cursor: pointer;
      display: inline-flex;
      font: inherit;
      font-weight: 700;
      justify-content: center;
      line-height: 1.2;
      min-height: 2rem;
      padding: 0.35rem 0.65rem;
    }

    .admin-button:hover,
    .admin-button:focus {
      color: var(--primary-color);
    }

    .admin-button:focus-visible {
      outline: 3px solid var(--focus-ring-color);
      outline-offset: 2px;
    }

    .admin-panel {
      position: absolute;
      right: 0;
      top: calc(100% + 0.4rem);
      width: 15rem;
      padding: 0.7rem;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--surface-elevated-color);
      color: var(--text-primary);
      box-shadow: var(--shadow-lg);
      z-index: 1200;
    }

    .admin-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin: 0 0 0.65rem;
      cursor: pointer;
    }

    .admin-toggle strong,
    .admin-toggle small {
      display: block;
    }

    .admin-toggle strong {
      font-size: 0.85rem;
      line-height: 1.2;
    }

    .admin-toggle small {
      margin-top: 0.15rem;
      color: var(--text-secondary);
      font-size: 0.75rem;
    }

    .admin-toggle input {
      width: 1rem;
      height: 1rem;
      flex: 0 0 auto;
      cursor: pointer;
    }

    .admin-panel-link {
      display: block;
      padding-top: 0.65rem;
      border-top: 1px solid var(--border-color);
      color: var(--link-color);
      text-decoration: none;
    }

    .admin-panel-action {
      align-items: flex-start;
      background: transparent;
      border: 0;
      border-top: 1px solid var(--border-color);
      color: var(--text-primary);
      cursor: pointer;
      display: flex;
      font: inherit;
      margin: 0;
      padding: 0.65rem 0 0;
      text-align: left;
      width: 100%;
    }

    .admin-panel-action strong,
    .admin-panel-action small {
      display: block;
    }

    .admin-panel-action strong {
      font-size: 0.85rem;
      line-height: 1.2;
    }

    .admin-panel-action small {
      color: var(--text-secondary);
      font-size: 0.75rem;
      margin-top: 0.15rem;
    }

    .admin-panel-action:hover strong,
    .admin-panel-action:focus strong {
      color: var(--primary-color);
    }

    .admin-panel-link:hover,
    .admin-panel-link:focus {
      color: var(--link-hover-color);
      text-decoration: underline;
    }

    @media (max-width: 767.98px) {
      :host {
        align-self: flex-end;
        margin-top: 0.4rem;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class AdminLinkComponent {
  adminUrl = environment.adminUrl;
  panelOpen = false;
  performanceLoggingEnabled = this.getPerformanceLogging();

  constructor(private onboarding: PlannerOnboardingService) {}

  @HostListener('document:click')
  closePanel() {
    this.panelOpen = false;
  }

  togglePanel() {
    this.panelOpen = !this.panelOpen;
  }

  setPerformanceLogging(event: Event) {
    const input = event.target as HTMLInputElement;
    this.performanceLoggingEnabled = input.checked;

    try {
      if (this.performanceLoggingEnabled) {
        localStorage.setItem('ddoPerf', '1');
      } else {
        localStorage.removeItem('ddoPerf');
      }
    } catch {
      this.performanceLoggingEnabled = false;
    }
  }

  resetOnboarding() {
    this.onboarding.resetIntro();
    this.panelOpen = false;
  }

  private getPerformanceLogging() {
    try {
      return localStorage.getItem('ddoPerf') === '1';
    } catch {
      return false;
    }
  }
}
