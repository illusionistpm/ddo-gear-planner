import { Component, OnInit, Input } from '@angular/core';
import { Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators';

@Component({
  selector: 'app-typeahead',
  templateUrl: './typeahead.component.html',
  styleUrls: ['./typeahead.component.css']
})
export class TypeaheadComponent implements OnInit {
  @Input() source;
  @Input() item;
  @Input() onChange: (val: string) => any;

  itemName: string;

  formatter = (x: { name: string }) => x.name;

  search = (text$: Observable<string>) =>
    text$.pipe(
      debounceTime(200),
      distinctUntilChanged(),
      map(term => this.source.filter(v => v.name.toLowerCase().indexOf(term.toLowerCase()) > -1).sort(this._sortResults(term)).slice(0, 6))
    )

  constructor() { }

  ngOnInit() {
    if (this.item) {
      this.item.subscribe(v => {
        if (v) {
          this.itemName = v.name;
        }
      });
    }
  }

  onSelectItemMine(e) {
    this.onChange(e.item);
    this.itemName = '';
  }

  _getSortIndex(term: string, str) {
    const split = str.name.split(' ');

    const matches = split.filter(v => v.toLowerCase().startsWith(term.toLowerCase()));
    let index = split.indexOf(matches[0]);
    if (index < 0) {
      index = 999;
    }
    return index;
  }

  _sortResults(term: string) {
    return (a, b) => {
      const aIndex = this._getSortIndex(term, a);
      const bIndex = this._getSortIndex(term, b);

      if (aIndex !== bIndex) {
        return aIndex - bIndex;
      } else {
        return a.name.toLowerCase() > b.name.toLowerCase();
      }
    };
  }

}
