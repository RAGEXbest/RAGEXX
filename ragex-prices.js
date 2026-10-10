/* RAGEX Market Pricing
   Uses Steam Community Market price snapshots published in EUR by 17mafo/cs-price-tracker.
   Converts EUR to RUB using the latest daily EUR/RUB rate from the CBR-XML-Daily feed.
   In RAGEX demo economy: 1 star = 1 RUB. Prices are rounded to whole rubles/stars.
*/
(() => {
  'use strict';

  const PRICE_URL = 'https://raw.githubusercontent.com/17mafo/cs-price-tracker/main/static/prices/latest.json';
  const FX_URL = 'https://www.cbr-xml-daily.ru/daily_json.js';
  const INDEX_CACHE_KEY = 'ragexCs2MarketPriceIndexV2';
  const FX_CACHE_KEY = 'ragexEurRubRateV1';
  const PRICE_TTL = 18 * 60 * 60 * 1000;
  const FX_TTL = 8 * 60 * 60 * 1000;
  // Latest CBR rate available on 2026-10-11 (weekend): 1 EUR = 94.9745 RUB.
  const FALLBACK_EUR_RUB = 94.9745;
  const WEAR_NAMES = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];
  let memoryCache = null;

  function readStorage(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); }
    catch (_) { return null; }
  }

  function parseMarketName(value) {
    let name = String(value || '').trim();
    const wearMatch = name.match(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i);
    const wear = wearMatch ? WEAR_NAMES.find(w => w.toLowerCase() === wearMatch[1].toLowerCase()) || wearMatch[1] : '';
    if (wearMatch) name = name.slice(0, wearMatch.index).trim();
    const stattrak = /stattrak/i.test(name);
    const souvenir = /souvenir/i.test(name);
    name = name
      .replace(/StatTrak™?/gi, '')
      .replace(/Souvenir/gi, '')
      .replace(/[★™]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const base = name.toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
    return { base, wear, stattrak, souvenir, cleanName: name };
  }

  function qualityKey(parsed) {
    return `${parsed.base}|${parsed.stattrak ? 1 : 0}|${parsed.souvenir ? 1 : 0}`;
  }

  function wearKey(wear) {
    return String(wear || '').trim().toLowerCase() || '__no_wear__';
  }

  function itemMeta(item) {
    const parsed = parseMarketName(item && (item.marketHashName || item.name));
    const stattrak = !!(item && item.stattrak) || parsed.stattrak;
    const souvenir = !!(item && item.souvenir) || parsed.souvenir;
    return {
      base: parsed.base,
      stattrak,
      souvenir,
      wear: String((item && (item.wearName || item.wear)) || parsed.wear || ''),
      original: item && item.marketHashName ? String(item.marketHashName) : String(item && item.name || ''),
      parsed
    };
  }

  async function loadEurRub() {
    const cached = readStorage(FX_CACHE_KEY);
    if (cached && Number(cached.rate) > 0 && Date.now() - Number(cached.savedAt || 0) < FX_TTL) {
      return { rate: Number(cached.rate), date: cached.date || '', source: 'cached-cbr' };
    }
    try {
      const response = await fetch(FX_URL, { mode: 'cors', cache: 'no-cache', credentials: 'omit' });
      if (!response.ok) throw new Error(`FX HTTP ${response.status}`);
      const body = await response.text();
      const data = JSON.parse(body);
      const eur = data && data.Valute && data.Valute.EUR;
      const rate = Number(eur && eur.Value) / Math.max(1, Number(eur && eur.Nominal) || 1);
      if (!Number.isFinite(rate) || rate <= 0) throw new Error('FX rate not found');
      const result = { rate, date: data.Date || data.Timestamp || '', savedAt: Date.now() };
      try { localStorage.setItem(FX_CACHE_KEY, JSON.stringify(result)); } catch (_) {}
      return { rate, date: result.date, source: 'live-cbr' };
    } catch (error) {
      if (cached && Number(cached.rate) > 0) {
        return { rate: Number(cached.rate), date: cached.date || '', source: 'stale-cbr' };
      }
      return { rate: FALLBACK_EUR_RUB, date: '2026-10-10', source: 'fallback-cbr' };
    }
  }

  function wantedQualityKeys(items) {
    const keys = new Set();
    for (const item of items || []) {
      const meta = itemMeta(item);
      if (meta.base) keys.add(qualityKey(meta));
    }
    return keys;
  }

  function cacheCovers(cache, wanted) {
    if (!cache || !Array.isArray(cache.coverage) || !cache.records) return false;
    const cover = new Set(cache.coverage);
    for (const key of wanted) if (!cover.has(key)) return false;
    return true;
  }

  async function loadPriceIndex(items, minRecords = 1) {
    const wanted = wantedQualityKeys(items);
    const cached = readStorage(INDEX_CACHE_KEY);
    const fresh = cached && Date.now() - Number(cached.savedAt || 0) < PRICE_TTL;
    if (fresh && cacheCovers(cached, wanted)) {
      const fx = await loadEurRub();
      const records = Array.isArray(cached.records) ? cached.records : [];
      return { records, fx, updatedAt: cached.sourceUpdatedAt || cached.savedAt, stale: false, fromCache: true, coverage: cached.coverage || [] };
    }

    const fx = await loadEurRub();
    try {
      const response = await fetch(PRICE_URL, { mode: 'cors', cache: 'no-cache', credentials: 'omit' });
      if (!response.ok) throw new Error(`Price API HTTP ${response.status}`);
      const data = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid price data');
      const records = [];
      let latestSourceDate = '';
      for (const [marketName, rawValue] of Object.entries(data)) {
        const parsed = parseMarketName(marketName);
        const qKey = qualityKey(parsed);
        if (!wanted.has(qKey)) continue;
        const eur = Number(rawValue && typeof rawValue === 'object' ? rawValue.price : rawValue);
        if (!Number.isFinite(eur) || eur <= 0) continue;
        const itemDate = String(rawValue && typeof rawValue === 'object' ? rawValue.date || '' : '');
        if (itemDate && itemDate > latestSourceDate) latestSourceDate = itemDate;
        records.push({
          marketName,
          date: itemDate,
          base: parsed.base,
          wear: parsed.wear,
          stattrak: parsed.stattrak,
          souvenir: parsed.souvenir,
          eur
        });
      }
      if (records.length < minRecords) throw new Error(`Too few matching prices (${records.length})`);
      const result = {
        savedAt: Date.now(),
        sourceUpdatedAt: latestSourceDate || new Date().toISOString(),
        coverage: Array.from(wanted),
        records
      };
      try { localStorage.setItem(INDEX_CACHE_KEY, JSON.stringify(result)); } catch (_) {}
      memoryCache = result;
      return { records, fx, updatedAt: result.sourceUpdatedAt, stale: false, fromCache: false, coverage: result.coverage };
    } catch (error) {
      const usable = cached && Array.isArray(cached.records) && cached.records.length >= 50 && cacheCovers(cached, wanted);
      if (usable) {
        return {
          records: cached.records,
          fx,
          updatedAt: cached.sourceUpdatedAt || cached.savedAt,
          stale: true,
          fromCache: true,
          coverage: cached.coverage || [],
          error: String(error && error.message || error)
        };
      }
      throw error;
    }
  }

  function indexRecords(records) {
    const index = new Map();
    for (const rec of records || []) {
      const key = `${rec.base}|${rec.stattrak ? 1 : 0}|${rec.souvenir ? 1 : 0}|${wearKey(rec.wear)}`;
      const prev = index.get(key);
      // If duplicate names exist, choose the lowest recorded Steam listing.
      if (!prev || Number(rec.eur) < Number(prev.eur)) index.set(key, rec);
    }
    return index;
  }

  function priceRub(rec, rate) {
    const value = Math.round(Number(rec && rec.eur) * Number(rate));
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function displayBaseName(item, stattrak, souvenir) {
    let name = String(item && item.name || '').replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i, '').trim();
    if (stattrak && !/stattrak/i.test(name)) name = `StatTrak™ ${name}`;
    if (souvenir && !/souvenir/i.test(name)) name = `Souvenir ${name}`;
    return name;
  }

  function expandCatalog(baseItems, marketIndex, rate) {
    const output = [];
    for (const item of baseItems || []) {
      const meta = itemMeta(item);
      if (!meta.base) continue;
      const q = `${meta.base}|${meta.stattrak ? 1 : 0}|${meta.souvenir ? 1 : 0}`;
      const wears = Array.isArray(item.wears) ? item.wears.filter(Boolean) : [];
      const baseName = displayBaseName(item, meta.stattrak, meta.souvenir);
      const variants = wears.length ? wears : [''];
      let found = 0;
      for (const wear of variants) {
        const key = `${q}|${wearKey(wear)}`;
        const rec = marketIndex.get(key);
        if (!rec) continue;
        const value = priceRub(rec, rate);
        if (!value) continue;
        const displayName = wear ? `${baseName} (${wear})` : baseName;
        output.push({
          ...item,
          id: `${String(item.id || item.catalogId || item.name)}-market-${wearKey(wear).replace(/[^a-z0-9]+/g, '-')}`,
          catalogId: item.catalogId || item.id,
          name: displayName,
          value,
          image: item.image,
          wearName: wear || '',
          marketHashName: rec.marketName,
          marketPriceEur: Number(rec.eur),
          marketPriceRub: value,
          marketPrice: true,
          priceCurrency: 'RUB',
          priceUpdatedAt: null,
          marketPriceSource: 'Steam Community Market',
          demoPrice: false,
          stattrak: meta.stattrak,
          souvenir: meta.souvenir
        });
        found++;
      }
      // Wearless catalog items occasionally exist (not common for weapon finishes).
      if (!found && !wears.length) {
        const rec = marketIndex.get(`${q}|__no_wear__`);
        const value = priceRub(rec, rate);
        if (rec && value) output.push({ ...item, name: baseName, value, marketHashName: rec.marketName, marketPriceEur: Number(rec.eur), marketPriceRub: value, marketPrice: true, priceCurrency: 'RUB', marketPriceSource: 'Steam Community Market', demoPrice: false });
      }
    }
    // Some wear variants may not have a tracked Steam price. Never invent a market price for them.
    const seen = new Set();
    return output.filter(item => {
      const key = String(item.marketHashName || item.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function priceCatalog(baseItems) {
    try {
      const data = await loadPriceIndex(baseItems, 50);
      const index = indexRecords(data.records);
      const items = expandCatalog(baseItems, index, data.fx.rate);
      if (items.length < 50) throw new Error(`Only ${items.length} catalog variants received prices`);
      for (const item of items) item.priceUpdatedAt = data.updatedAt || '';
      return {
        items,
        marketReady: true,
        count: items.length,
        eurRub: data.fx.rate,
        fxDate: data.fx.date,
        fxSource: data.fx.source,
        updatedAt: data.updatedAt,
        stale: !!data.stale,
        fromCache: !!data.fromCache
      };
    } catch (error) {
      console.warn('RAGEX market pricing unavailable:', error);
      return { items: baseItems || [], marketReady: false, count: 0, error: String(error && error.message || error) };
    }
  }

  async function priceInventory(items) {
    if (!Array.isArray(items) || !items.length) return { items: [], marketReady: false, count: 0 };
    try {
      const data = await loadPriceIndex(items, 1);
      const index = indexRecords(data.records);
      let count = 0;
      const updated = items.map(item => {
        const meta = itemMeta(item);
        if (!meta.base) return item;
        const q = `${meta.base}|${meta.stattrak ? 1 : 0}|${meta.souvenir ? 1 : 0}`;
        let rec = null;
        if (meta.wear) rec = index.get(`${q}|${wearKey(meta.wear)}`) || null;
        if (!rec && meta.original) {
          const parsed = parseMarketName(meta.original);
          if (parsed.wear) rec = index.get(`${q}|${wearKey(parsed.wear)}`) || null;
        }
        if (!rec) {
          const options = data.records.filter(r => r.base === meta.base && !!r.stattrak === meta.stattrak && !!r.souvenir === meta.souvenir);
          if (options.length) rec = options.reduce((min, next) => !min || Number(next.eur) < Number(min.eur) ? next : min, null);
        }
        if (!rec) return item;
        const value = priceRub(rec, data.fx.rate);
        if (!value) return item;
        count++;
        const parsedName = parseMarketName(item.name || '');
        const displayName = (meta.wear || parsedName.wear) ? item.name : rec.marketName;
        return {
          ...item,
          name: displayName,
          value,
          marketHashName: rec.marketName,
          marketPriceEur: Number(rec.eur),
          marketPriceRub: value,
          marketPrice: true,
          priceCurrency: 'RUB',
          priceUpdatedAt: data.updatedAt || '',
          marketPriceSource: 'Steam Community Market',
          demoPrice: false,
          wearName: meta.wear || rec.wear || ''
        };
      });
      return { items: updated, marketReady: count > 0, count, eurRub: data.fx.rate, fxDate: data.fx.date, stale: !!data.stale };
    } catch (error) {
      console.warn('RAGEX inventory prices unavailable:', error);
      return { items, marketReady: false, count: 0, error: String(error && error.message || error) };
    }
  }

  window.RagexPricing = {
    priceCatalog,
    priceInventory,
    getSources: () => ({ priceUrl: PRICE_URL, fxUrl: FX_URL }),
    fallbackRate: FALLBACK_EUR_RUB
  };
})();
