/* RAGEX — единый баланс и инвентарь */
(() => {
  'use strict';

  const BALANCE_KEY = 'ragexBalance';
  const INVENTORY_KEY = 'ragexInventory';
  const START_BALANCE = 5000;

  function readJSON(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  function getBalance() {
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
    } catch (error) {
      return START_BALANCE;
    }
  }

  function getInventory() {
    const items = readJSON(INVENTORY_KEY, []);
    if (!Array.isArray(items)) return [];

    let changed = false;

    const normalized = items
      .filter(item =>
        item &&
        item.demo !== true &&
        typeof item.name === 'string' &&
        Number.isFinite(Number(item.value))
      )
      .map((item, index) => {
        if (item.id !== undefined && item.id !== null) {
          return item;
        }

        changed = true;

        return {
          ...item,
          id: `legacy-${Date.now()}-${index}-${Math.random()
            .toString(36).slice(2, 8)}`
        };
      });

    if (changed) {
      try {
        localStorage.setItem(
          INVENTORY_KEY,
          JSON.stringify(normalized)
        );
      } catch (error) {}
    }

    return normalized;
  }

  function notify() {
    window.dispatchEvent(
      new CustomEvent('ragex:change', {
        detail: {
          balance: getBalance(),
          inventory: getInventory()
        }
      })
    );
  }

  function setBalance(amount) {
    const value = Math.max(
      0,
      Math.floor(Number(amount) || 0)
    );

    localStorage.setItem(BALANCE_KEY, String(value));
    notify();
    return value;
  }

  function addBalance(amount) {
    const value = Math.max(
      0,
      Math.floor(Number(amount) || 0)
    );

    return setBalance(getBalance() + value);
  }

  function spendBalance(amount) {
    const cost = Math.max(
      0,
      Math.floor(Number(amount) || 0)
    );

    if (getBalance() < cost) return false;

    setBalance(getBalance() - cost);
    return true;
  }

  function setInventory(items) {
    const normalized = (Array.isArray(items) ? items : [])
      .filter(item =>
        item &&
        item.demo !== true &&
        typeof item.name === 'string' &&
        Number.isFinite(Number(item.value))
      )
      .map(item => ({
        ...item,
        id: item.id ?? (
          `item-${Date.now()}-${Math.random()
            .toString(36).slice(2, 9)}`
        ),
        demo: false
      }));

    localStorage.setItem(
      INVENTORY_KEY,
      JSON.stringify(normalized)
    );

    notify();
    return normalized;
  }

  function addItem(item) {
    if (
      !item ||
      typeof item.name !== 'string' ||
      !Number.isFinite(Number(item.value))
    ) {
      return false;
    }

    const inventory = getInventory();

    inventory.push({
      ...item,
      id: item.id ?? (
        `item-${Date.now()}-${Math.random()
          .toString(36).slice(2, 9)}`
      ),
      demo: false
    });

    setInventory(inventory);
    return true;
  }

  function removeItem(id) {
    const inventory = getInventory();
    const filtered = inventory.filter(
      item => String(item.id) !== String(id)
    );

    if (filtered.length === inventory.length) return false;

    setInventory(filtered);
    return true;
  }

  // Продажа по полной стоимости предмета.
  function sellItem(id) {
    const inventory = getInventory();

    const index = inventory.findIndex(
      item => String(item.id) === String(id)
    );

    if (index === -1) {
      return { ok: false, reason: 'not-found' };
    }

    const item = inventory[index];
    const payout = Math.max(
      0,
      Math.floor(Number(item.value) || 0)
    );

    // Сначала удаляем предмет и сохраняем инвентарь.
    inventory.splice(index, 1);
    localStorage.setItem(
      INVENTORY_KEY,
      JSON.stringify(inventory)
    );

    // Затем начисляем полную стоимость.
    localStorage.setItem(
      BALANCE_KEY,
      String(getBalance() + payout)
    );

    notify();

    return {
      ok: true,
      item,
      payout
    };
  }

  window.RagexStore = {
    getBalance,
    setBalance,
    addBalance,
    spendBalance,
    getInventory,
    setInventory,
    addItem,
    removeItem,
    sellItem,
    startBalance: START_BALANCE
  };

  window.addEventListener('storage', event => {
    if (
      !event.key ||
      event.key === BALANCE_KEY ||
      event.key === INVENTORY_KEY
    ) {
      notify();
    }
  });
})();
