import { Component, OnInit, Input } from '@angular/core';

@Component({
    selector: 'app-expanding-checkboxes',
    templateUrl: './expanding-checkboxes.component.html',
    styleUrls: ['./expanding-checkboxes.component.css'],
    standalone: false
})
export class ExpandingCheckboxesComponent implements OnInit {
  @Input() title: string;
  @Input() list: Array<{name: string, value: boolean}>;
  @Input() invert: boolean;
  @Input() onChangeFn: (list: Array<{name: string, value: boolean}>) => void;

  constructor() { }

  ngOnInit(): void {
  }

  isTopLevelIndeterminate(): boolean {
    return this.list.some(e => e.value) && this.list.some(e => !e.value);
  }
  
  isTopLevelChecked(): boolean {
    let b = this.list.every(e => e.value);
    return this.invert ? !b : b;
  }
  
  toggleTopLevel(): void {
    let clearAll = this.isTopLevelChecked();
    if (this.invert) { clearAll = !clearAll; }

    this.list.forEach(e => e.value = !clearAll);

    this._notifyListeners();
  }

  isChecked(index: number): boolean {
    let b = this.list[index].value;
    return this.invert ? !b : b;
  }

  toggle(event: boolean, index: number): void {
    let b = event;
    if (this.invert) { b = !b }

    this.list[index].value = b;

    this._notifyListeners();
  }

  _notifyListeners(): void {
    this.onChangeFn(this.list);
  }
}
