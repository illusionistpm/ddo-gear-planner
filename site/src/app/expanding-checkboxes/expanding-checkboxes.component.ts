import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-expanding-checkboxes',
  templateUrl: './expanding-checkboxes.component.html',
  styleUrls: ['./expanding-checkboxes.component.css']
})
export class ExpandingCheckboxesComponent implements OnInit {
  @Input() title: string;
  @Input() list: Array<string>;
  @Input() invert: boolean;

  @Output() newSetEvent = new EventEmitter<Set<string>>();

  checkedItems = new Set<string>();

  constructor() { }

  ngOnInit(): void {
  }

  isTopLevelIndeterminate(): boolean {
    return this.checkedItems.size != this.list.length && this.checkedItems.size != 0;
  }
  
  isTopLevelChecked(): boolean {
    let b = this.checkedItems.size == this.list.length;
    return this.invert ? !b : b;
  }
  
  toggleTopLevel(): void {
    let clearAll = this.isTopLevelChecked();
    if (this.invert) { clearAll = !clearAll; }

    if (clearAll) {
      // Clear all
      this.checkedItems.clear();
    } else {
      // Enable all
      this.list.forEach(item => this.checkedItems.add(item));
    }

    this._notifyListeners();
  }

  isChecked(elem): boolean {
    let b = this.checkedItems.has(elem);
    return this.invert ? !b : b;
  }

  toggle(event, elem): void {
    let b = event;
    if (this.invert) { b = !b }

    b ? this.checkedItems.add(elem) : this.checkedItems.delete(elem)

    this._notifyListeners();
  }

  _notifyListeners(): void {
    this.newSetEvent.emit(this.checkedItems);
  }
}
