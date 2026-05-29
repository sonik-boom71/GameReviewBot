'use strict';

/**
 * IsThereAnyDeal (#2 лучшая цена за всё время + ссылка на покупку, #12 история
 * цен для графика). Нужен бесплатный ITAD_API_KEY. Без ключа — graceful skip.
 * Документация: https://docs.isthereanydeal.com (API v2).
 */

const axios = require('axios');
const cache = require('../util/cache');
const config = require('../config');
const log = require('../util/logger').create('itad');

const available = config.features.itad;
const http = axios.create({ timeout: 15000 });
const KEY = config.itad.apiKey;

async function lookup(appid, title) {
  try {
    const params = { key: KEY };
    if (appid) params.appid = appid;
    else params.title = title;
    const { data } = await http.get('https://api.isthereanydeal.com/games/lookup/v1', { params });
    return data && data.found && data.game ? data.game.id : null;
  } catch (e) {
    log.warn('lookup failed:', e.message);
    return null;
  }
}

async function currentBest(id, country) {
  try {
    const { data } = await http.post('https://api.isthereanydeal.com/games/prices/v3', [id], {
      params: { key: KEY, country, deals: true },
    });
    const deals = (data && data[0] && data[0].deals) || [];
    if (!deals.length) return null;
    const best = deals.reduce((a, b) => (a.price.amount <= b.price.amount ? a : b));
    return {
      price: best.price.amount,
      currency: best.price.currency,
      cut: best.cut || 0,
      shop: best.shop && best.shop.name,
      url: best.url,
    };
  } catch (e) {
    log.warn('currentBest failed:', e.message);
    return null;
  }
}

async function historyLow(id, country) {
  try {
    const { data } = await http.post('https://api.isthereanydeal.com/games/historylow/v1', [id], {
      params: { key: KEY, country },
    });
    const low = data && data[0] && data[0].low;
    return low ? { price: low.amount, currency: low.currency } : null;
  } catch (e) {
    log.warn('historyLow failed:', e.message);
    return null;
  }
}

async function priceHistory(id, country) {
  try {
    const since = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
    const { data } = await http.get('https://api.isthereanydeal.com/games/history/v2', {
      params: { key: KEY, id, country, since },
    });
    if (!Array.isArray(data)) return [];
    return data
      .map((p) => ({
        ts: p.timestamp ? new Date(p.timestamp).getTime() : null,
        price: p.deal && p.deal.price ? p.deal.price.amount : null,
      }))
      .filter((p) => p.ts && typeof p.price === 'number')
      .sort((a, b) => a.ts - b.ts);
  } catch (e) {
    log.warn('priceHistory failed:', e.message);
    return [];
  }
}

/** Всё по игре: текущая лучшая цена, исторический минимум, точки для графика. */
async function getItadData(appid, title, country = 'US') {
  if (!available) return null;
  return cache.getOrLoad(`itad:${appid || title}:${country}`, async () => {
    const id = await lookup(appid, title);
    if (!id) return null;
    const [best, low, history] = await Promise.all([
      currentBest(id, country),
      historyLow(id, country),
      priceHistory(id, country),
    ]);
    if (!best && !low && (!history || !history.length)) return null;
    return { id, best, low, history };
  });
}

module.exports = { available, getItadData };
