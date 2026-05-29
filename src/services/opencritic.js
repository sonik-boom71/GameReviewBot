'use strict';

/**
 * OpenCritic: бесплатный API закрыт (RapidAPI). Сайт — SPA, но страницы игр
 * сервер отдаёт отрендеренными, поэтому парсим их через cheerio. id игры
 * получаем через RapidAPI (если задан ключ) либо через поисковики.
 */

const axios = require('axios');
const cheerio = require('cheerio');
const cache = require('../util/cache');
const config = require('../config');
const log = require('../util/logger').create('opencritic');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const http = axios.create({ timeout: 15000, headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } });

const RAPID_HOST = 'opencritic-api.p.rapidapi.com';
const slugify = (s) => String(s || 'game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'game';
const gameUrl = (id, name) => `https://opencritic.com/game/${id}/${slugify(name)}`;

function readOrb($, labelRegex) {
  let val = null;
  $('app-score-orb').each((_, el) => {
    if (val != null) return;
    const label = $(el).parent().find('p').first().text().trim();
    if (labelRegex.test(label)) {
      const num = ($(el).find('.inner-orb').first().text().match(/\d{1,3}/) || [])[0];
      if (num != null) val = Number(num);
    }
  });
  return val;
}

async function resolveIdViaRapidApi(name) {
  if (!config.openCritic.rapidApiKey) return null;
  try {
    const { data } = await axios.get(`https://${RAPID_HOST}/game/search`, {
      params: { criteria: name },
      headers: { 'X-RapidAPI-Key': config.openCritic.rapidApiKey, 'X-RapidAPI-Host': RAPID_HOST },
      timeout: 15000,
    });
    if (Array.isArray(data) && data.length && data[0].id) return { id: Number(data[0].id), name: data[0].name };
  } catch (e) {
    log.warn('RapidAPI search failed:', e.message);
  }
  return null;
}

function extractId(html) {
  const s = String(html);
  const m = s.match(/opencritic\.com\/game\/(\d+)/i);
  if (m) return Number(m[1]);
  for (const r of s.matchAll(/uddg=([^&"']+)/g)) {
    try {
      const mm = decodeURIComponent(r[1]).match(/opencritic\.com\/game\/(\d+)/i);
      if (mm) return Number(mm[1]);
    } catch (_) {}
  }
  return null;
}

async function resolveIdViaSearch(name) {
  const queries = [`opencritic ${name} review`, `site:opencritic.com/game ${name}`];
  const engines = [
    (q) => ({ method: 'post', url: 'https://html.duckduckgo.com/html/', data: new URLSearchParams({ q }).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }),
    (q) => ({ method: 'get', url: 'https://lite.duckduckgo.com/lite/', params: { q } }),
    (q) => ({ method: 'get', url: 'https://www.bing.com/search', params: { q } }),
  ];
  for (const q of queries) {
    for (const make of engines) {
      try {
        const { data: html } = await http.request({ ...make(q), timeout: 8000, responseType: 'text' });
        const id = extractId(html);
        if (id) return { id, name };
      } catch (_) {}
    }
  }
  return null;
}

async function scrapeGame(id, fallbackName) {
  const { data: html } = await http.get(gameUrl(id, fallbackName), {
    headers: { Accept: 'text/html,application/xhtml+xml' },
    responseType: 'text',
  });
  const $ = cheerio.load(html);

  let name = $('meta[property="og:title"]').attr('content') || $('title').first().text() || fallbackName || '';
  name = name.replace(/\s*Reviews\s*$/i, '').replace(/\s*[-–|]\s*OpenCritic.*$/i, '').trim();

  let tier = null, numReviews = null, score = null, percentRecommended = null;
  const ldText = $('script[type="application/ld+json"]').map((_, el) => $(el).contents().text()).get().join(' ');
  const blob = ldText + ' ' + html;

  const sm = blob.match(/rated\s+'([^']+)'\s+after being reviewed by\s+(\d+)\s+critics?,?\s+with an overall average score of\s+(\d+)/i);
  if (sm) { tier = sm[1]; numReviews = Number(sm[2]); score = Number(sm[3]); }
  const rm = blob.match(/recommended by\s+(\d+)\s*%/i);
  if (rm) percentRecommended = Number(rm[1]);

  if (score == null) score = readOrb($, /Top Critic Average/i);
  if (percentRecommended == null) percentRecommended = readOrb($, /Critics Recommend/i);

  if (score == null && percentRecommended == null) return null;
  return { id, name: name || fallbackName || null, score, percentRecommended, numReviews, tier, url: gameUrl(id, name || fallbackName), source: config.openCritic.rapidApiKey ? 'rapidapi+scrape' : 'scrape' };
}

async function getOpenCriticData(name) {
  return cache.getOrLoad(`oc:${name.toLowerCase()}`, async () => {
    try {
      const found = (await resolveIdViaRapidApi(name)) || (await resolveIdViaSearch(name));
      if (!found) return null;
      return await scrapeGame(found.id, found.name);
    } catch (e) {
      log.warn('getOpenCriticData failed:', e.message);
      return null;
    }
  });
}

module.exports = { getOpenCriticData };
