'use strict';

/**
 * In-memory кэш с TTL (аналог Caffeine, TTL по умолчанию 1 час).
 * Поддерживает getOrLoad с дедупликацией одновременных загрузок (anti-stampede).
 */

const config = require('../config');

const store = new Map(); // key -> { value, expires }
const inflight = new Map(); // key -> Promise

function get(key) {
  const e = store.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expires) {
    store.delete(key);
    return undefined;
  }
  return e.value;
}

function set(key, value, ttlMs = config.cacheTtlMs) {
  store.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

/**
 * Возвращает значение из кэша или загружает его loader-ом (async), кэширует
 * и дедуплицирует параллельные запросы по одному ключу.
 */
async function getOrLoad(key, loader, ttlMs = config.cacheTtlMs) {
  const cached = get(key);
  if (cached !== undefined) return cached;

  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    try {
      const value = await loader();
      if (value !== undefined) set(key, value, ttlMs);
      return value;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p;
}

function clear() {
  store.clear();
  inflight.clear();
}

module.exports = { get, set, getOrLoad, clear };
