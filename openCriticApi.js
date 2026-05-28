'use strict';

/**
 * openCriticApi.js — данные OpenCritic.
 *
 * Реальность 2024+: OpenCritic закрыл бесплатный JSON-API (теперь только
 * платный RapidAPI), а их сайт — Angular SPA, где поиск рендерится в
 * браузере. НО страницы конкретных игр сервер отдаёт уже отрендеренными,
 * поэтому оценки оттуда отлично достаются через cheerio.
 *
 * Алгоритм:
 *   1) name -> id игры:
 *        • если задан OPENCRITIC_RAPIDAPI_KEY — через RapidAPI /game/search;
 *        • иначе — через поисковики (DuckDuckGo/Bing), best-effort.
 *   2) id -> cheerio-парсинг серверной страницы /game/{id}/x:
 *        оценка критиков, % рекомендующих, число рецензий, tier.
 *
 * Любой сбой -> возвращаем null, бот спокойно покажет «нет данных».
 */

const axios = require('axios');
const cheerio = require('cheerio');

const RAPID_KEY = process.env.OPENCRITIC_RAPIDAPI_KEY || '';
const RAPID_HOST = 'opencritic-api.p.rapidapi.com';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const http = axios.create({
  timeout: 15000,
  headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
});

const slugify = (s) =>
  String(s || 'game')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'game';

const gameUrl = (id, name) => `https://opencritic.com/game/${id}/${slugify(name)}`;

// Читает число из «орба» (кружок-оценка) по подписи рядом с ним.
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

// ── Шаг 1: name -> id ───────────────────────────────────────
async function resolveIdViaRapidApi(name) {
  if (!RAPID_KEY) return null;
  try {
    const { data } = await axios.get(`https://${RAPID_HOST}/game/search`, {
      params: { criteria: name },
      headers: { 'X-RapidAPI-Key': RAPID_KEY, 'X-RapidAPI-Host': RAPID_HOST },
      timeout: 15000,
    });
    if (Array.isArray(data) && data.length && data[0].id) {
      return { id: Number(data[0].id), name: data[0].name };
    }
  } catch (e) {
    console.error('OpenCritic RapidAPI search failed:', e.message);
  }
  return null;
}

function extractOpenCriticId(html) {
  const s = String(html);
  let m = s.match(/opencritic\.com\/game\/(\d+)/i);
  if (m) return Number(m[1]);
  // DuckDuckGo заворачивает ссылки в redirect uddg=<urlencoded>
  for (const r of s.matchAll(/uddg=([^&"']+)/g)) {
    try {
      const u = decodeURIComponent(r[1]);
      const mm = u.match(/opencritic\.com\/game\/(\d+)/i);
      if (mm) return Number(mm[1]);
    } catch (_) {
      /* skip */
    }
  }
  return null;
}

async function resolveIdViaSearchEngines(name) {
  const queries = [
    `opencritic ${name} review`,
    `site:opencritic.com/game ${name}`,
  ];
  const engines = [
    (q) => ({
      method: 'post',
      url: 'https://html.duckduckgo.com/html/',
      data: new URLSearchParams({ q }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }),
    (q) => ({ method: 'get', url: 'https://lite.duckduckgo.com/lite/', params: { q } }),
    (q) => ({ method: 'get', url: 'https://www.bing.com/search', params: { q } }),
  ];

  for (const q of queries) {
    for (const make of engines) {
      try {
        const { data: html } = await http.request({
          ...make(q),
          timeout: 8000,
          responseType: 'text',
        });
        const id = extractOpenCriticId(html);
        if (id) return { id, name };
      } catch (_) {
        /* пробуем следующий движок */
      }
    }
  }
  return null;
}

async function resolveGame(name) {
  return (
    (await resolveIdViaRapidApi(name)) ||
    (await resolveIdViaSearchEngines(name))
  );
}

// ── Шаг 2: id -> cheerio-парсинг страницы игры ──────────────
async function scrapeGame(id, fallbackName) {
  const { data: html } = await http.get(gameUrl(id, fallbackName), {
    headers: { Accept: 'text/html,application/xhtml+xml' },
    responseType: 'text',
  });

  const $ = cheerio.load(html);

  // Имя игры
  let name =
    $('meta[property="og:title"]').attr('content') ||
    $('title').first().text() ||
    fallbackName ||
    '';
  name = name.replace(/\s*Reviews\s*$/i, '').replace(/\s*[-–|]\s*OpenCritic.*$/i, '').trim();

  let tier = null;
  let numReviews = null;
  let score = null;
  let percentRecommended = null;

  // Основной источник: текстовое резюме в JSON-LD (VideoObject.description),
  // вида: "... rated 'Mighty' after being reviewed by 197 critics, with an
  // overall average score of 95. ... recommended by 97% of critics."
  const ldText = $('script[type="application/ld+json"]')
    .map((_, el) => $(el).contents().text())
    .get()
    .join(' ');
  const blob = ldText + ' ' + html;

  const sm = blob.match(
    /rated\s+'([^']+)'\s+after being reviewed by\s+(\d+)\s+critics?,?\s+with an overall average score of\s+(\d+)/i
  );
  if (sm) {
    tier = sm[1];
    numReviews = Number(sm[2]);
    score = Number(sm[3]);
  }
  const rm = blob.match(/recommended by\s+(\d+)\s*%/i);
  if (rm) percentRecommended = Number(rm[1]);

  // Запасной источник: «орбы» с подписями "Top Critic Average" / "Critics Recommend"
  if (score == null) score = readOrb($, /Top Critic Average/i);
  if (percentRecommended == null) percentRecommended = readOrb($, /Critics Recommend/i);

  if (score == null && percentRecommended == null) return null;

  return {
    id,
    name: name || fallbackName || null,
    score,
    percentRecommended,
    numReviews,
    tier,
    url: gameUrl(id, name || fallbackName),
    source: RAPID_KEY ? 'rapidapi+scrape' : 'scrape',
  };
}

// ── Высокоуровневый вызов ───────────────────────────────────
async function getOpenCriticData(name) {
  try {
    const found = await resolveGame(name);
    if (!found) return null;
    return await scrapeGame(found.id, found.name);
  } catch (e) {
    console.error('OpenCritic error:', e.message);
    return null;
  }
}

module.exports = {
  resolveGame,
  scrapeGame,
  getOpenCriticData,
  extractOpenCriticId,
};
