import { Component, OnInit } from '@angular/core';
import { UserGearService } from '../user-gear.service';

import { FiltersService } from '../filters.service';

import { Output, EventEmitter } from '@angular/core';

@Component({
    selector: 'app-filters',
    templateUrl: './filters.component.html',
    styleUrls: ['./filters.component.css'],
    standalone: false
})
export class FiltersComponent implements OnInit {
  minLevel: number;
  maxLevel: number;
  showRaidItems: boolean;

  sortOwnedToTop: boolean = true;

  @Output() troveFileSelected = new EventEmitter<File>();
  @Output() sortOwnedToTopChanged = new EventEmitter<boolean>();
  troveUploadStatus: string = '';
  userGearCount: number = 0;

  constructor(
    public filters: FiltersService,
    private userGear: UserGearService
  ) {
    filters.getItemFilters().subscribe(itemFilters => {
      this.minLevel = itemFilters.levelRange[0];
      this.maxLevel = itemFilters.levelRange[1];
      this.showRaidItems = itemFilters.showRaidItems;
    });
    this.updateUserGearCount();
  }
  ngOnInit() {
    this.updateUserGearCount();
  }
  updateUserGearCount() {
    try {
      const data = localStorage.getItem('ddo-user-gear');
      if (data) {
        const arr = JSON.parse(data);
        this.userGearCount = Array.isArray(arr) ? arr.length : 0;
      } else {
        this.userGearCount = 0;
      }
    } catch {
      this.userGearCount = 0;
    }
  }

  onClearUserGear() {
    this.userGear.clear();
    this.updateUserGearCount();
  }


  onChangeLevelRange() {
    this.filters.setLevelRange(this.minLevel, this.maxLevel);
  }
  
  onChangeShowRaidItems() {
    this.filters.setShowRaidItems(this.showRaidItems);
  }

  onTroveFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      this.troveUploadStatus = 'No file selected.';
      return;
    }
    const file = input.files[0];
    if (!file.name.endsWith('.csv')) {
      this.troveUploadStatus = 'Please upload a .csv file.';
      return;
    }
    this.troveUploadStatus = 'File loaded. Processing...';
    this.troveFileSelected.emit(file);
    // Update the userGearCount after the parent processes the file (with a small delay to ensure storage is updated)
    setTimeout(() => this.updateUserGearCount(), 100);
  }

  onSortOwnedToTopChanged() {
    this.sortOwnedToTopChanged.emit(this.sortOwnedToTop);
  }
}
