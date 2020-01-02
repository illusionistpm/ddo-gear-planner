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
      map(term => this.source.filter(v => v.name.toLowerCase().indexOf(term.toLowerCase()) > -1).slice(0, 10))
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
  }

}
