import { describe, expect, it } from 'vitest';
import {
  collegeOptions,
  fieldOptions,
  optionText,
  searchOptions,
  type PickerOption,
} from './pickerSearch';

const options = collegeOptions([
  { id: 181394, name: 'University of Nebraska at Omaha', city: 'Omaha', state: 'NE', nicknames: ['UNOMAHA', 'UNO'] },
  { id: 181464, name: 'University of Nebraska-Lincoln', city: 'Lincoln', state: 'NE', nicknames: ['UNL'] },
  { id: 155399, name: 'Kansas State University', city: 'Manhattan', state: 'KS', nicknames: ['K-State', 'KSU'] },
  { id: 153158, name: 'Clarke University', city: 'Dubuque', state: 'IA', nicknames: [] },
  { id: 999, name: 'Unity College of Omaha', city: 'Omaha', state: 'NE', nicknames: [] },
]);

const ids = (results: PickerOption[]) => results.map((o) => o.id);

describe('searchOptions', () => {
  it('matches a nickname, ignoring case and punctuation, and lists the exact nickname first', () => {
    expect(ids(searchOptions(options, 'uno'))[0]).toBe('181394');
    expect(ids(searchOptions(options, 'U.N.O.'))[0]).toBe('181394');
  });

  it('matches on city', () => {
    expect(ids(searchOptions(options, 'manhattan'))).toEqual(['155399']);
  });

  it('requires every typed word to match somewhere', () => {
    expect(ids(searchOptions(options, 'nebraska lincoln'))).toEqual(['181464']);
    expect(ids(searchOptions(options, 'nebraska dubuque'))).toEqual([]);
  });

  it('matches words split by hyphens, and the hyphen-less spelling', () => {
    expect(ids(searchOptions(options, 'k-state'))).toEqual(['155399']);
    expect(ids(searchOptions(options, 'kstate'))).toEqual(['155399']);
  });

  it('puts names starting with the text before other matches', () => {
    const results = ids(searchOptions(options, 'uni'));
    // Unity, UNO, and UNL start with "uni"; Clarke and Kansas State only contain it.
    expect(results[0]).toBe('999');
    expect(results.slice(3)).toEqual(['153158', '155399']);
  });

  it('returns everything alphabetically for an empty query, up to the limit', () => {
    expect(ids(searchOptions(options, '  '))).toEqual(['153158', '155399', '999', '181394', '181464']);
    expect(searchOptions(options, '', 2)).toHaveLength(2);
  });
});

describe('optionText', () => {
  it('shows city and state for schools and just the title for fields', () => {
    expect(optionText(options[0])).toBe('University of Nebraska at Omaha · Omaha, NE');
    expect(optionText(fieldOptions([{ code: '11.07', title: 'Computer Science' }])[0])).toBe('Computer Science');
  });
});
