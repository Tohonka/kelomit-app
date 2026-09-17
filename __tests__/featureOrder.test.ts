import {applyFeatureOrder, parseFeatureOrder, moveItem, cellIndexAt} from '../src/navigation/featureOrder';

const ROUTES = ['Home', 'Map', 'Data', 'Food'];

it('keeps the saved order, drops unknown/duplicate routes, appends new features', () => {
  expect(applyFeatureOrder(null, ROUTES)).toEqual(ROUTES);
  expect(applyFeatureOrder(['Food', 'Gone', 'Home', 'Food'], ROUTES)).toEqual(['Food', 'Home', 'Map', 'Data']);
});

it('parses only a JSON string array', () => {
  expect(parseFeatureOrder('["Food","Home"]')).toEqual(['Food', 'Home']);
  expect(parseFeatureOrder('{"a":1}')).toBeNull();
  expect(parseFeatureOrder('nope')).toBeNull();
  expect(parseFeatureOrder(null)).toBeNull();
});

it('moves an item and finds the grid cell under a point', () => {
  expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  // 4 columns of 78×92, 7 items
  expect(cellIndexAt(80, 5, 78, 92, 4, 7)).toBe(1);
  expect(cellIndexAt(160, 95, 78, 92, 4, 7)).toBe(6);
  expect(cellIndexAt(300, 300, 78, 92, 4, 7)).toBe(6); // past the end → last item
  expect(cellIndexAt(-40, -40, 78, 92, 4, 7)).toBe(0);
});
