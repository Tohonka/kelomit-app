import {useEffect, useMemo, useState} from 'react';
import {defaultPortion, fineliToProduct, portionKcal, portionOptions} from '../../../../src/utils/foodMath.ts';
import type {ProductFields} from '../../../../src/db/food.ts';
import type {FineliUnit, FoodEntry, FoodProduct, FoodUnit} from '../../../../src/types/index.ts';
import type {DayFood, FoodSearch} from '../../main/life.ts';
import {addMonths, clock, dayLabel, hhmm, isoOn, monthLabel, nowOn} from '../lib/format.ts';
import {useQuery} from '../hooks/useQuery.ts';
import {mediaUrl} from './Media.tsx';

export type FoodSelection = {kind: 'food'; id: number} | {kind: 'newFood'};

const cmd = (fn: string, args: unknown[], label: string) => window.kelomit.cmd(fn, args, label).catch(() => {});
const UNIT_WORDS = {piece: 'piece', serving: 'serving'};
const LANG = 'fi' as const;

function amountLabel(e: FoodEntry, p: FoodProduct | undefined): string {
  if (e.quantity == null || !e.unit) return '';
  const n = Math.round(e.quantity * 100) / 100;
  if (e.unit === 'serving') return `${n} × ${p?.serving_label ?? 'serving'}`;
  if (e.unit === 'piece') return `${n} pc`;
  return `${n} ${e.unit}`;
}

/** The day's food log under the day card. Rows select into the editor. */
export function FoodCard({
  food,
  selectedId,
  onSelect,
}: {
  food: DayFood | null | undefined;
  selectedId: number | null;
  onSelect: (s: FoodSelection | null) => void;
}) {
  const entries = food?.entries ?? [];
  return (
    <div className="card food-card">
      <div className="food-head">
        <h2>Food</h2>
        {food && entries.length > 0 && (
          <span className="num total">
            {food.kcal} kcal{food.noKcal > 0 && <span className="muted"> · {food.noKcal} without kcal</span>}
          </span>
        )}
        <span className="spacer" />
        <button className="btn small" onClick={() => onSelect({kind: 'newFood'})}>
          + Food
        </button>
      </div>
      {entries.length === 0 && <p className="muted">Nothing logged.</p>}
      {entries.map(e => {
        const p = e.product_id != null ? food?.products[e.product_id] : undefined;
        const thumb = mediaUrl(e.thumbnail_path ?? e.file_path);
        return (
          <div
            key={e.id}
            className={`food-row${e.id === selectedId ? ' selected' : ''}`}
            onClick={() => onSelect({kind: 'food', id: e.id})}>
            <span className="time num">{clock(e.eaten_at)}</span>
            <span className="name">
              {e.name}
              {e.note && <span className="muted"> — {e.note}</span>}
            </span>
            <span className="muted amount">{amountLabel(e, p)}</span>
            <span className="num kcal">{e.kcal != null ? `${e.kcal} kcal` : '—'}</span>
            {thumb && <img src={thumb} alt="" />}
          </div>
        );
      })}
    </div>
  );
}

/** A product the entry points at — an existing phone row (`id`) or one the Mac
 *  resolved (Fineli pick / Open Food Facts hit) that the phone will create. */
interface Linked {
  product: FoodProduct | ProductFields;
  id: number | null;
  units: FineliUnit[];
}

function parsePositive(s: string): number | null {
  const n = parseFloat(s.replace(',', '.'));
  return s.trim() && Number.isFinite(n) && n > 0 ? n : null;
}

function unitKeyOf(unit: FoodUnit | null | undefined): string {
  return unit === 'serving' || unit === 'piece' || unit === 'ml' ? unit : 'g';
}

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export function FoodEditor({
  date,
  selection,
  food,
  onClose,
}: {
  date: string;
  selection: FoodSelection;
  food: DayFood | null | undefined;
  onClose: () => void;
}) {
  const entry = selection.kind === 'food' ? food?.entries.find(e => e.id === selection.id) : undefined;
  const isNew = selection.kind === 'newFood';
  const key = `${selection.kind}:${entry?.id ?? ''}:${entry?.updated_at ?? ''}`;

  const [name, setName] = useState('');
  const [time, setTime] = useState('');
  const [amount, setAmount] = useState('');
  const [unitKey, setUnitKey] = useState('g');
  const [kcal, setKcal] = useState('');
  const [kcalAuto, setKcalAuto] = useState(true);
  const [note, setNote] = useState('');
  const [barcode, setBarcode] = useState('');
  const [linked, setLinked] = useState<Linked | null>(null);
  const [unitLabels, setUnitLabels] = useState<Record<string, [string, string]>>({});
  const [suggest, setSuggest] = useState<FoodSearch | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset from the row (or blank) when the selection changes.
  useEffect(() => {
    setName(entry?.name ?? '');
    setTime(entry ? hhmm(entry.eaten_at) : hhmm(nowOn(date)));
    setAmount(entry?.quantity != null ? fmt(entry.quantity) : '');
    setUnitKey(unitKeyOf(entry?.unit));
    setKcal(entry?.kcal != null ? String(entry.kcal) : '');
    setKcalAuto(entry == null);
    setNote(entry?.note ?? '');
    setBarcode('');
    setLinked(null);
    setSuggest(null);
    if (entry?.product_id != null) {
      const pid = entry.product_id;
      window.kelomit
        .query('foodProduct', pid)
        .then(r => {
          if (r?.product) {
            setLinked({product: r.product, id: pid, units: r.units});
            setUnitLabels(r.unitLabels);
          }
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Suggestions while typing a name with nothing linked yet.
  useEffect(() => {
    const q = name.trim();
    if (linked || q.length < 2) {
      setSuggest(null);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      window.kelomit
        .query('foodSearch', q, LANG)
        .then(r => {
          if (live && r) {
            setSuggest(r);
            setUnitLabels(r.unitLabels);
          }
        })
        .catch(() => {});
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [name, linked]);

  const options = useMemo(
    () => portionOptions(linked?.product ?? null, linked?.units ?? [], unitLabels, LANG, UNIT_WORDS),
    [linked, unitLabels],
  );
  const opt = options.find(o => o.key === unitKey) ?? options[0];

  // kcal follows amount × product until the user types a figure.
  useEffect(() => {
    if (!kcalAuto || !linked) return;
    const n = parsePositive(amount);
    const k = n != null ? portionKcal(linked.product.kcal_per_100, opt, n) : null;
    setKcal(k != null ? String(k) : '');
  }, [amount, opt, linked, kcalAuto]);

  const link = (l: Linked, displayName?: string) => {
    setLinked(l);
    setSuggest(null);
    if (displayName) setName(displayName);
    if (!amount.trim()) {
      const d = defaultPortion(l.product);
      setAmount(fmt(d.quantity));
      setUnitKey(d.unit);
    }
    setKcalAuto(true);
  };

  const pickProduct = async (p: FoodProduct) => {
    let units: FineliUnit[] = [];
    if (p.source === 'fineli') {
      units = (await window.kelomit.query('foodProduct', p.id).catch(() => null))?.units ?? [];
    }
    link({product: p, id: p.id, units}, p.brand ? `${p.brand} ${p.name}` : p.name);
  };

  const pickFineli = (f: FoodSearch['fineli'][number]) => {
    const fields = fineliToProduct(f, f.units, unitLabels, LANG);
    link({product: fields, id: null, units: f.units}, fields.name);
  };

  const lookup = async () => {
    const code = barcode.trim();
    if (!code) return;
    setBusy(true);
    try {
      const p = await window.kelomit.offLookup(code);
      if (!p) {
        alert(`Open Food Facts doesn't know ${code}.`);
        return;
      }
      link({product: p, id: null, units: []}, p.brand ? `${p.brand} ${p.name}` : p.name);
    } catch (e) {
      alert(`Lookup failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const finalName = name.trim();
    if (!finalName) return;
    const n = parsePositive(amount);
    let quantity: number | null = null;
    let unit: FoodUnit | null = null;
    if (n != null) {
      // Phone rule: mass units are stored as grams, ml stays ml, a mass-less
      // piece / serving is stored as a count.
      if (opt.key === 'ml') {
        quantity = n;
        unit = 'ml';
      } else if (opt.grams != null) {
        quantity = n * opt.grams;
        unit = 'g';
      } else {
        quantity = n;
        unit = opt.key === 'piece' ? 'piece' : 'serving';
      }
    }
    const k = parsePositive(kcal);
    const fields = {
      eaten_at: isoOn(date, time) ?? nowOn(date),
      name: finalName,
      kcal: k != null ? Math.round(k) : null,
      quantity,
      unit,
      note: note.trim() || null,
      product_id: linked?.id ?? null,
      ...(linked && linked.id == null ? {product: linked.product} : {}),
    };
    if (isNew) {
      cmd('food.create', [date, fields], `Log food “${finalName}”`);
    } else {
      cmd('food.update', [entry!.id, fields], `Edit food “${finalName}”`);
    }
    onClose();
  };

  const remove = () => {
    if (!entry || !confirm(`Delete “${entry.name}”?`)) return;
    cmd('food.delete', [entry.id], `Delete food “${entry.name}”`);
    onClose();
  };

  if (!isNew && !entry) {
    return <div className="empty">Food entry gone</div>;
  }
  const p = linked?.product;

  return (
    <div className="inspector food-editor">
      <h2>{isNew ? 'Log food' : 'Edit food'}</h2>
      <label>
        <span>What</span>
        <input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="Porridge, coffee…" />
      </label>
      {suggest && (suggest.products.length > 0 || suggest.fineli.length > 0) && (
        <ul className="suggest">
          {suggest.products.map(sp => (
            <li key={`p${sp.id}`} onClick={() => pickProduct(sp)}>
              <span>
                {sp.brand ? `${sp.brand} ` : ''}
                {sp.name}
              </span>
              <span className="muted">
                {sp.kcal_per_100 != null ? `${sp.kcal_per_100} kcal/100` : ''} · {sp.source === 'fineli' ? 'Fineli' : sp.source === 'off' ? 'OFF' : 'mine'}
              </span>
            </li>
          ))}
          {suggest.fineli.map(f => (
            <li key={`f${f.id}`} onClick={() => pickFineli(f)}>
              <span>{LANG === 'fi' ? f.name_fi : f.name_en ?? f.name_fi}</span>
              <span className="muted">{f.kcal_per_100} kcal/100 · Fineli</span>
            </li>
          ))}
        </ul>
      )}
      {p && (
        <div className="linked">
          <span className="chip">
            {'brand' in p && p.brand ? `${p.brand} ` : ''}
            {p.name}
            {p.kcal_per_100 != null ? ` · ${p.kcal_per_100} kcal/100` : ''}
            {linked?.id == null ? ' · new' : ''}
          </span>
          <button className="btn small" onClick={() => setLinked(null)} title="Unlink product">
            ×
          </button>
        </div>
      )}
      <div className="row">
        <label>
          <span>Time</span>
          <input type="time" value={time} onChange={e => setTime(e.target.value)} />
        </label>
        <label>
          <span>Amount</span>
          <input type="number" min={0} step="any" value={amount} onChange={e => setAmount(e.target.value)} />
        </label>
        <label>
          <span>Unit</span>
          <select value={opt.key} onChange={e => setUnitKey(e.target.value)}>
            {options.map(o => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row">
        <label>
          <span>kcal{kcalAuto && linked ? ' (from product)' : ''}</span>
          <input
            type="number"
            min={0}
            value={kcal}
            onChange={e => {
              setKcal(e.target.value);
              setKcalAuto(false);
            }}
          />
        </label>
        <label>
          <span>Barcode</span>
          <span className="row">
            <input value={barcode} onChange={e => setBarcode(e.target.value)} onKeyDown={e => e.key === 'Enter' && lookup()} />
            <button className="btn small" onClick={lookup} disabled={busy}>
              {busy ? '…' : 'Look up'}
            </button>
          </span>
        </label>
      </div>
      <label>
        <span>Note</span>
        <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} />
      </label>
      <div className="actions">
        {entry && (
          <button className="btn danger" onClick={remove}>
            Delete
          </button>
        )}
        <span className="spacer" />
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" onClick={save} disabled={!name.trim()}>
          {isNew ? 'Add' : 'Save'}
        </button>
      </div>
    </div>
  );
}

interface LogProps {
  month: string;
  onMonth: (m: string) => void;
  onOpen: (date: string, id: number) => void;
}

/** The month's food log, one card per day, newest first; a row opens it on the day. */
export function FoodLog({month, onMonth, onOpen}: LogProps) {
  const data = useQuery('foodMonth', month);
  const days = data?.days ?? [];
  const logged = days.filter(d => d.kcal > 0).length;
  return (
    <div className="foodlog">
      <div className="month-nav">
        <button className="btn" onClick={() => onMonth(addMonths(month, -1))}>
          ‹
        </button>
        <strong>{monthLabel(month)}</strong>
        <button className="btn" onClick={() => onMonth(addMonths(month, 1))}>
          ›
        </button>
        <span className="spacer" />
        {data && data.kcal > 0 && (
          <span className="muted num">
            {data.kcal} kcal · {Math.round(data.kcal / Math.max(1, logged))} kcal / day on {logged} days
          </span>
        )}
      </div>
      {data && days.length === 0 && <p className="muted">Nothing logged this month.</p>}
      {days.map(d => (
        <section key={d.date} className="card day">
          <h3>
            <span>{dayLabel(d.date)}</span>
            <span className="num total">
              {d.kcal} kcal{d.noKcal > 0 && <span className="muted"> · {d.noKcal} without kcal</span>}
            </span>
          </h3>
          <div className="list">
            {d.entries.map(e => (
              <button key={e.id} className="row" onClick={() => onOpen(d.date, e.id)}>
                <span className="t num">{clock(e.eaten_at)}</span>
                <span className="name">
                  {e.name}
                  {e.note && <span className="muted"> — {e.note}</span>}
                </span>
                <span className="meta num">{e.kcal != null ? `${e.kcal} kcal` : '—'}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
