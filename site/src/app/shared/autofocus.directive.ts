import { AfterViewInit, Directive, ElementRef, Input } from '@angular/core';

/**
 * Moves keyboard focus to the element when it is created - for UI that opens
 * expecting the user to type into it straight away. The native `autofocus`
 * attribute is unreliable on elements added after page load, so this focuses
 * explicitly.
 *
 * Bind a falsy value (`[appAutofocus]="false"`) to opt out, e.g. when the
 * same component is embedded somewhere that shouldn't steal focus.
 */
@Directive({
  selector: '[appAutofocus]',
  standalone: false
})
export class AutofocusDirective implements AfterViewInit {
  @Input() appAutofocus: boolean | '' = true;

  constructor(private ref: ElementRef<HTMLElement>) { }

  ngAfterViewInit() {
    // An attribute with no value binds as '', which means "on".
    if (this.appAutofocus !== false) {
      this.ref.nativeElement.focus();
    }
  }
}
