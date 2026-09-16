const {buildFineli, parseCsv} = require('../scripts/build-fineli');

const files = {
  food: 'FOODID;FOODNAME;FOODTYPE\r\n1;Sokeri;FOOD\r\n2;Vesi;FOOD\r\n3;Ruisleipä;FOOD\r\n',
  componentValue:
    'FOODID;EUFDNAME;BESTLOC;ACQTYPE;METHTYPE\r\n1;ENERC;1698,30;S;S\r\n1;CHOAVL;99,900;S;S\r\n1;PROT;0;S;S\r\n1;FAT;0;S;S\r\n' +
    '3;ENERC;900;S;S\r\n3;PROT;7,5;S;S\r\n3;CHOAVL;40,25;S;S\r\n3;FAT;1,2;S;S\r\n',
  foodnameFI: 'FOODID;FOODNAME;LANG\r\n1;Sokeri;FI\r\n2;Vesi;FI\r\n3;Ruisleipä;FI\r\n',
  foodnameEN: 'FOODID;FOODNAME;LANG\r\n1;Sugar;EN\r\n3;Rye bread;EN\r\n',
  foodnameSV: 'FOODID;FOODNAME;LANG\r\n1;Socker;SV\r\n',
  foodaddunit: 'FOODID;FOODUNIT;MASS\r\n1;TL;4,00\r\n1;PORTM;8,00\r\n3;KPL_M;30,00\r\n3;KG;1000,00\r\n3;PORTM;60,00\r\n',
  foodunitFI: 'THSCODE;DESCRIPT;LANG\r\nKPL_M;keskikokoinen (kpl);FI\r\nPORTM;keskikokoinen annos;FI\r\nTL;teelusikka;FI\r\nKG;kilogramma;FI\r\n',
  foodunitEN: 'THSCODE;DESCRIPT;LANG\r\nKPL_M;medium-sized piece;EN\r\nPORTM;medium-sized portion;EN\r\nTL;teaspoon;EN\r\n',
  descript: 'Fineli. Versio. Version. Release. 18.0\r\n',
};

it('parses semicolon CSV with CRLF', () => {
  expect(parseCsv('A;B\r\n1;x\r\n')).toEqual([{A: '1', B: 'x'}]);
});

it('builds foods with kcal from kJ, names in three languages, and ordered units', () => {
  const out = buildFineli(files);
  expect(out.version).toBe('18.0');
  // Vesi has no ENERC → dropped.
  expect(out.foods.map(f => f[0])).toEqual([1, 3]);
  expect(out.foods[0]).toEqual([1, 'Sokeri', 'Sugar', 'Socker', 405.9, 0, 99.9, 0, [['PORTM', 8], ['TL', 4]]]);
  // KG is not a household unit; KPL_M outranks PORTM.
  expect(out.foods[1]).toEqual([3, 'Ruisleipä', 'Rye bread', null, 215.1, 7.5, 40.3, 1.2, [['KPL_M', 30], ['PORTM', 60]]]);
  expect(out.unitLabels.KPL_M).toEqual(['keskikokoinen (kpl)', 'medium-sized piece']);
  expect(out.unitLabels.KG).toBeUndefined();
});
