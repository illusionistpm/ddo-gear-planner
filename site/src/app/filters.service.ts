import { Injectable } from '@angular/core';

import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class FiltersService {
  private levelRange: BehaviorSubject<[number, number]>;

  private MIN_LEVEL = 1;
  private MAX_LEVEL = 30;

  constructor() {
    this.levelRange = new BehaviorSubject<[number, number]>([this.MIN_LEVEL, this.MAX_LEVEL]);
  }

  getLevelRange() {
    return this.levelRange.asObservable();
  }

  setLevelRange(min: number, max: number) {
    min = Math.max(this.MIN_LEVEL, min);
    max = Math.min(this.MAX_LEVEL, max);
    this.levelRange.next([min, max]);
  }
}
