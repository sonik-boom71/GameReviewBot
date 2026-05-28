'use strict';

/**
 * steamApi.js — работа со Steam.
 *
 * Важно: для отзывов/цены официальный ключ Steam Web API НЕ нужен —
 * используются публичные store-эндпоинты (storefront API). Поэтому всё
 * работает «из коробки», даже если STEAM_API_KEY пустой.
 */

const axios = require('axios');

const STEAM_CC = process.env.STEAM_CC || 'us';

const http = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GameReviewBot/1.0',
    Accept: 'application/json, text/plain, */*',
  },
});

/**
 * Поиск игры по названию -> { appid, name } лучшего совпадения, либо null.
 */
async function searchGame(name) {
  // 1) Storefront search (даёт точные совпадения по магазину)
  try {
    const { data } = await http.get(
      'https://store.steampowered.com/api/storesearch/',
      { params: { term: name, cc: STEAM_CC, l: 'en' } }
    );
    if (data && Array.isArray(data.items) && data.items.length) {
      const item = data.items[0];
      return { appid: Number(item.id), name: item.name };
    }
  } catch (_) {
    /* пробуем запасной вариант */
  }

  // 2) Community search (запасной источник)
  try {
    const { data } = await http.get(
      `https://steamcommunity.com/actions/SearchApps/${encodeURIComponent(name)}`
    );
    if (Array.isArray(data) && data.length) {
      return { appid: Number(data[0].appid), name: data[0].name };
    }
  } catch (_) {
    /* игнорируем */
  }

  return null;
}

/**
 * Детали приложения: имя, цена, обложка, дата выхода. Либо null.
 */
async function getAppDetails(appid) {
  try {
    const { data } = await http.get(
      'https://store.steampowered.com/api/appdetails',
      { params: { appids: appid, cc: STEAM_CC, l: 'en' } }
    );
    const entry = data && data[appid];
    if (!entry || !entry.success || !entry.data) return null;

    const d = entry.data;

    let price = null;
    if (d.is_free) {
      price = { isFree: true, final: 'Бесплатно', discountPercent: 0 };
    } else if (d.price_overview) {
      const po = d.price_overview;
      price = {
        isFree: false,
        final: po.final_formatted,
        initial: po.initial_formatted,
        discountPercent: po.discount_percent || 0,
      };
    }

    return {
      name: d.name,
      price,
      headerImage: d.header_image || null,
      releaseDate: (d.release_date && d.release_date.date) || null,
    };
  } catch (_) {
    return null;
  }
}

const looksEnglish = (t) => {
  const letters = (t.match(/[a-zA-Z]/g) || []).length;
  return letters / Math.max(t.length, 1) > 0.5;
};

/**
 * Сводка отзывов + выборка 5-12 текстов для анализа GPT. Либо null.
 * language=all -> глобальные счётчики; для GPT предпочитаем англоязычные.
 */
async function getReviews(appid) {
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

    const raw = Array.isArray(data.reviews) ? data.reviews : [];
    const cleaned = raw
      .filter((r) => r.review && r.review.trim().length > 40)
      .map((r) => ({
        text: r.review.replace(/\s+/g, ' ').trim(),
        votedUp: !!r.voted_up,
      }));

    const english = cleaned.filter((r) => looksEnglish(r.text));
    const pool = english.length >= 5 ? english : cleaned;
    const sample = pool
      .slice(0, 12)
      .map((r) => ({ ...r, text: r.text.slice(0, 600) }));

    return {
      positivePercent,
      totalReviews,
      totalPositive,
      scoreDesc: qs.review_score_desc || null,
      sample,
    };
  } catch (_) {
    return null;
  }
}

/**
 * Высокоуровневый сбор всех данных Steam по названию игры.
 * Возвращает объект или null (если игра не найдена в Steam вообще).
 */
async function getSteamData(name) {
  const game = await searchGame(name);
  if (!game) return null;

  const [details, reviews] = await Promise.all([
    getAppDetails(game.appid),
    getReviews(game.appid),
  ]);

  return {
    appid: game.appid,
    name: (details && details.name) || game.name,
    price: details ? details.price : null,
    headerImage: details ? details.headerImage : null,
    releaseDate: details ? details.releaseDate : null,
    reviews, // может быть null
    storeUrl: `https://store.steampowered.com/app/${game.appid}`,
  };
}

module.exports = { searchGame, getAppDetails, getReviews, getSteamData };
