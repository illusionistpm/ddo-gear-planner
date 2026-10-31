import { TestBed } from '@angular/core/testing';

import { UserGearService } from './user-gear.service';

const STORAGE_KEY = 'ddo-user-gear';

const HEADER = 'SubscriptionHash,Character,Location,Tab,Name,Quantity,Binding';

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join('\r\n');
}

describe('UserGearService', () => {
  let service: UserGearService;
  const valid = new Set(['dinosaur bone light crossbow', 'celestial sapphire ring', 'drow scimitar']);

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    TestBed.configureTestingModule({});
    service = TestBed.inject(UserGearService);
  });

  afterEach(() => localStorage.removeItem(STORAGE_KEY));

  describe('importFromTroveCsv', () => {
    it('keeps known items with where each copy is, quoted or not', () => {
      const count = service.importFromTroveCsv(csv(
        'HASH,-,SharedBank,Main,"Dinosaur Bone Light Crossbow",1,BtA',
        'HASH,Khalarim,Inventory,6,Celestial Sapphire Ring,1,BtA',
      ), valid);

      expect(count).toBe(2);
      expect(service.getItemLocations('Dinosaur Bone Light Crossbow'))
        .toEqual([{ character: '-', location: 'SharedBank', tab: 'Main', quantity: 1, binding: 'BtA' }]);
      expect(service.getItemLocations('Celestial Sapphire Ring'))
        .toEqual([{ character: 'Khalarim', location: 'Inventory', tab: '6', quantity: 1, binding: 'BtA' }]);
    });

    it('reads how many copies each spot holds, and leaves unbound copies unmarked', () => {
      service.importFromTroveCsv(csv('HASH,Khalarim,Inventory,6,Drow Scimitar,3,None'), valid);

      expect(service.getItemLocations('Drow Scimitar'))
        .toEqual([{ character: 'Khalarim', location: 'Inventory', tab: '6', quantity: 3 }]);
    });

    it('reads an export without the Quantity and Binding columns', () => {
      service.importFromTroveCsv(['SubscriptionHash,Character,Location,Tab,Name', 'HASH,A,Bank,Main,Drow Scimitar']
        .join('\n'), valid);

      expect(service.getItemLocations('Drow Scimitar')).toEqual([{ character: 'A', location: 'Bank', tab: 'Main' }]);
    });

    it('drops names that aren\'t known items, and the header', () => {
      const count = service.importFromTroveCsv(csv('HASH,Khalarim,Inventory,6,Diamond of Heal +20,1,None'), valid);

      expect(count).toBe(0);
      expect(service.hasItem('Diamond of Heal +20')).toBe(false);
      expect(service.hasItem('Name')).toBe(false);
    });

    it('collects every location of a name, matching case-insensitively, and counts rows kept', () => {
      const count = service.importFromTroveCsv(csv(
        'HASH,Khalarim,Inventory,Main,Celestial Sapphire Ring,1,BtA',
        'HASH,-,SharedBank,Main,"celestial sapphire ring",1,BtA',
      ), valid);

      expect(count).toBe(2);
      expect(service.hasItem('CELESTIAL SAPPHIRE RING')).toBe(true);
      expect(service.getItemLocations('Celestial Sapphire Ring')?.map(location => location.character))
        .toEqual(['Khalarim', '-']);
    });

    it('reads a +N Drow item as its base name', () => {
      service.importFromTroveCsv(csv('HASH,Khalarim,Inventory,Main,+6Drow Scimitar,1,BtA'), valid);

      expect(service.hasItem('Drow Scimitar')).toBe(true);
    });

    it('skips lines with too few fields', () => {
      expect(service.importFromTroveCsv('just,three,fields\n\n', valid)).toBe(0);
    });

    it('replaces what an earlier import loaded', () => {
      service.importFromTroveCsv(csv('HASH,A,Bank,Main,Drow Scimitar,1,BtA'), valid);
      service.importFromTroveCsv(csv('HASH,A,Bank,Main,Celestial Sapphire Ring,1,BtA'), valid);

      expect(service.hasItem('Drow Scimitar')).toBe(false);
      expect(service.hasItem('Celestial Sapphire Ring')).toBe(true);
    });
  });

  it('announces each import and clear', () => {
    let changes = 0;
    service.userItemsChanged$.subscribe(() => changes++);

    service.importFromTroveCsv(csv('HASH,A,Bank,Main,Drow Scimitar,1,BtA'), valid);
    service.clear();

    expect(changes).toBe(2);
  });

  describe('storage', () => {
    it('persists an import and loads it into a fresh service', () => {
      service.importFromTroveCsv(csv('HASH,A,Bank,Main,Drow Scimitar,1,BtA'), valid);

      const stored = [{ character: 'A', location: 'Bank', tab: 'Main', quantity: 1, binding: 'BtA' }];
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([{ itemName: 'Drow Scimitar', locations: stored }]);

      const fresh = new UserGearService();
      fresh.loadFromStorage();
      expect(fresh.getItemLocations('drow scimitar')).toEqual(stored);
    });

    it('ignores corrupt storage', () => {
      localStorage.setItem(STORAGE_KEY, '{not json');
      const fresh = new UserGearService();

      expect(() => fresh.loadFromStorage()).not.toThrow();
      expect(fresh.hasItem('Drow Scimitar')).toBe(false);
    });

    it('forgets everything on clear', () => {
      service.importFromTroveCsv(csv('HASH,A,Bank,Main,Drow Scimitar,1,BtA'), valid);
      service.clear();

      expect(service.hasItem('Drow Scimitar')).toBe(false);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });
});
