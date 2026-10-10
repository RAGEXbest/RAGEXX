
/* RAGEX shared demo economy */
(() => {
  'use strict';

  const BALANCE_KEY = 'ragexBalance';
  const INVENTORY_KEY = 'ragexInventory';
  const START_BALANCE = 5000;

  const safeRead = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  };

  const readBalance = () => {
    try {
      const raw = localStorage.getItem(BALANCE_KEY);

      if (raw === null) {
        localStorage.setItem(BALANCE_KEY, String(START_BALANCE));
        return START_BALANCE;
      }

      const value = Number(raw);
      return Number.isFinite(value) && value >= 0
        ? Math.floor(value)
        : 0;
    } catch (_) {
      return START_BALANCE;
    }
  };

  const readInventory = () => {
    const value = safeRead(INVENTORY_KEY, []);

    return Array.isArray(value)
      ? value.filter(item =>
          item &&
          item.demo !== true &&
          typeof item.name === 'string' &&
          Number.isFinite(Number(item.value))
        )
      : [];
  };

  const emit = () => {
    window.dispatchEvent(
      new CustomEvent('ragex:change', {
        detail: {
          balance: readBalance(),
          inventory: readInventory()
        }
      })
    );
  };

  const setBalance = amount => {
    const value = Math.max(0, Math.floor(Number(amount) || 0));

    try {
      localStorage.setItem(BALANCE_KEY, String(value));
    } catch (_) {}

    emit();
    return value;
  };

  const addBalance = amount =>
    setBalance(
      readBalance() + Math.max(0, Math.floor(Number(amount) || 0))
    );

  const spendBalance = amount => {
    const cost = Math.max(0, Math.floor(Number(amount) || 0));

    if (readBalance() < cost) return false;

    setBalance(readBalance() - cost);
    return true;
  };

  const setInventory = items => {
    const cleaned = (Array.isArray(items) ? items : []).filter(item =>
      item &&
      item.demo !== true &&
      typeof item.name === 'string' &&
      Number.isFinite(Number(item.value))
    );

    try {
      localStorage.setItem(INVENTORY_KEY, JSON.stringify(cleaned));
    } catch (_) {}

    emit();
    return cleaned;
  };

  const addItem = item => {
    const items = readInventory();

    items.push({
      ...item,
      demo: false,
      id: item.id ?? (Date.now() + Math.random())
    });

    return setInventory(items);
  };

  const removeItem = id =>
    setInventory(
      readInventory().filter(item => String(item.id) !== String(id))
    );

  const sellItem = (id, rate = 0.7) => {
    const items = readInventory();
    const index = items.findIndex(
      item => String(item.id) === String(id)
    );

    if (index < 0) {
      return { ok: false, reason: 'not-found' };
    }

    const [item] = items.splice(index, 1);

    const payout = Math.max(
      0,
      Math.floor(
        Number(item.value) *
        Math.max(0, Math.min(1, Number(rate) || 0))
      )
    );

    setInventory(items);
    setBalance(readBalance() + payout);

    return { ok: true, item, payout };
  };

  window.RagexStore = {
    getBalance: readBalance,
    setBalance,
    addBalance,
    spendBalance,
    getInventory: readInventory,
    setInventory,
    addItem,
    removeItem,
    sellItem,
    startBalance: START_BALANCE
  };

  window.addEventListener('storage', event => {
    if (
      !event.key ||
      [BALANCE_KEY, INVENTORY_KEY].includes(event.key)
    ) {
      emit();
    }
  });
})();
