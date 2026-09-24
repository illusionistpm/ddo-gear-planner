// Runs before every spec file (see `setupFiles` for the test target in angular.json).
// The unit-test builder initialises TestBed itself; this only stubs game data.

import { TestBed } from '@angular/core/testing';
import { GameDataService } from './app/gear/game-data.service';
import { RawCraftingData, RawEssenceCraftingData, RawItem, RawSetData } from './app/gear/game-data-types';
import itemsList from '@data/items.json';
import craftingListRaw from '@data/crafting.json';
import essenceCraftingList from '@data/essence-crafting.json';
import setList from '@data/sets.json';

// GameDataService loads its JSON via dynamic import() in production so the data lands
// in lazy chunks instead of the initial bundle (see game-data.service.ts). Specs
// construct services synchronously right after TestBed.configureTestingModule, so
// every testing module gets this pre-populated stand-in instead of waiting on that
// async load.
const fakeGameData: GameDataService = {
  items: itemsList as RawItem[],
  crafting: craftingListRaw as RawCraftingData,
  essenceCrafting: essenceCraftingList as RawEssenceCraftingData,
  sets: setList as RawSetData,
  load: () => Promise.resolve(),
} as GameDataService;

const originalConfigureTestingModule = TestBed.configureTestingModule.bind(TestBed);
TestBed.configureTestingModule = (moduleDef) => {
  const result = originalConfigureTestingModule(moduleDef);
  TestBed.overrideProvider(GameDataService, { useValue: fakeGameData });
  return result;
};

// Specs run in jsdom, which has no layout engine (Chrome under Karma did). These are the
// layout APIs ShrinkToFitDirective touches; measuring nothing is enough for the specs.
if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
}
if (typeof ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

// Many specs build the whole game database (a second or more each, several times that with
// every worker busy). Jasmine never timed out a synchronous spec; Vitest's 5s default
// does, and turned CPU contention into flaky failures.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

// Jasmine removed every `spyOn` spy when its spec finished; Vitest leaves them in place,
// so a stub in one test would otherwise leak into the next.
//
// Vitest 4 also keeps every mock it ever creates in a Set that is only added to, and each
// `vi.spyOn` mock closes over the object it spied on. Our specs spy on TestBed-created
// services, so one spy pins that test's whole service graph and game data (~500MB); a file
// with 30 such tests dies of heap exhaustion. Vitest 5 fixed this, but @angular/build
// doesn't support it yet. Until it does, method spies are built here from `vi.fn()`, which
// keeps the restore step in an array we empty after every test instead of in that closure.
// Delete this wrapper once the Vitest peer range allows a version with the fix.
type Restore = () => void;
const restores: Restore[] = [];
const realSpyOn = vi.spyOn.bind(vi) as (...args: unknown[]) => unknown;

function spyOnMethod(target: object | null | undefined, key: PropertyKey, accessType?: string): unknown {
  const original = accessType ? undefined : (target as Record<PropertyKey, unknown> | null | undefined)?.[key];
  const ownDescriptor = target == null ? undefined : Object.getOwnPropertyDescriptor(target, key);
  if (typeof original !== 'function' || vi.isMockFunction(original)
      || (ownDescriptor && !('value' in ownDescriptor))) {
    return realSpyOn(target, key, accessType);
  }

  const owner = target as object; // a function was found on it, so it isn't null
  const spy = vi.fn().mockImplementation(function (this: unknown, ...args: unknown[]) {
    return original.apply(this, args);
  });
  try {
    Object.defineProperty(owner, key,
      { enumerable: true, configurable: true, writable: true, ...ownDescriptor, value: spy });
  } catch {
    return realSpyOn(target, key, accessType);
  }
  restores.push(() => {
    spy.mockReset();
    if (ownDescriptor) {
      Object.defineProperty(owner, key, ownDescriptor);
    } else {
      Reflect.deleteProperty(owner, key);
    }
  });
  return spy;
}

vi.spyOn = spyOnMethod as typeof vi.spyOn;

afterEach(() => {
  for (const restore of restores.splice(0).reverse()) {
    restore();
  }
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// Jasmine's runner yielded to the event loop between specs; Vitest runs synchronous specs
// back to back on microtasks alone. Timers scheduled by one spec's services (the idle-time
// availability warmup is a setTimeout(0) chain here) then never fire while the file runs,
// and each pins that spec's whole service graph until the file ends - a 30-spec file can
// exhaust the heap. Yield once per spec, after the previous spec's TestBed teardown.
beforeEach(() => new Promise<void>(resolve => setTimeout(resolve, 0)));
