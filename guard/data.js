import { sb } from '../shared/auth.js';
import { pick, t } from '../shared/i18n.js';

export const G = { items: [], itemById: new Map(), types: [], typeByCode: new Map(), sizes: new Map(), seasons: [], me: null };

export async function db(p) { const { data, error } = await p; if (error) throw error; return data; }

export async function loadRefs(profile) {
  const [items, types, sizes, seasons] = await Promise.all([
    db(sb.from('items').select('*').eq('active', true).order('name_ru')),
    db(sb.from('size_types').select('*').order('sort_order')),
    db(sb.from('guard_sizes').select('*').eq('guard_id', profile.id)),
    db(sb.from('season_config').select('*')),
  ]);
  G.items = items; G.itemById = new Map(items.map((x) => [x.id, x]));
  G.types = types; G.typeByCode = new Map(types.map((x) => [x.code, x]));
  G.sizes = new Map(sizes.map((x) => [x.size_type, x.value]));
  G.seasons = seasons; G.me = profile;
}
export const itemName = (id) => { const i = G.itemById.get(id); return i ? pick(i) : '?'; };
export const typeName = (code) => { const x = G.typeByCode.get(code); return x ? pick(x) : code; };
export const seasonName = (s) => t(`season.${s}`);
// a size type with a single option ("one size") needs no input
export const mySize = (item) => {
  const own = G.sizes.get(item.size_type);
  if (own) return own;
  const type = G.typeByCode.get(item.size_type);
  return type && type.options.length === 1 ? type.options[0] : '';
};
export const linesText = (lines) => lines.map((l) => `${itemName(l.item_id)}${l.size === 'ONE' ? '' : ` ${l.size}`} ×${l.qty}`).join('; ');
