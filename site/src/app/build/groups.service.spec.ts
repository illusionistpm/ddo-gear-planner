import { HttpErrorResponse } from '@angular/common/http';

import { charactersListName, createListErrorOf, groupRunName, uniqueListName } from './groups.service';

describe('a list\'s default name', () => {
  it('is its characters\', or the first\'s and how many more once they don\'t fit', () => {
    expect(charactersListName(['Kira'])).toBe('Kira');
    expect(charactersListName(['Kira', 'Thane', 'Vex'])).toBe('Kira & Thane & Vex');
    const many = ['Kirabella', 'Thanewood', 'Vexillary', 'Morrowind', 'Quillfeather', 'Ashenvale'];
    expect(charactersListName(many)).toBe('Kirabella & 5 more');
  });

  it('for friends to join, says when it was started', () => {
    expect(groupRunName(new Date(2026, 10, 7))).toBe('Group run, Nov 7');
  });

  it('is one none of your lists has, whatever their case', () => {
    expect(uniqueListName('Kira', ['Thane'])).toBe('Kira');
    expect(uniqueListName('Kira', ['kira', 'Kira (2)'])).toBe('Kira (3)');
  });

  it('stays within a list name\'s length, numbered', () => {
    const long = 'x'.repeat(60);

    expect(uniqueListName(long, [long])).toBe(`${'x'.repeat(56)} (2)`);
  });
});

describe('createListErrorOf', () => {
  it('passes on the Worker\'s reason for refusing a new list, and asks you to try again otherwise', () => {
    expect(createListErrorOf(new HttpErrorResponse({ status: 409, error: { error: 'You\'re hosting 10 group runs already.' } })))
      .toBe('You\'re hosting 10 group runs already.');
    expect(createListErrorOf(new HttpErrorResponse({ status: 500, error: { error: 'boom' } }))).toBe('Couldn\'t start the list. Please try again.');
    expect(createListErrorOf(new Error('offline'))).toBe('Couldn\'t start the list. Please try again.');
  });
});
