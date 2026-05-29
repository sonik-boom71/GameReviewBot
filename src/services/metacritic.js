'use strict';

/**
 * Metacritic (#1). Официального API нет, Metacritic жёстко блокирует ботов,
 * поэтому это best-effort парсинг страницы через __NEXT_DATA__ с graceful skip.
 * Оценку критиков мы и так получаем бесплатно из Steam (appdetails.metacritic),
 * здесь главная цель — пользовательская оценка, если страница доступна.
 */

const axios = require('axios');
const cache = require('../util/cache');
const log = require('../util/logger').create('metacritic');

const http = axios.create({
  timeout: 12000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    Accept: 'text/html,application/xhtml+xml',
  },
});

const slug = (name) =>
  String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Рекурсивно ищет в объекте первое значение по ключу.
function deepFind(obj, key, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 8) return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  for (const v of Object.values(obj)) {
    const found = deepFind(v, key, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

async function getMetacritic(name, steamCriticScore = null) {
  return cache.getOrLoad(`mc:${name.toLowerCase()}`, async () => {
    const url = `https://www.metacritic.com/game/${slug(name)}/`;
    try {
      const { data: html } = await http.get(url, { responseType: 'text' });
      const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i);
      let critic = steamCriticScore;
      let user = null;
      if (m) {
        const json = JSON.parse(m[1]);
        const cs = deepFind(json, 'criticScoreSummary');
        const us = deepFind(json, 'userScoreSummary');
        if (cs && typeof cs.score === 'number') critic = Math.round(cs.score);
        if (us && typeof us.score === 'number') user = Math.round(us.score * 10) / 10;
      }
      if (critic == null && user == null) return steamCriticScore != null ? { critic: steamCriticScore, user: null, url } : null;
      return { critic, user, url };
    } catch (e) {
      log.debug('metacritic scrape failed:', e.message);
      // фолбэк: хотя бы оценка критиков из Steam
      return steamCriticScore != null ? { critic: steamCriticScore, user: null, url } : null;
    }
  });
}

module.exports = { getMetacritic };
