/**
 * data.js — Runtime data layer
 *
 * - Loads `data/hdi.csv` at startup
 * - Builds HDI indexes by ISO-3
 * - Keeps alias resolver (ISO, EN/ES names, optional extra aliases)
 */
const Data = (() => {
  const HDI_DATA = [];
  const HDI_BY_ISO3 = {};
  const NO_HDI_DATA = [];
  const NO_HDI_BY_ISO3 = {};
  const INCOME_DATA = [];           // rows with income group only
  const INCOME_BY_ISO3 = {};
  const COUNTRY_DATA = [];          // union (HDI ∪ income), selectable, sorted by name
  const COUNTRY_BY_ISO3 = {};       // union: { iso3, country, hdi, hdiYear, incomeGroup, incomeYear }
  const ALIAS_MAP = new Map();
  let _aliasesByIso3 = {};

  // Canonical income group order (low → high). Mirrors update_country_data.py.
  const INCOME_GROUP_ORDER = ['low', 'lower_middle', 'upper_middle', 'high'];

  let _meta = {
    source: 'https://ourworldindata.org/grapher/human-development-index',
    generated_at_utc: null,
    latest_year_global: null,
    countries: 0,
    indicators: null,
  };

  function normalize(s) {
    return String(s ?? '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  function _parseCsvLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    values.push(current);
    return values;
  }

  function _buildAliasMap(extraAliasConfig = {}) {
    ALIAS_MAP.clear();

    const registerCountry = (iso3, country) => {
      if (!iso3) return;
      ALIAS_MAP.set(normalize(iso3), iso3);
      if (country) {
        ALIAS_MAP.set(normalize(country), iso3);
        ALIAS_MAP.set(normalize(country.replace(/\s*\(country\)\s*/i, '')), iso3);
        ALIAS_MAP.set(normalize(country.replace(/&/g, 'and')), iso3);
      }
    };

    for (const row of HDI_DATA) registerCountry(row.iso3, row.country);
    for (const row of INCOME_DATA) registerCountry(row.iso3, row.country);

    for (const [iso3Raw, entry] of Object.entries(extraAliasConfig)) {
      const iso = String(iso3Raw ?? '').trim().toUpperCase();
      if (!iso) continue;
      ALIAS_MAP.set(normalize(iso), iso);
      // Aliases JSON stores ISO3 → [name, ISO2, alt names...] (array form),
      // but tolerate the older { aliases: [...] } object form too.
      const aliases = Array.isArray(entry)
        ? entry
        : (Array.isArray(entry?.aliases) ? entry.aliases : []);
      for (const alias of aliases) {
        ALIAS_MAP.set(normalize(alias), iso);
      }
    }
  }

  function _candidateKeys(raw) {
    const original = String(raw ?? '').trim();
    if (!original) return [];

    const forms = new Set([original]);
    const articlePattern = '(el|la|los|las|the)';

    const leading = original.match(new RegExp(`^${articlePattern}\\s+(.+)$`, 'i'));
    if (leading) {
      const base = leading[2].trim();
      forms.add(base);
      forms.add(`${base} (${leading[1]})`);
      forms.add(`${base}, ${leading[1]}`);
    }

    const parenthetical = original.match(new RegExp(`^(.+?)\\s*\\(${articlePattern}\\)\\s*$`, 'i'));
    if (parenthetical) {
      const base = parenthetical[1].trim();
      const article = parenthetical[2].trim();
      forms.add(base);
      forms.add(`${article} ${base}`);
      forms.add(`${base}, ${article}`);
    }

    const commaArticle = original.match(new RegExp(`^(.+?),\\s*${articlePattern}\\s*$`, 'i'));
    if (commaArticle) {
      const base = commaArticle[1].trim();
      const article = commaArticle[2].trim();
      forms.add(base);
      forms.add(`${article} ${base}`);
      forms.add(`${base} (${article})`);
    }

    return Array.from(forms)
      .map(normalize)
      .filter(Boolean);
  }

  async function _loadAliasesConfig() {
    try {
      const res = await fetch('data/country_aliases.json');
      if (!res.ok) return {};
      return await res.json();
    } catch {
      return {};
    }
  }

  async function _loadMeta() {
    try {
      const res = await fetch('data/metadata.json');
      if (!res.ok) return;
      const json = await res.json();
      _meta = { ..._meta, ...json };
    } catch {
      // keep defaults
    }
  }

  async function _loadHdi() {
    const res = await fetch('data/hdi.csv');
    if (!res.ok) throw new Error('Unable to load data/hdi.csv');
    const raw = await res.text();
    const lines = raw.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) throw new Error('hdi.csv has no data rows');

    const header = _parseCsvLine(lines[0]).map(h => normalize(h));
    const idxCountry = header.indexOf('country');
    const idxIso = header.indexOf('isocode');
    const idxHdi = header.indexOf('humandevelopmentindex');
    const idxYear = header.indexOf('year');
    if (idxCountry < 0 || idxIso < 0 || idxHdi < 0) {
      throw new Error('hdi.csv missing required columns');
    }

    for (let i = 1; i < lines.length; i++) {
      const cells = _parseCsvLine(lines[i]);
      const country = (cells[idxCountry] ?? '').trim();
      const iso3 = (cells[idxIso] ?? '').trim().toUpperCase();
      const hdi = Number((cells[idxHdi] ?? '').trim());
      const year = idxYear >= 0 ? Number((cells[idxYear] ?? '').trim()) : NaN;
      if (!country || !iso3 || Number.isNaN(hdi)) continue;
      const row = { country, iso3, hdi, year: Number.isFinite(year) ? year : null };
      HDI_DATA.push(row);
      HDI_BY_ISO3[iso3] = row;
    }
    HDI_DATA.sort((a, b) => a.country.localeCompare(b.country));
  }

  async function _loadIncomeGroups() {
    let res;
    try {
      res = await fetch('data/income_groups.csv');
    } catch {
      return;
    }
    if (!res.ok) return;
    const raw = await res.text();
    const lines = raw.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return;

    const header = _parseCsvLine(lines[0]).map(h => normalize(h));
    const idxCountry = header.indexOf('country');
    const idxIso = header.indexOf('isocode');
    const idxGroup = header.indexOf('incomegroup');
    const idxLabel = header.indexOf('incomegrouplabel');
    const idxYear = header.indexOf('year');
    if (idxCountry < 0 || idxIso < 0 || idxGroup < 0) return;

    for (let i = 1; i < lines.length; i++) {
      const cells = _parseCsvLine(lines[i]);
      const country = (cells[idxCountry] ?? '').trim();
      const iso3 = (cells[idxIso] ?? '').trim().toUpperCase();
      const group = (cells[idxGroup] ?? '').trim();
      const label = idxLabel >= 0 ? (cells[idxLabel] ?? '').trim() : '';
      const year = idxYear >= 0 ? Number((cells[idxYear] ?? '').trim()) : NaN;
      if (!country || !iso3 || !group) continue;
      const row = {
        country,
        iso3,
        incomeGroup: group,
        incomeGroupLabel: label || group,
        year: Number.isFinite(year) ? year : null,
      };
      INCOME_DATA.push(row);
      INCOME_BY_ISO3[iso3] = row;
    }
    INCOME_DATA.sort((a, b) => a.country.localeCompare(b.country));
  }

  // Selectable universe = HDI countries (UNDP sovereign states, ~193),
  // enriched with income-group data when available. Small dependencies
  // and non-sovereign territories that only appear in the World Bank
  // income table (e.g. MAF, HKG, PRI) are intentionally excluded.
  function _buildCountryUnion() {
    COUNTRY_DATA.length = 0;
    Object.keys(COUNTRY_BY_ISO3).forEach(k => delete COUNTRY_BY_ISO3[k]);
    for (const iso3 of Object.keys(HDI_BY_ISO3)) {
      const hdiRow = HDI_BY_ISO3[iso3];
      const incRow = INCOME_BY_ISO3[iso3];
      const entry = {
        iso3,
        country: hdiRow.country,
        hdi: hdiRow.hdi,
        hdiYear: hdiRow.year ?? null,
        incomeGroup: incRow?.incomeGroup ?? null,
        incomeGroupLabel: incRow?.incomeGroupLabel ?? null,
        incomeYear: incRow?.year ?? null,
      };
      COUNTRY_BY_ISO3[iso3] = entry;
      COUNTRY_DATA.push(entry);
    }
    COUNTRY_DATA.sort((a, b) => a.country.localeCompare(b.country));
  }

  async function init() {
    HDI_DATA.length = 0;
    Object.keys(HDI_BY_ISO3).forEach(k => delete HDI_BY_ISO3[k]);
    NO_HDI_DATA.length = 0;
    Object.keys(NO_HDI_BY_ISO3).forEach(k => delete NO_HDI_BY_ISO3[k]);
    INCOME_DATA.length = 0;
    Object.keys(INCOME_BY_ISO3).forEach(k => delete INCOME_BY_ISO3[k]);

    await _loadHdi();
    await _loadIncomeGroups();

    const extraAliases = await _loadAliasesConfig();
    _aliasesByIso3 = extraAliases;

    for (const [iso3Raw, entry] of Object.entries(extraAliases)) {
      const iso3 = String(iso3Raw || '').toUpperCase().trim();
      if (!iso3 || HDI_BY_ISO3[iso3] || INCOME_BY_ISO3[iso3]) continue;
      const aliasNames = Array.isArray(entry) ? entry : (Array.isArray(entry?.aliases) ? entry.aliases : []);
      const country = String(entry?.display_en || aliasNames[0] || '').trim() || iso3;
      const row = {
        country,
        iso3,
        hdi: null,
        year: null,
        noData: true,
      };
      NO_HDI_DATA.push(row);
      NO_HDI_BY_ISO3[iso3] = row;
    }
    _buildAliasMap(extraAliases);
    NO_HDI_DATA.sort((a, b) => a.country.localeCompare(b.country));

    _buildCountryUnion();

    await _loadMeta();
    if (!_meta.countries) _meta.countries = HDI_DATA.length;
    if (!_meta.latest_year_global) {
      const years = HDI_DATA.map(d => d.year).filter(Number.isFinite);
      _meta.latest_year_global = years.length ? Math.max(...years) : null;
    }
  }

  function resolve(raw) {
    const keys = _candidateKeys(raw);
    if (!keys.length) return null;

    for (const key of keys) {
      if (ALIAS_MAP.has(key)) return ALIAS_MAP.get(key);
    }

    for (const key of keys) {
      if (key.length < 5) continue;
      for (const [alias, iso3] of ALIAS_MAP.entries()) {
        if (alias.length >= 5 && alias.startsWith(key)) return iso3;
      }
    }
    return null;
  }

  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    const dp = Array.from({ length: m + 1 }, (_, i) => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[m][n];
  }

  function suggest(raw) {
    const key = normalize(raw);
    if (!key) return null;

    let bestIso = null;
    let bestDist = Number.POSITIVE_INFINITY;
    let bestAliasLength = 0;

    for (const [alias, iso3] of ALIAS_MAP.entries()) {
      if (alias.length < 4) continue;
      const dist = levenshtein(key, alias);
      const maxLen = Math.max(key.length, alias.length);
      const threshold = Math.max(1, Math.floor(maxLen * 0.34));
      if (dist > threshold) continue;

      if (dist < bestDist || (dist === bestDist && alias.length > bestAliasLength)) {
        bestDist = dist;
        bestIso = iso3;
        bestAliasLength = alias.length;
      }
    }

    if (!bestIso) return null;
    const cfg = _aliasesByIso3?.[bestIso];
    if (cfg?.display_en) return cfg.display_en;
    return HDI_BY_ISO3[bestIso]?.country ?? NO_HDI_BY_ISO3[bestIso]?.country ?? null;
  }

  function getMeta() {
    return _meta;
  }

  function getIncomeMeta() {
    return _meta?.indicators?.income_groups ?? null;
  }

  function getHdiMeta() {
    return _meta?.indicators?.hdi ?? {
      source: _meta?.source ?? null,
      latest_year_global: _meta?.latest_year_global ?? null,
      countries: _meta?.countries ?? HDI_DATA.length,
    };
  }

  function getCountryLabel(iso3, lang = 'en') {
    const row = HDI_BY_ISO3[iso3];
    const noDataRow = NO_HDI_BY_ISO3[iso3];
    const fallbackRow = row || noDataRow;
    const cfg = _aliasesByIso3?.[iso3];

    if (!fallbackRow && !cfg) return iso3;
    if (lang === 'es' && cfg?.display_es) return cfg.display_es;
    if (cfg?.display_en) return cfg.display_en;

    if (!fallbackRow) return iso3;
    return fallbackRow.country;
  }

  return {
    HDI_DATA,
    HDI_BY_ISO3,
    NO_HDI_DATA,
    NO_HDI_BY_ISO3,
    INCOME_DATA,
    INCOME_BY_ISO3,
    COUNTRY_DATA,
    COUNTRY_BY_ISO3,
    INCOME_GROUP_ORDER,
    normalize,
    init,
    resolve,
    suggest,
    getMeta,
    getHdiMeta,
    getIncomeMeta,
    getCountryLabel,
  };
})();
