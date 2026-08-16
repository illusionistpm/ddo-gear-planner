import { Component, OnInit, Input, ViewChild, ElementRef, ChangeDetectionStrategy } from '@angular/core';
import { Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators';
import { AnalyticsService } from '../analytics.service';

@Component({
    selector: 'app-typeahead',
    templateUrl: './typeahead.component.html',
    styleUrls: ['./typeahead.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class TypeaheadComponent implements OnInit {
  @Input() source: any;
  @Input() item: any;
  @Input() onChange!: (val: string) => any;
  @Input() placeholder!: string;
  @Input() resultFormatter!: (x: any) => string;
  @Input() inputClass!: string;
  @Input() searchType!: string;

  @ViewChild('inputElement', { static: true }) inputElement!: ElementRef;

  itemName!: string;

  formatter = (x: { name: string }) => x.name;

  search = (text$: Observable<string>) =>
    text$.pipe(
      debounceTime(200),
      distinctUntilChanged(),
      map(term => {
        return this.source.filter((v: any) => v.name.toLowerCase().indexOf(term.toLowerCase()) > -1 || (v.synonyms && v.synonyms.some((x: any) => x.toLowerCase().indexOf(term.toLowerCase()) > -1)))
        // If the entry has any synonyms, search on them as well. If they match, we want to show an entry like "Canonical Text (Synonym)".
        // If we matched on a synonym, we also add another field to the response, 'original', which is the canonical name.
        .map((v: any) => v.name.toLowerCase().indexOf(term.toLowerCase()) > -1 ? v : {name: `${v.name} (${v.synonyms.find((x: any) => x.toLowerCase().indexOf(term.toLowerCase()) > -1)})`, original: v.name })
        .sort(this._sortResults(term)).slice(0, 6)
      })
      );

  constructor(private analytics: AnalyticsService) { }

  ngOnInit() {
    if (this.item) {
      this.item.subscribe((v: any) => {
        if (v) {
          this.itemName = v.name;
        }
      });
    }
  }

  onSelectItemMine(e: any) {
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

  _getSortIndex(term: string, str: any) {
    const split = str.name.split(' ');

    const matches = split.filter((v: any) => v.toLowerCase().startsWith(term.toLowerCase()));
    let index = split.indexOf(matches[0]);
    if (index < 0) {
      index = 999;
    }
    return index;
  }

  _sortResults(term: string) {
    return (a: any, b: any) => {
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
