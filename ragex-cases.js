/* RAGEX case engine: shared case definitions, verified market catalogue and drop selection. */
(() => {
  'use strict';
  const API_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json';
  const BASE_CACHE_KEY = 'ragexCs2CatalogBaseCacheV4';
  const CASES = [
    {id:'first-drop',name:'FIRST DROP',price:29,accent:'#a8ff2e',tag:'ДЛЯ НОВИЧКОВ',image:'case-first-drop.webp',desc:'Первый кейс RAGEX: простые покрытия, спокойный старт и крошечный шанс найти дорогой трофей.',jackpot:.05,near:.16,rare:2.8,mid:16,words:['consumer grade','industrial grade','mil-spec grade','urban','sand','forest','army','copper','carbon','blue spruce']},
    {id:'toxic-protocol',name:'TOXIC PROTOCOL',price:99,accent:'#a8ff2e',tag:'ТОКСИЧНАЯ СЕРИЯ',image:'case-toxic-protocol.webp',desc:'Кислотная лаборатория, опасные эксперименты и зелёные узоры.',jackpot:.07,near:.21,rare:3.3,mid:18,words:['toxic','venom','bio','acid','green','radiation','gamma','emerald','contamination','jungle','serpent','hazard','reactor','hydroponic','moss','turtle','lizard','chlorine','mecha industries']},
    {id:'neon-overdrive',name:'NEON OVERDRIVE',price:299,accent:'#db62ff',tag:'КИБЕРПАНК',image:'case-neon-overdrive.webp',desc:'Ночной мегаполис, цифровые текстуры и яркие неоновые акценты.',jackpot:.10,near:.23,rare:4.1,mid:20,words:['neon','cyber','pulse','synth','night','cortex','neural','pink','digital','holo','cyrex','asiimov','phosphor','starlight','vapor','overdrive','ultraviolet','prism','circuit','decimator']},
    {id:'blood-contract',name:'BLOOD CONTRACT',price:499,accent:'#ff525a',tag:'АГРЕССИВНЫЙ',image:'case-blood-contract.webp',desc:'Красно-чёрная коллекция с боевыми мотивами, огненными деталями и резкими контрастами.',jackpot:.12,near:.25,rare:4.5,mid:21,words:['blood','crimson','slaughter','red','dragon','fire','blaze','bloodsport','hellfire','rising sun','desolate','carnivore','copperhead','reaper','executioner','mecha industries','candy apple']},
    {id:'arctic-zero',name:'ARCTIC ZERO',price:799,accent:'#76d9ff',tag:'ХОЛОДНАЯ КОЛЛЕКЦИЯ',image:'case-arctic-zero.webp',desc:'Арктическая база, ледяные структуры и холодные металлические оттенки.',jackpot:.14,near:.27,rare:4.9,mid:22,words:['arctic','ice','frost','blue','crystal','cobalt','glacier','winter','north','doppler','blue steel','frozen','water','ocean','boreal','nightwish','blue laminate','sapphire']},
    {id:'golden-syndicate',name:'GOLDEN SYNDICATE',price:1499,accent:'#f3c65b',tag:'ПРЕМИУМ',image:'case-golden-syndicate.webp',desc:'Золотые детали, дорогая гравировка и элитная эстетика.',jackpot:.17,near:.29,rare:5.3,mid:23,words:['gold','luxury','royal','imperial','crown','jaguar','tiger','fade','marble fade','case hardened','titanium','sovereign','noble','golden','king','empress','prince','gold arabesque','medusa','wealth']},
    {id:'void-engine',name:'VOID ENGINE',price:2999,accent:'#70ff6f',tag:'ВЫСОКИЙ РИСК',image:'case-void-engine.webp',desc:'Чёрный хром, энергетические ядра и экспериментальные покрытия из лаборатории RAGEX.',jackpot:.20,near:.31,rare:5.8,mid:24,words:['void','dark','black','night','gamma','neon','obsidian','slate','nightmare','off world','phantom','shadow','abyss','imprint','rune','decay','wasteland','autotronic','black laminate','elite build']},
    {id:'last-survivor',name:'LAST SURVIVOR',price:4999,accent:'#ff6a4d',tag:'ЛЕГЕНДАРНЫЙ',image:'case-last-survivor.webp',desc:'Последняя операция: боевые текстуры, изношенный металл и редкие трофеи.',jackpot:.25,near:.35,rare:6.3,mid:25,words:['survivor','battle','war','frontside','outbreak','death','reaper','redline','bloodsport','mecha','wasteland','urban','scorched','fade','fuel injector','the empress','point disarray','necropos','containment breach']},
    {id:'black-label',name:'RAGEX: BLACK LABEL',price:9999,accent:'#a8ff2e',tag:'ЭКСКЛЮЗИВ RAGEX',image:'case-black-label.webp',desc:'Фирменная секретная коллекция с ножами, перчатками и редкими покрытиями.',jackpot:.30,near:.40,rare:6.8,mid:26,words:['black','knife','glove','butterfly','karambit','bayonet','fade','doppler','marble fade','gamma doppler','sapphire','emerald','ruby','crimson web','tiger tooth','slaughter','case hardened','howl','dragon lore']}
  ];
  let baseItems = null;
  let pricedItems = null;
  let loadingPromise = null;
  let loadError = '';

  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const rarityName = item => {
    const r = item && item.rarity;
    return String(item && (item.rarityName || item.rarityLabel) || (r && typeof r === 'object' ? r.name : r) || 'Unknown');
  };
  const rarityColor = item => {
    const name = rarityName(item).toLowerCase();
    if (name.includes('contraband') || name.includes('extraordinary')) return '#e4ae39';
    if (name.includes('covert')) return '#eb4b4b';
    if (name.includes('classified')) return '#d32ce6';
    if (name.includes('restricted')) return '#8847ff';
    if (name.includes('mil-spec')) return '#4b69ff';
    if (name.includes('industrial')) return '#5e98d9';
    if (name.includes('consumer') || name.includes('base grade')) return '#b0c3d9';
    if (name.includes('extraordinary') || name.includes('exotic')) return '#e4ae39';
    return '#89958d';
  };
  const fmt = value => Math.round(number(value)).toLocaleString('ru-RU');
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const safeImage = value => /^https:\/\/[a-z0-9.-]+\//i.test(String(value || '')) ? String(value) : '';
  function normalizeSkin(skin) {
    if (!skin || !skin.name || !safeImage(skin.image)) return null;
    return {
      ...skin,
      id: String(skin.id || skin.name),
      catalogId: String(skin.id || skin.name),
      value: 0,
      image: String(skin.image),
      weaponName: String(skin.weapon && skin.weapon.name || ''),
      categoryName: String(skin.category && skin.category.name || ''),
      rarityName: String(skin.rarity && skin.rarity.name || 'Unknown'),
      rarityColor: String(skin.rarity && skin.rarity.color || '#89958d'),
      wears: Array.isArray(skin.wears) ? skin.wears.map(w => typeof w === 'string' ? w : w && w.name).filter(Boolean) : []
    };
  }
  async function loadCatalog(force = false) {
    if (pricedItems && !force) return {ok:true, items:pricedItems, count:pricedItems.length};
    if (loadingPromise && !force) return loadingPromise;
    loadingPromise = (async () => {
      try {
        let raw = null;
        if (!force) {
          try { const cached = JSON.parse(localStorage.getItem(BASE_CACHE_KEY) || 'null'); if (Array.isArray(cached) && cached.length > 100) raw = cached; } catch (_) {}
        }
        try {
          const response = await fetch(API_URL, {mode:'cors', cache:'no-cache', credentials:'omit'});
          if (!response.ok) throw new Error('HTTP ' + response.status);
          const data = await response.json();
          if (!Array.isArray(data) || data.length < 100) throw new Error('catalog response was too small');
          raw = data.map(normalizeSkin).filter(Boolean);
          try { localStorage.setItem(BASE_CACHE_KEY, JSON.stringify(raw)); } catch (_) {}
        } catch (error) {
          if (!raw) throw error;
        }
        if (!window.RagexPricing || typeof window.RagexPricing.priceCatalog !== 'function') throw new Error('ragex-prices.js не подключён');
        const result = await window.RagexPricing.priceCatalog(raw);
        if (!result.marketReady || !Array.isArray(result.items)) throw new Error('Не удалось загрузить подтверждённые рыночные цены');
        pricedItems = result.items.filter(item => number(item.value) > 0 && item.marketPrice === true && item.demoPrice !== true && safeImage(item.image));
        if (pricedItems.length < 50) throw new Error('Недостаточно предметов с проверенными ценами');
        loadError = '';
        return {ok:true, items:pricedItems, count:pricedItems.length};
      } catch (error) {
        loadError = String(error && error.message || error);
        pricedItems = null;
        return {ok:false, items:[], count:0, error:loadError};
      } finally { loadingPromise = null; }
    })();
    return loadingPromise;
  }
  function matchesTheme(item, box) {
    const text = `${item.name || ''} ${item.weaponName || (item.weapon && item.weapon.name) || ''} ${item.categoryName || (item.category && item.category.name) || ''}`.toLowerCase();
    return Array.isArray(box.words) && box.words.some(word => text.includes(String(word).toLowerCase()));
  }
  function sampleEvenly(pool, count) {
    if (!pool.length || count < 1) return [];
    const sorted = pool.slice().sort((a,b)=>number(a.value)-number(b.value));
    if (sorted.length <= count) return sorted;
    const chosen = [];
    const used = new Set();
    for (let i=0; i<count; i++) {
      const index = Math.min(sorted.length-1, Math.floor((i + .5) * sorted.length / count));
      if (!used.has(index)) { used.add(index); chosen.push(sorted[index]); }
    }
    return chosen;
  }
  function themedEnough(pool, box, minimum=8) {
    const themed = pool.filter(item => matchesTheme(item, box));
    return themed.length >= minimum ? themed : pool;
  }
  function makeDropTable(box) {
    if (!pricedItems || !pricedItems.length) return null;
    const below = pricedItems.filter(item => number(item.value) > 0 && number(item.value) < box.price).slice().sort((a,b)=>number(a.value)-number(b.value));
    const above = pricedItems.filter(item => number(item.value) >= box.price).slice().sort((a,b)=>number(a.value)-number(b.value));
    if (!below.length) return null;
    // Divide all sub-price items into disjoint price ranks so every item shown below is genuinely eligible.
    const n = below.length;
    const a = Math.max(1, Math.floor(n * .55));
    const b = Math.max(a + (n > a ? 1 : 0), Math.floor(n * .85));
    const c = Math.max(b + (n > b ? 1 : 0), Math.floor(n * .97));
    let parts = {
      base: below.slice(0, Math.min(n,a)),
      mid: below.slice(Math.min(n,a), Math.min(n,b)),
      rare: below.slice(Math.min(n,b), Math.min(n,c)),
      near: below.slice(Math.min(n,c), n),
      jackpot: above
    };
    // Prefer theme-matching items when that category has enough candidates, while keeping the display and picker identical.
    parts.base = themedEnough(parts.base, box, 8);
    parts.mid = themedEnough(parts.mid, box, 6);
    parts.rare = themedEnough(parts.rare, box, 5);
    parts.near = themedEnough(parts.near, box, 3);
    parts.jackpot = themedEnough(parts.jackpot, box, 6);
    const limits = {base:14, mid:12, rare:10, near:8, jackpot:16};
    Object.keys(parts).forEach(key => { parts[key] = sampleEvenly(parts[key], limits[key]); });
    // If a low-price rank is empty, move its probability to a cheaper available tier, never to a profitable tier.
    if (!parts.base.length) parts.base = sampleEvenly(below, 14);
    return parts;
  }
  const rarityWeight = item => {
    const r = rarityName(item).toLowerCase();
    if (r.includes('consumer') || r.includes('base')) return 12;
    if (r.includes('industrial')) return 9;
    if (r.includes('mil-spec')) return 7;
    if (r.includes('high grade')) return 6;
    if (r.includes('restricted')) return 4.2;
    if (r.includes('classified')) return 2.2;
    if (r.includes('covert')) return .9;
    if (r.includes('extraordinary') || r.includes('contraband')) return .22;
    return 3;
  };
  function weightedPick(pool) {
    if (!pool || !pool.length) return null;
    const weights = pool.map(item => rarityWeight(item) / Math.pow(Math.max(1,number(item.value)),.28));
    const total = weights.reduce((sum, value)=>sum+value,0);
    let roll = Math.random()*total;
    for (let index=0; index<pool.length; index++) { roll -= weights[index]; if (roll <= 0) return pool[index]; }
    return pool[pool.length-1];
  }
  function pickReward(box, table) {
    if (!table) return null;
    const roll = Math.random()*100;
    const thresholds = [
      ['jackpot', box.jackpot],
      ['near', box.near],
      ['rare', box.rare],
      ['mid', box.mid]
    ];
    let cumulative = 0, selected = 'base';
    for (const [bucket, chance] of thresholds) { cumulative += chance; if (roll < cumulative) { selected = bucket; break; } }
    if (table[selected] && table[selected].length) return weightedPick(table[selected]);
    const fallback = {jackpot:['near','rare','mid','base'],near:['rare','mid','base'],rare:['mid','base'],mid:['base'],base:[]};
    for (const bucket of fallback[selected] || []) if (table[bucket] && table[bucket].length) return weightedPick(table[bucket]);
    return table.base && table.base.length ? weightedPick(table.base) : null;
  }
  function allDropItems(table) {
    if (!table) return [];
    const seen = new Set(), result = [];
    for (const group of ['base','mid','rare','near','jackpot']) for (const item of table[group] || []) {
      const key = String(item.marketHashName || item.id || item.name);
      if (!seen.has(key)) { seen.add(key); result.push({...item, dropGroup:group}); }
    }
    return result;
  }
  window.RagexCaseSystem = {
    cases: CASES,
    loadCatalog,
    getCatalog: () => pricedItems || [],
    makeDropTable,
    pickReward,
    allDropItems,
    fmt,
    escapeHTML,
    safeImage,
    rarityName,
    rarityColor,
    getError: () => loadError
  };
})();
