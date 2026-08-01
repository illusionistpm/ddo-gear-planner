import { ChangeDetectionStrategy, Component } from '@angular/core';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-admin-link',
  template: `<a class="admin-link" [href]="adminUrl">Admin</a>`,
  styles: [`
    .admin-link {
      position: fixed;
      right: 0.75rem;
      top: 0.75rem;
      z-index: 1000;
      padding: 0.35rem 0.65rem;
      border-radius: 6px;
      background: #111827;
      color: #fff;
      font-size: 0.875rem;
      text-decoration: none;
      box-shadow: 0 4px 12px rgb(0 0 0 / 0.18);
    }
  `],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class AdminLinkComponent {
  adminUrl = environment.adminUrl;
}
