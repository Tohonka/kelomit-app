import {offToProduct} from '../src/services/openFoodFacts';
import fixture from './fixtures/off-oltermanni.json';

describe('offToProduct', () => {
  it('maps a real v2 product response (captured 2026-09-16)', () => {
    const p = offToProduct(fixture, '6408430039517');
    expect(p).toEqual({
      barcode: '6408430039517',
      name: 'Oltermanni 17%',
      brand: 'Valio',
      kcal_per_100: 272,
      kcal_per_serving: 27.2,
      protein_per_100: 29,
      carbs_per_100: 0,
      fat_per_100: 17,
      serving_g: 10,
      serving_label: '10 g',
      source: 'off',
      source_ref: '6408430039517',
      image_url: 'https://images.openfoodfacts.org/images/products/640/843/003/9517/front_en.3.200.jpg',
    });
  });

  it('returns null for the not-found shape and for a nameless product', () => {
    expect(offToProduct({code: '00000000', status: 0, status_verbose: 'no code or invalid code'}, '0')).toBeNull();
    expect(offToProduct({status: 1, product: {code: '1', nutriments: {}}}, '1')).toBeNull();
    expect(offToProduct(null, '1')).toBeNull();
  });

  it('falls back from kJ to kcal and parses a serving size string', () => {
    const p = offToProduct(
      {
        status: 1,
        product: {
          code: '2',
          product_name: ' Ruisleipä ',
          serving_size: '30 g',
          nutriments: {'energy-kj_100g': 1135},
        },
      },
      '2',
    );
    expect(p).toMatchObject({name: 'Ruisleipä', kcal_per_100: 271.3, kcal_per_serving: null, serving_g: 30});
  });
});
