'use strict';

/**
 * Steam-сервис: поиск, полные детали (цена/жанры/теги/сисреки/дата/разработчик/
 * описание/скриншоты/трейлер/обложка), мультирегиональные цены (#2), отзывы,
 * текущий онлайн (#14), топ продаж. Публичные store-эндпоинты, ключ не нужен.
 */

const axios = require('axios');
const cache = require('../util/cache');
const config = require('../config');
const log = require('../util/logger').create('steam');
const { stripHtml, truncate, looksEnglish } = require('../util/text');

const http = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GameReviewBot/2.0',
    Accept: 'application/json, text/plain, */*',
  },
});

const steamLang = (lang) => (lang === 'ru' ? 'russian' : 'english');

async function searchGame(name) {
  return cache.getOrLoad(`steam:search:${name.toLowerCase()}`, async () => {
    try {
      const { data } = await http.get(
        'https://store.steampowered.com/api/storesearch/',
        { params: { term: name, cc: config.steam.cc, l: 'en' } }
      );
      if (data && Array.isArray(data.items) && data.items.length) {
        return { appid: Number(data.items[0].id), name: data.items[0].name };
      }
    } catch (e) {
      log.warn('search storesearch failed:', e.message);
    }
    try {
      const { data } = await http.get(
        `https://steamcommunity.com/actions/SearchApps/${encodeURIComponent(name)}`
      );
      if (Array.isArray(data) && data.length) {
        return { appid: Number(data[0].appid), name: data[0].name };
      }
    } catch (e) {
      log.warn('search community failed:', e.message);
    }
    return null;
  });
}

function parseSysReq(req) {
  // req может быть объектом {minimum, recommended} или []
  if (!req || Array.isArray(req)) return null;
  const min = req.minimum ? truncate(stripHtml(req.minimum).replace(/^minimum:?/i, '').trim(), 400) : null;
  const rec = req.recommended ? truncate(stripHtml(req.recommended).replace(/^recommended:?/i, '').trim(), 400) : null;
  if (!min && !rec) return null;
  return { min, rec };
}

async function getDetails(appid, lang = 'en') {
  return cache.getOrLoad(`steam:details:${appid}:${lang}`, async () => {
    try {
      const { data } = await http.get(
        'https://store.steampowered.com/api/appdetails',
        { params: { appids: appid, cc: config.steam.cc, l: steamLang(lang) } }
      );
      const entry = data && data[appid];
      if (!entry || !entry.success || !entry.data) return null;
      const d = entry.data;

      // базовая цена (в основном регионе)
      let basePrice = null;
      if (d.is_free) basePrice = { isFree: true };
      else if (d.price_overview) {
        basePrice = {
          isFree: false,
          final: d.price_overview.final_formatted,
          initial: d.price_overview.initial_formatted,
          discountPercent: d.price_overview.discount_percent || 0,
        };
      }

      return {
        appid: Number(appid),
        name: d.name,
        shortDescription: d.short_description ? truncate(stripHtml(d.short_description), 400) : null,
        genres: (d.genres || []).map((g) => g.description).filter(Boolean),
        tags: (d.categories || []).map((c) => c.description).filter(Boolean).slice(0, 12),
        sysReq: parseSysReq(d.pc_requirements),
        releaseDate: (d.release_date && d.release_date.date) || null,
        comingSoon: Boolean(d.release_date && d.release_date.coming_soon),
        developers: d.developers || [],
        publishers: d.publishers || [],
        headerImage: d.header_image || null,
        cover: d.header_image || null,
        screenshots: (d.screenshots || []).map((s) => s.path_full).filter(Boolean),
        trailer:
          d.movies && d.movies.length
            ? (d.movies[0].mp4 && (d.movies[0].mp4.max || d.movies[0].mp4['480'])) || null
            : null,
        metacriticScore: d.metacritic && typeof d.metacritic.score === 'number' ? d.metacritic.score : null,
        metacriticUrl: d.metacritic ? d.metacritic.url : null,
        basePrice,
        storeUrl: `https://store.steampowered.com/app/${appid}`,
      };
    } catch (e) {
      log.warn(`details failed for ${appid}:`, e.message);
      return null;
    }
  });
}

/** Цена в нескольких регионах (#2). */
async function getRegionalPrices(appid) {
  return cache.getOrLoad(`steam:prices:${appid}`, async () => {
    const out = [];
    await Promise.all(
      config.steam.priceRegions.map(async (region) => {
        try {
          const { data } = await http.get(
            'https://store.steampowered.com/api/appdetails',
            { params: { appids: appid, cc: region.cc, l: 'en', filters: 'price_overview' } }
          );
          const po = data && data[appid] && data[appid].data && data[appid].data.price_overview;
          if (po) {
            out.push({
              label: region.label,
              cc: region.cc,
              final: po.final_formatted,
              initial: po.initial_formatted,
              discountPercent: po.discount_percent || 0,
            });
          }
        } catch (e) {
          log.debug(`price ${region.label} failed:`, e.message);
        }
      })
    );
    return out;
  });
}

/** Текущий онлайн (#14). Публичный эндпоинт, ключ не требуется. */
async function getCurrentPlayers(appid) {
  return cache.getOrLoad(
    `steam:players:${appid}`,
    async () => {
      try {
        const { data } = await http.get(
          'https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/',
          { params: { appid } }
        );
        const n = data && data.response && data.response.player_count;
        return typeof n === 'number' ? n : null;
      } catch (e) {
        log.debug('current players failed:', e.message);
        return null;
      }
    },
    5 * 60 * 1000 // онлайн кэшируем на 5 минут
  );
}

async function getReviews(appid) {
  return cache.getOrLoad(`steam:reviews:${appid}`, async () => {
    try {
      const { data } = await http.get(
        `https://store.steampowered.com/appreviews/${appid}`,
        {
          params: {
            json: 1,
            filter: 'all',
            language: 'all',
            num_per_page: 100,
            purchase_type: 'all',
            review_type: 'all',
          },
        }
      );
      if (!data || data.success !== 1) return null;
      const qs = data.query_summary || {};
      const totalReviews = qs.total_reviews || 0;
      const totalPositive = qs.total_positive || 0;
      const positivePercent = totalReviews
        ? Math.round((totalPositive / totalReviews) * 100)
        : null;

      const cleaned = (data.reviews || [])
        .filter((r) => r.review && r.review.trim().length > 40)
        .map((r) => ({
          text: r.review.replace(/\s+/g, ' ').trim(),
          votedUp: !!r.voted_up,
        }));
      const english = cleaned.filter((r) => looksEnglish(r.text));
      const pool = english.length >= 5 ? english : cleaned;
      const sample = pool.slice(0, 12).map((r) => ({
        ...r,
        text: r.text.slice(0, 600),
        isEnglish: looksEnglish(r.text),
      }));

      return { positivePercent, totalReviews, totalPositive, sample };
    } catch (e) {
      log.warn(`reviews failed for ${appid}:`, e.message);
      return null;
    }
  });
}

/** Топ продаж — для /random фолбэка (#20). */
async function getTopSellers() {
  return cache.getOrLoad('steam:topsellers', async () => {
    try {
      const { data } = await http.get(
        'https://store.steampowered.com/api/featuredcategories',
        { params: { cc: config.steam.cc, l: 'en' } }
      );
      const items = (data && data.top_sellers && data.top_sellers.items) || [];
      return items.map((i) => ({ appid: i.id, name: i.name })).filter((i) => i.appid);
    } catch (e) {
      log.warn('top sellers failed:', e.message);
      return [];
    }
  });
}

module.exports = {
  searchGame,
  getDetails,
  getRegionalPrices,
  getCurrentPlayers,
  getReviews,
  getTopSellers,
};
