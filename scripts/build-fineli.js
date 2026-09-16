#!/usr/bin/env node
/*
 * Builds src/assets/fineli.json from the Fineli open-data CSV package
 * (THL, CC BY 4.0). Usage: node scripts/build-fineli.js [data/fineli]
 *
 * Input files (';'-separated, ISO-8859-1, decimal comma): food.csv,
 * component_value.csv, foodname_FI/EN/SV.csv, foodaddunit.csv,
 * foodunit_FI/EN.csv, descript.txt. Get them from fineli.fi → Avoin data
 * (basic package 1) or the mirror github.com/theel0ja/fineli-data.
 *
 * Output is array-shaped to stay small (~1 MB for ~4 000 foods):
 *   {version, generated, unitLabels: {CODE: [fi, en]},
 *    foods: [[id, fi, en, sv, kcal, protein, carbs, fat, [[CODE, grams], …]], …]}
 */
const fs = require('fs');
const path = require('path');

// Which household unit becomes a product's default serving, most useful first.
const UNIT_ORDER = ['KPL_M', 'PORTM', 'KPL_S', 'KPL_L', 'PORTS', 'PORTL', 'DL', 'RKL', 'TL', 'KPL_VALM'];

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  const header = lines[0].split(';');
  return lines.slice(1).map(line => {
    const cells = line.split(';');
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

function num(s) {
  const n = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function round1(n) {
  return n == null ? null : Math.round(n * 10) / 10;
}

/** Pure: CSV texts in → JSON payload out. */
function buildFineli(files) {
  const names = lang => {
    const m = new Map();
    for (const r of parseCsv(files[`foodname${lang}`] ?? '')) { m.set(Number(r.FOODID), r.FOODNAME.trim()); }
    return m;
  };
  const fi = names('FI');
  const en = names('EN');
  const sv = names('SV');

  const values = new Map();
  for (const r of parseCsv(files.componentValue)) {
    const id = Number(r.FOODID);
    const v = values.get(id) ?? {};
    v[r.EUFDNAME] = num(r.BESTLOC);
    values.set(id, v);
  }

  const units = new Map();
  for (const r of parseCsv(files.foodaddunit)) {
    const id = Number(r.FOODID);
    const grams = num(r.MASS);
    if (!UNIT_ORDER.includes(r.FOODUNIT) || grams == null || grams <= 0) { continue; }
    const list = units.get(id) ?? [];
    list.push([r.FOODUNIT, grams]);
    units.set(id, list);
  }

  const unitLabels = {};
  for (const r of parseCsv(files.foodunitFI)) { if (UNIT_ORDER.includes(r.THSCODE)) { unitLabels[r.THSCODE] = [r.DESCRIPT, r.DESCRIPT]; } }
  for (const r of parseCsv(files.foodunitEN)) { if (unitLabels[r.THSCODE]) { unitLabels[r.THSCODE][1] = r.DESCRIPT; } }

  const foods = [];
  for (const r of parseCsv(files.food)) {
    const id = Number(r.FOODID);
    const v = values.get(id) ?? {};
    if (v.ENERC == null || !fi.get(id)) { continue; }
    const unitList = (units.get(id) ?? []).sort((a, b) => UNIT_ORDER.indexOf(a[0]) - UNIT_ORDER.indexOf(b[0]));
    foods.push([
      id,
      fi.get(id),
      en.get(id) ?? null,
      sv.get(id) ?? null,
      round1(v.ENERC / 4.184),
      round1(v.PROT),
      round1(v.CHOAVL),
      round1(v.FAT),
      unitList,
    ]);
  }
  foods.sort((a, b) => a[0] - b[0]);

  const version = (/Release\.?\s*([\d.]+)/i.exec(files.descript ?? '') ?? [])[1] ?? 'unknown';
  return {version, generated: new Date().toISOString().slice(0, 10), unitLabels, foods};
}

function readLatin1(dir, name) {
  return fs.readFileSync(path.join(dir, name)).toString('latin1');
}

if (require.main === module) {
  const dir = process.argv[2] ?? path.join(__dirname, '..', 'data', 'fineli');
  const out = path.join(__dirname, '..', 'src', 'assets', 'fineli.json');
  const payload = buildFineli({
    food: readLatin1(dir, 'food.csv'),
    componentValue: readLatin1(dir, 'component_value.csv'),
    foodnameFI: readLatin1(dir, 'foodname_FI.csv'),
    foodnameEN: readLatin1(dir, 'foodname_EN.csv'),
    foodnameSV: readLatin1(dir, 'foodname_SV.csv'),
    foodaddunit: readLatin1(dir, 'foodaddunit.csv'),
    foodunitFI: readLatin1(dir, 'foodunit_FI.csv'),
    foodunitEN: readLatin1(dir, 'foodunit_EN.csv'),
    descript: readLatin1(dir, 'descript.txt'),
  });
  fs.mkdirSync(path.dirname(out), {recursive: true});
  fs.writeFileSync(out, JSON.stringify(payload));
  console.log(`fineli.json: ${payload.foods.length} foods, release ${payload.version}, ${(fs.statSync(out).size / 1024).toFixed(0)} kB`);
}

module.exports = {parseCsv, buildFineli, UNIT_ORDER};
