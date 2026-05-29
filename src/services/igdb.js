'use strict';

/**
 * IGDB (#1 рейтинг/жанры/описание, #8 похожие, #20 random, #21 top).
 * Авторизация через Twitch OAuth (client credentials). Без TWITCH_CLIENT_ID/
 * SECRET сервис отключён и всё аккуратно пропускается.
 */

const axios = require('axios');
const cache = require('../util/cache');
const config = require('../config');
const log = require('../util/logger').create('igdb');

const available = config.features.igdb;
const http = axios.create({ timeout: 15000 });

// Идентификаторы жанров IGDB (для /top, #21)
const GENRES = {
  RPG: 12,
  Shooter: 5,
  Strategy: 15,
  Adventure: 31,
  Simulator: 13,
  Sport: 14,
  Racing: 10,
  Fighting: 4,
  Platform: 8,
  Puzzle: 9,
  Indie: 32,
  'Hack and slash': 25,
};

const img = (id, size = 't_cover_big') =>
  id ? `https://images.igdb.com/igdb/image/upload/${size}/${id}.jpg` : null;

let tokenCache = { value: null, expires: 0 };

async function token() {
  if (!available) return null;
  if (tokenCache.value && Date.now() < tokenCache.expires) return tokenCache.value;
  try {
    const { data } = await http.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        client_id: config.igdb.clientId,
        client_secret: config.igdb.clientSecret,
        grant_type: 'client_credentials',
      },
    });
    tokenCache = { value: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 };
    return tokenCache.value;
  } catch (e) {
    log.warn('twitch token failed:', e.message);
    return null;
  }
}

async function query(endpoint, body) {
  const tk = await token();
  if (!tk) return null;
  try {
    const { data } = await http.post(`https://api.igdb.com/v4/${endpoint}`, body, {
      headers: { 'Client-ID': config.igdb.clientId, Authorization: `Bearer ${tk}`, Accept: 'application/json' },
    });
    return data;
  } catch (e) {
    log.warn(`IGDB ${endpoint} failed:`, e.message);
    return null;
  }
}

function mapGame(g) {
  if (!g) return null;
  const companies = g.involved_companies || [];
  return {
    id: g.id,
    name: g.name,
    summary: g.summary || null,
    critic: typeof g.aggregated_rating === 'number' ? Math.round(g.aggregated_rating) : null,
    user: typeof g.rating === 'number' ? Math.round(g.rating) : null,
    genres: (g.genres || []).map((x) => x.name).filter(Boolean),
    tags: (g.themes || []).map((x) => x.name).concat((g.keywords || []).map((x) => x.name)).filter(Boolean).slice(0, 12),
    releaseDate: g.first_release_date ? new Date(g.first_release_date * 1000) : null,
    cover: img(g.cover && g.cover.image_id, 't_cover_big'),
    screenshots: (g.screenshots || []).map((s) => img(s.image_id, 't_screenshot_huge')).filter(Boolean),
    trailerYoutube: g.videos && g.videos.length ? `https://www.youtube.com/watch?v=${g.videos[0].video_id}` : null,
    developers: companies.filter((c) => c.developer && c.company).map((c) => c.company.name),
    publishers: companies.filter((c) => c.publisher && c.company).map((c) => c.company.name),
    similar: (g.similar_games || []).map((s) => ({
      name: s.name,
      rating: typeof s.aggregated_rating === 'number' ? Math.round(s.aggregated_rating) : (typeof s.rating === 'number' ? Math.round(s.rating) : null),
      cover: img(s.cover && s.cover.image_id, 't_cover_small'),
    })),
  };
}

const GAME_FIELDS =
  'fields name, summary, aggregated_rating, rating, genres.name, themes.name, keywords.name, ' +
  'first_release_date, cover.image_id, screenshots.image_id, videos.video_id, ' +
  'involved_companies.company.name, involved_companies.developer, involved_companies.publisher, ' +
  'similar_games.name, similar_games.aggregated_rating, similar_games.rating, similar_games.cover.image_id';

async function getGame(name) {
  if (!available) return null;
  return cache.getOrLoad(`igdb:game:${name.toLowerCase()}`, async () => {
    const rows = await query('games', `search "${name.replace(/"/g, '')}"; ${GAME_FIELDS}; limit 5;`);
    if (!rows || !rows.length) return null;
    const exact = rows.find((r) => r.name && r.name.toLowerCase() === name.toLowerCase());
    return mapGame(exact || rows[0]);
  });
}

/** Топ-10 по жанру (#21). */
async function topByGenre(genreName) {
  if (!available) return [];
  const gid = GENRES[genreName];
  if (!gid) return [];
  return cache.getOrLoad(`igdb:top:genre:${gid}`, async () => {
    const rows = await query(
      'games',
      `fields name, aggregated_rating, rating, first_release_date, cover.image_id; ` +
        `where genres = (${gid}) & aggregated_rating != null & aggregated_rating_count > 8 & category = 0; ` +
        `sort aggregated_rating desc; limit 10;`
    );
    return (rows || []).map((g) => ({
      name: g.name,
      score: typeof g.aggregated_rating === 'number' ? Math.round(g.aggregated_rating) : null,
      year: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : null,
    }));
  });
}

/** Топ-10 по году (#21). */
async function topByYear(year) {
  if (!available) return [];
  const start = Math.floor(new Date(`${year}-01-01`).getTime() / 1000);
  const end = Math.floor(new Date(`${year + 1}-01-01`).getTime() / 1000);
  return cache.getOrLoad(`igdb:top:year:${year}`, async () => {
    const rows = await query(
      'games',
      `fields name, aggregated_rating; ` +
        `where first_release_date >= ${start} & first_release_date < ${end} & aggregated_rating != null & aggregated_rating_count > 8 & category = 0; ` +
        `sort aggregated_rating desc; limit 10;`
    );
    return (rows || []).map((g) => ({ name: g.name, score: Math.round(g.aggregated_rating), year }));
  });
}

/** Случайная топовая игра (#20). */
async function randomTop() {
  if (!available) return null;
  const offset = Math.floor(Math.random() * 200);
  const rows = await query(
    'games',
    `fields name; where aggregated_rating != null & aggregated_rating_count > 20 & category = 0 & rating != null; ` +
      `sort rating desc; limit 1; offset ${offset};`
  );
  return rows && rows.length ? rows[0].name : null;
}

module.exports = { available, getGame, topByGenre, topByYear, randomTop, GENRES };
