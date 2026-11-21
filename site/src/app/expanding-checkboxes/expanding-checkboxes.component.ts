import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

let nextId = 0;

/**
 * A titled group of checkboxes: one tick for the whole group, and a row that
 * opens in place to tick them one by one (it used to be a popover off a link).
 * With `invert`, a ticked box is an entry whose `value` is false - the item
 * type filter keeps hidden types, and shows the boxes as the types shown.
 */
@Component({
    selector: 'app-expanding-checkboxes',
    templateUrl: './expanding-checkboxes.component.html',
    styleUrls: ['./expanding-checkboxes.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ExpandingCheckboxesComponent {
  readonly id = `type-group-${nextId++}`;
  open = false;

  @Input() title: string = '';
  @Input() list: Array<{name: string, value: boolean}> = [];
  @Input() invert: boolean = false;
  @Input() onChangeFn: (list: Array<{name: string, value: boolean}>, changeSource: string) => void = () => {};

  constructor() { }


  isTopLevelIndeterminate(): boolean {
    return this.list.some(e => e.value) && this.list.some(e => !e.value);
  }
  
  isTopLevelChecked(): boolean {
    const b = this.list.every(e => e.value);
    return this.invert ? !b : b;
  }
  
  toggleTopLevel(): void {
    let clearAll = this.isTopLevelChecked();
    if (this.invert) { clearAll = !clearAll; }

    this.list.forEach(e => e.value = !clearAll);

    this._notifyListeners('top_level');
  }

  isChecked(index: number): boolean {
    const b = this.list[index].value;
    return this.invert ? !b : b;
  }

  toggle(event: boolean, index: number): void {
    let b = event;
    if (this.invert) { b = !b }

    this.list[index].value = b;

    this._notifyListeners('subgroup');
  }

  /** How many entries show as ticked. */
  shownCount(): number {
    return this.list.filter((_, index) => this.isChecked(index)).length;
  }

  /** Ticks every entry, or none. */
  setAll(checked: boolean): void {
    this.list.forEach(e => e.value = this.invert ? !checked : checked);
    this._notifyListeners(checked ? 'all' : 'none');
  }

  _notifyListeners(changeSource: string): void {
    this.onChangeFn(this.list, changeSource);
  }
}
