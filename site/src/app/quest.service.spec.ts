import { TestBed } from '@angular/core/testing';

import { QuestService } from './quest.service';

describe('QuestService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: QuestService = TestBed.inject(QuestService);
    expect(service).toBeTruthy();
  });
});
