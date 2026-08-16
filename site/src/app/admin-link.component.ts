import { ChangeDetectionStrategy, Component, HostListener } from '@angular/core';
import { environment } from '../environments/environment';

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

        <a class="admin-panel-link" [href]="adminUrl" role="menuitem">Open admin page</a>
      </div>
    </div>
  `,
  styles: [`
    .admin-menu {
      position: fixed;
      right: 0.75rem;
      top: 0.75rem;
      z-index: 1000;
      font-size: 0.875rem;
    }

    .admin-button {
      padding: 0.35rem 0.65rem;
      border: 0;
      border-radius: 6px;
      background: #111827;
      color: #fff;
      cursor: pointer;
      font: inherit;
      line-height: 1.2;
      box-shadow: 0 4px 12px rgb(0 0 0 / 0.18);
    }

    .admin-button:hover,
    .admin-button:focus {
      background: #1f2937;
    }

    .admin-panel {
      position: absolute;
      right: 0;
      top: calc(100% + 0.4rem);
      width: 15rem;
      padding: 0.7rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      background: #fff;
      color: #111827;
      box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
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
      color: #6b7280;
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
      border-top: 1px solid #e5e7eb;
      color: #2563eb;
      text-decoration: none;
    }

    .admin-panel-link:hover,
    .admin-panel-link:focus {
      text-decoration: underline;
    }
  `],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class AdminLinkComponent {
  adminUrl = environment.adminUrl;
  panelOpen = false;
  performanceLoggingEnabled = this.getPerformanceLogging();

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

  private getPerformanceLogging() {
    try {
      return localStorage.getItem('ddoPerf') === '1';
    } catch {
      return false;
    }
  }
}
