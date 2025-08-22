import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { QueryParamsService } from '../query-params.service';
import { UserGearService } from '../user-gear.service';
import { GearDbService } from '../gear-db.service';

@Component({
    selector: 'app-main',
    templateUrl: './main.component.html',
    styleUrls: ['./main.component.css'],
    standalone: false
})
export class MainComponent implements OnInit {
  troveUploadStatus: string = '';
  sortOwnedToTop: boolean = true;
  onSortOwnedToTopChanged(value: boolean) {
    this.sortOwnedToTop = value;
  }

  constructor(
    private readonly route: ActivatedRoute,
    private queryParams: QueryParamsService,
    private userGear: UserGearService,
    private gearDb: GearDbService
  ) {}

  ngOnInit() {
    this.route.queryParamMap.subscribe(params => {
      this.queryParams.updateFromParams(params);
    });
    this.userGear.loadFromStorage();
  }

  onTroveFileSelected(eventOrFile: Event | File) {
    let file: File | null = null;
    if (eventOrFile instanceof File) {
      file = eventOrFile;
    } else {
      const input = eventOrFile.target as HTMLInputElement;
      if (!input.files || input.files.length === 0) {
        this.troveUploadStatus = 'No file selected.';
        return;
      }
      file = input.files[0];
    }
    if (!file) {
      this.troveUploadStatus = 'No file selected.';
      return;
    }
    if (!file.name.endsWith('.csv')) {
      this.troveUploadStatus = 'Please upload a .csv file.';
      return;
    }
    this.troveUploadStatus = 'File loaded. Parsing...';
    const reader = new FileReader();
    reader.onload = (e: any) => {
      const text = e.target.result;
      const validNames = this.getValidItemNames();
      const count = this.userGear.importFromTroveCsv(text, validNames);
      this.troveUploadStatus = `TroveExport.csv processed! ${count} items loaded.`;
    };
    reader.onerror = () => {
      this.troveUploadStatus = 'Error reading file.';
    };
    reader.readAsText(file);
  }

  private getValidItemNames(): Set<string> {
    const validNames = new Set<string>();
    for (const items of this.gearDb["allGear"].values()) {
      for (const item of items) {
        validNames.add(item.name.trim().toLowerCase());
      }
    }
    return validNames;
  }
}
