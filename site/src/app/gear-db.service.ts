import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class GearDbService {

  constructor(
    private http: HttpClient,
    private gear
  ) { }

  getGearList() {
    if(!this.gear) {
      this.gear = this.http.get('/assets/items.json');
    }
    return this.gear;
  }
}
