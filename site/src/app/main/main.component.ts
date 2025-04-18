import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { QueryParamsService } from '../query-params.service';

@Component({
    selector: 'app-main',
    templateUrl: './main.component.html',
    styleUrls: ['./main.component.css'],
    standalone: false
})
export class MainComponent implements OnInit {
  constructor(
    private readonly route: ActivatedRoute,
    private queryParams: QueryParamsService
  ) {
  }

  ngOnInit() {
    this.route.queryParamMap.subscribe(params => {
      this.queryParams.updateFromParams(params);
    });
  }

}
