import { Component, OnInit, Input } from '@angular/core';
import { Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators';

@Component({
    selector: 'app-typeahead',
    templateUrl: './typeahead.component.html',
    styleUrls: ['./typeahead.component.css'],
    standalone: false
})
export class TypeaheadComponent implements OnInit {
  @Input() source;
  @Input() item;
  @Input() onChange: (val: string) => any;
  @Input() placeholder: string;

  itemName: string;

  formatter = (x: { name: string }) => x.name;

  search = (text$: Observable<string>) =>
    text$.pipe(
      debounceTime(200),
      distinctUntilChanged(),
      map(term => {
        return this.source.filter(v => v.name.toLowerCase().indexOf(term.toLowerCase()) > -1 || v.synonyms.some(x => x.toLowerCase().indexOf(term.toLowerCase()) > -1))
        // If the entry has any synonyms, search on them as well. If they match, we want to show an entry like "Canonical Text (Synonym)".
        // If we matched on a synonym, we also add another field to the response, 'original', which is the canonical name.
        .map(v => v.name.toLowerCase().indexOf(term.toLowerCase()) > -1 ? v : {name: `${v.name} (${v.synonyms.find(x => x.toLowerCase().indexOf(term.toLowerCase()) > -1)})`, original: v.name })
        .sort(this._sortResults(term)).slice(0, 6)
      })
      );

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
