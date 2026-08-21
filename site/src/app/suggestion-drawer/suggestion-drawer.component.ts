import { Component, ChangeDetectionStrategy, HostListener } from '@angular/core';

import { SuggestionDrawerService } from './suggestion-drawer.service';

@Component({
  selector: 'app-suggestion-drawer',
  templateUrl: './suggestion-drawer.component.html',
  styleUrls: ['./suggestion-drawer.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class SuggestionDrawerComponent {
  constructor(public drawer: SuggestionDrawerService) { }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.close();
  }

  close() {
    this.drawer.close();
  }
}
