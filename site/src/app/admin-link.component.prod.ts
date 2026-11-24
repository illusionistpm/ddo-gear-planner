import { ChangeDetectionStrategy, Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-admin-link',
  template: '',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class AdminLinkComponent {
  @Output() acted = new EventEmitter<void>();
}
