import { Component, Input, ViewChild, ElementRef, ChangeDetectionStrategy } from '@angular/core';
import { NgbTypeaheadSelectItemEvent } from '@ng-bootstrap/ng-bootstrap';
import { Observable, debounceTime, distinctUntilChanged, map } from 'rxjs';
import { AnalyticsService } from '../shared/analytics.service';

export interface TypeaheadEntry {
  name: string;
  synonyms?: string[];
}

/**
 * A search hit: the matching entry itself, or - when the term matched one of
 * its synonyms - a "Canonical Name (Synonym)" label with the canonical name
 * in `original`.
 */
export type TypeaheadResult = TypeaheadEntry | { name: string; original: string };

@Component({
    selector: 'app-typeahead',
    templateUrl: './typeahead.component.html',
    styleUrls: ['./typeahead.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class TypeaheadComponent {
  @Input() source: TypeaheadEntry[] = [];
  @Input() onChange!: (result: TypeaheadResult) => void;
  @Input() placeholder!: string;
  @Input() resultFormatter!: (result: TypeaheadResult) => string;
  @Input() inputClass!: string;
  @Input() searchType!: string;

  @ViewChild('inputElement', { static: true }) inputElement!: ElementRef;

  itemName!: string;

  formatter = (x: { name: string }) => x.name;

  search = (text$: Observable<string>) =>
    text$.pipe(
      debounceTime(200),
      distinctUntilChanged(),
      map((term): TypeaheadResult[] => {
        const matches = (value: string) => value.toLowerCase().indexOf(term.toLowerCase()) > -1;
        return this.source.filter(v => matches(v.name) || (v.synonyms && v.synonyms.some(matches)))
        // If the entry has any synonyms, search on them as well. If they match, we want to show an entry like "Canonical Text (Synonym)".
        // If we matched on a synonym, we also add another field to the response, 'original', which is the canonical name.
        .map((v): TypeaheadResult => matches(v.name) ? v : { name: `${v.name} (${v.synonyms!.find(matches)})`, original: v.name })
        .sort(this._sortResults(term)).slice(0, 6);
      })
      );

  constructor(private analytics: AnalyticsService) { }

  onSelectItemMine(e: NgbTypeaheadSelectItemEvent<TypeaheadResult>) {
    if (this.searchType) {
      this.analytics.track('search', {
        search_type: this.searchType,
        result_selected: true
      });
    }
    this.onChange(e.item);
    setTimeout(() => {
      this.itemName = '';
      if (this.inputElement) {
        this.inputElement.nativeElement.value = '';
      }
    }, 0);
  }

  _getSortIndex(term: string, result: TypeaheadResult) {
    const split = result.name.split(' ');

    const matches = split.filter(v => v.toLowerCase().startsWith(term.toLowerCase()));
    let index = split.indexOf(matches[0]);
    if (index < 0) {
      index = 999;
    }
    return index;
  }

  _sortResults(term: string) {
    return (a: TypeaheadResult, b: TypeaheadResult) => {
      const aIndex = this._getSortIndex(term, a);
      const bIndex = this._getSortIndex(term, b);

      if (aIndex !== bIndex) {
        return aIndex - bIndex;
      }
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      return aName < bName ? -1 : aName > bName ? 1 : 0;
    };
  }

}
