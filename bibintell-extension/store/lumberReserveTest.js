/*
  Testing helper for store economy.
  Usage from DevTools on store page:
    await window.lumberReserveTest.set(250)
    await window.lumberReserveTest.add(40)
    await window.lumberReserveTest.reset()
    await window.lumberReserveTest.get()
*/

(function createLumberReserveTestApi() {
  const DEFAULT_TEST_RESERVE = 100;

  function clampToInt(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed)) return 0;
    return Math.max(0, parsed);
  }

  function storageGet(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (result) => resolve(result));
    });
  }

  function storageSet(payload) {
    return new Promise((resolve) => {
      chrome.storage.local.set(payload, () => resolve());
    });
  }

  async function get() {
    const result = await storageGet(["lumberReserve"]);
    return clampToInt(result.lumberReserve);
  }

  async function set(value) {
    const reserve = clampToInt(value);
    await storageSet({ lumberReserve: reserve });
    return reserve;
  }

  async function add(delta) {
    const current = await get();
    const next = current + clampToInt(delta);
    await storageSet({ lumberReserve: next });
    return next;
  }

  async function reset() {
    await storageSet({ lumberReserve: DEFAULT_TEST_RESERVE });
    return DEFAULT_TEST_RESERVE;
  }

  async function seedForStoreTesting() {
    await storageSet({
      lumberReserve: 500,
      purchasedItems: {}
    });
    return { lumberReserve: 500, purchasedItems: {} };
  }

  window.lumberReserveTest = {
    get,
    set,
    add,
    reset,
    seedForStoreTesting
  };
})();