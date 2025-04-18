import { Component } from '@angular/core';

@Component({
    selector: 'app-root',
    template: `
    <router-outlet></router-outlet>
  `,
    standalone: false
})
export class AppComponent {
  title = 'DDO Gear Planner';
}
