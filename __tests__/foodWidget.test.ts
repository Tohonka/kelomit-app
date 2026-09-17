jest.mock('../src/db/days', () => ({getOrCreateDay: jest.fn()}));
jest.mock('../src/db/food', () => ({}));
jest.mock('../src/native/widgetSession', () => ({}));
jest.mock('../src/services/openFoodFacts', () => ({lookupBarcode: jest.fn()}));

import {buildFoodWidgetState, parsePendingAdds} from '../src/services/foodWidget';
import {parseFoodLink} from '../src/services/deepLinks';
import type {FoodProduct} from '../src/types';

jest.mock('../src/store/dayStore', () => ({useDayStore: {getState: () => ({})}}));
jest.mock('../src/navigation/navigationRef', () => ({navigationRef: {isReady: () => false}}));

const product = (over: Partial<FoodProduct>): FoodProduct => ({
  id: 1, barcode: '6400000000001', name: 'Rahka', brand: 'Valio', kcal_per_100: 60, kcal_per_serving: null,
  protein_per_100: null, carbs_per_100: null, fat_per_100: null, serving_g: 200, serving_label: null,
  source: 'off', source_ref: null, image_url: null, archived: false, created_at: '', updated_at: '', ...over,
});

describe('buildFoodWidgetState', () => {
  it('maps a barcode to how the product was last eaten, else to one default portion', () => {
    const eaten = {name: 'Valio Rahka', kcal: 90, product_id: 1, quantity: 150, unit: 'g' as const};
    const state = buildFoodWidgetState(
      [eaten, {name: 'Kahvi', kcal: null, product_id: null, quantity: null, unit: null}],
      [product({}), product({id: 2, barcode: '6400000000002', name: 'Jogurtti', brand: null}), product({id: 3, barcode: null})],
    );
    expect(state.foods).toHaveLength(2);
    expect(Object.keys(state.barcodes)).toEqual(['6400000000001', '6400000000002']);
    expect(state.barcodes['6400000000001']).toBe(eaten);
    // 1 serving of 200 g at 60 kcal/100 g
    expect(state.barcodes['6400000000002']).toEqual({name: 'Jogurtti', kcal: 120, product_id: 2, quantity: 1, unit: 'serving'});
  });

  it('caps the list at 50', () => {
    const many = Array.from({length: 80}, (_, i) => ({name: `f${i}`, kcal: null, product_id: null, quantity: null, unit: null}));
    expect(buildFoodWidgetState(many, []).foods).toHaveLength(50);
  });
});

describe('parsePendingAdds', () => {
  it('keeps well-formed rows, normalises the loose fields and the timestamp precision', () => {
    const rows = parsePendingAdds([
      {name: 'Puuro', kcal: 250, product_id: null, quantity: 1, unit: 'serving', eaten_at: '2026-09-17T06:00:00Z'},
      {name: 'Barcode …1234', eaten_at: '2026-09-17T07:00:00Z', barcode: '6400000001234', unit: 'bogus', kcal: 'x'},
      {name: '', eaten_at: '2026-09-17T07:00:00Z'},
      {name: 'No time'},
      {name: 'Bad time', eaten_at: 'yesterday-ish'},
      null, 'junk',
    ]);
    expect(rows).toEqual([
      {name: 'Puuro', kcal: 250, product_id: null, quantity: 1, unit: 'serving', eaten_at: '2026-09-17T06:00:00.000Z'},
      {name: 'Barcode …1234', kcal: null, product_id: null, quantity: null, unit: null, eaten_at: '2026-09-17T07:00:00.000Z', barcode: '6400000001234'},
    ]);
  });
});

describe('parseFoodLink', () => {
  it('accepts the two widget links and nothing else', () => {
    expect(parseFoodLink('kelomit://food/search')).toEqual({kind: 'search'});
    expect(parseFoodLink('kelomit://food/scan/6400000001234')).toEqual({kind: 'scan', barcode: '6400000001234'});
    expect(parseFoodLink('kelomit://food/scan/abc')).toBeNull();
    expect(parseFoodLink('kelomit://food/scan/64000000012345678')).toBeNull();
    expect(parseFoodLink('kelomit://quickadd/note')).toBeNull();
    expect(parseFoodLink(null)).toBeNull();
  });
});
