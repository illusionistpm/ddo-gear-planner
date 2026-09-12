// This file is required by karma.conf.js and loads recursively all the .spec and framework files

import 'zone.js/testing';
import { TestBed, getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting
} from '@angular/platform-browser-dynamic/testing';

import { GameDataService } from './app/game-data.service';
import itemsList from './assets/items.json';
import craftingListRaw from './assets/crafting.json';
import essenceCraftingList from './assets/essence-crafting.json';
import setList from './assets/sets.json';

// First, initialize the Angular testing environment.
getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting()
);

// GameDataService loads its JSON via dynamic import() in production so the data lands
// in lazy chunks instead of the initial bundle (see game-data.service.ts). Specs
// construct services synchronously right after TestBed.configureTestingModule, so
// every testing module gets this pre-populated stand-in instead of waiting on that
// async load.
const fakeGameData: GameDataService = {
  items: itemsList as any,
  crafting: craftingListRaw as any,
  essenceCrafting: essenceCraftingList as any,
  sets: setList as any,
  load: () => Promise.resolve(),
} as GameDataService;

const originalConfigureTestingModule = TestBed.configureTestingModule.bind(TestBed);
TestBed.configureTestingModule = (moduleDef) => {
  const result = originalConfigureTestingModule(moduleDef);
  TestBed.overrideProvider(GameDataService, { useValue: fakeGameData });
  return result;
};
