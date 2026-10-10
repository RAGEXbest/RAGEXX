/* Shared RAGEX header controls — loaded after ragex-store.js */
(() => {
  'use strict';
  const balanceNode = document.getElementById('balanceValue') || document.getElementById('balance');
  const topUp = document.getElementById('addBalance');
  const toast = document.getElementById('ragexToast');
  let toastTimer;
  const fmt = value => Number(value || 0).toLocaleString('ru-RU');
  const renderBalance = () => {
    if (!balanceNode || !window.RagexStore) return;
    balanceNode.textContent = fmt(window.RagexStore.getBalance());
  };
  const showToast = message => {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2300);
  };
  if (topUp && window.RagexStore) {
    topUp.addEventListener('click', () => {
      if (topUp.disabled) return;
      window.RagexStore.addBalance(1000);
      renderBalance();
      showToast('+1 000 ★ добавлено к общему демо-балансу');
    });
  }
  window.addEventListener('ragex:change', renderBalance);
  window.addEventListener('storage', event => {
    if (!event.key || event.key === 'ragexBalance') renderBalance();
  });
  renderBalance();
})();
