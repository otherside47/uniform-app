import { sb } from '../shared/auth.js';
import { pick, t } from '../shared/i18n.js';

// Shared reference data for the admin app (loaded once, reloaded after edits).
export const S = {
  items: [], itemById: new Map(),
  sizeTypes: [], typeByCode: new Map(),
  people: [], byId: new Map(), guards: [], guardByNo: new Map(),
  names: new Map(),
  settings: {}, bases: [], baseById: new Map(), seasons: [],
  me: null, loaded: false,
};

// unwrap { data, error }
export async function db(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

export async function loadRefs() {
  const [items, types, profiles, names, settings, bases, seasons] = await Promise.all([
    db(sb.from('items').select('*').order('name_ru')),
    db(sb.from('size_types').select('*').order('sort_order')),
    db(sb.from('profiles').select('id,role,guard_no,login,active,is_owner,language,hired_on,must_change_password,deactivated_note')),
    db(sb.from('profile_names').select('id,full_name')),
    db(sb.from('app_settings').select('*')),
    db(sb.from('order_bases').select('*').order('sort_order')),
    db(sb.from('season_config').select('*')),
  ]);
  S.items = items; S.itemById = new Map(items.map((x) => [x.id, x]));
  S.sizeTypes = types; S.typeByCode = new Map(types.map((x) => [x.code, x]));
  S.names = new Map(names.map((x) => [x.id, x.full_name]));
  S.people = profiles; S.byId = new Map(profiles.map((x) => [x.id, x]));
  S.guards = profiles.filter((p) => p.role === 'guard').sort((a, b) => a.guard_no - b.guard_no);
  S.guardByNo = new Map(S.guards.map((g) => [g.guard_no, g]));
  S.settings = Object.fromEntries(settings.map((x) => [x.key, x.value]));
  S.bases = bases; S.baseById = new Map(bases.map((x) => [x.id, x]));
  S.seasons = seasons;
  S.loaded = true;
}

export const num = (k, d = 0) => (S.settings[k] !== undefined ? Number(S.settings[k]) : d);
export const limitUsd = () => num('fy_limit_usd', 800);
export const landDays = () => num('land_days', 180);
export const airDays = () => num('air_days', 30);
export const thresholds = () => ({ green: num('budget_green_max', 60), yellow: num('budget_yellow_max', 80), rust: num('budget_rust_max', 95) });

export const itemName = (id) => { const it = S.itemById.get(id); return it ? pick(it) : '?'; };
export const typeName = (code) => { const x = S.typeByCode.get(code); return x ? pick(x) : code; };
export const guardNo = (id) => { const p = S.byId.get(id); return p ? p.guard_no : null; };
export const personName = (id) => S.names.get(id) || '';
export const seasonName = (s) => t(`season.${s}`);

export function linesText(lines) {
  return lines.map((l) => `${itemName(l.item_id)} ${l.size} ×${l.qty}`).join('; ');
}

export const levelKey = (item, size) => `${item}|${size}`;
export function levelsMap(rows) { return new Map(rows.map((r) => [levelKey(r.item_id, r.size), r])); }
