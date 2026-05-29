'use strict';

/**
 * Простое JSON-хранилище (замена JPA/PostgreSQL в Node-версии).
 * Хранит пользователей, историю запросов (#10), избранное (#11) и статистику
 * для профиля (#23). Запись атомарная (temp-файл + rename).
 *
 * Схема:
 * {
 *   users: { [userId]: { lang, viewed, createdAt } },
 *   history: { [userId]: [ { query, name, appid, genres, ts } ] },  // максимум 10
 *   favorites: { [userId]: [ { appid, name, genres, ts } ] }
 * }
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');
const log = require('../util/logger').create('db');

const FILE = config.dbFile;
const HISTORY_LIMIT = 10;

let data = { users: {}, history: {}, favorites: {} };
let writeTimer = null;

function load() {
  try {
    if (fs.existsSync(FILE)) {
      const raw = fs.readFileSync(FILE, 'utf8');
      const parsed = JSON.parse(raw);
      data = { users: {}, history: {}, favorites: {}, ...parsed };
    } else {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      flushNow();
    }
    log.info('store loaded:', FILE);
  } catch (e) {
    log.error('store load failed, starting empty:', e.message);
    data = { users: {}, history: {}, favorites: {} };
  }
}

function flushNow() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, FILE);
  } catch (e) {
    log.error('store write failed:', e.message);
  }
}

// Дебаунс записи, чтобы не дёргать диск на каждое изменение.
function scheduleFlush() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    flushNow();
  }, 400);
  if (writeTimer.unref) writeTimer.unref();
}

// ── Пользователи / язык (#15) ───────────────────────────────
function getUser(userId) {
  const id = String(userId);
  if (!data.users[id]) {
    data.users[id] = { lang: config.defaultLang, viewed: 0, createdAt: Date.now() };
    scheduleFlush();
  }
  return data.users[id];
}

function getLang(userId) {
  return getUser(userId).lang || config.defaultLang;
}

function setLang(userId, lang) {
  getUser(userId).lang = lang;
  scheduleFlush();
}

// ── История запросов (#10) ──────────────────────────────────
function addHistory(userId, entry) {
  const id = String(userId);
  getUser(id).viewed += 1;
  const list = data.history[id] || (data.history[id] = []);
  // убираем дубликаты по appid/имени, новый — наверх
  const key = entry.appid || entry.name;
  const filtered = list.filter((e) => (e.appid || e.name) !== key);
  filtered.unshift({ ...entry, ts: Date.now() });
  data.history[id] = filtered.slice(0, HISTORY_LIMIT);
  scheduleFlush();
}

function getHistory(userId) {
  return data.history[String(userId)] || [];
}

// ── Избранное (#11) ─────────────────────────────────────────
function isFavorite(userId, appid) {
  return getFavorites(userId).some((f) => String(f.appid) === String(appid));
}

function addFavorite(userId, fav) {
  const id = String(userId);
  const list = data.favorites[id] || (data.favorites[id] = []);
  if (!list.some((f) => String(f.appid) === String(fav.appid))) {
    list.unshift({ ...fav, ts: Date.now() });
    scheduleFlush();
    return true;
  }
  return false;
}

function removeFavorite(userId, appid) {
  const id = String(userId);
  const list = data.favorites[id] || [];
  const next = list.filter((f) => String(f.appid) !== String(appid));
  data.favorites[id] = next;
  scheduleFlush();
  return next.length !== list.length;
}

function getFavorites(userId) {
  return data.favorites[String(userId)] || [];
}

// ── Профиль (#23) ───────────────────────────────────────────
function getProfile(userId) {
  const user = getUser(userId);
  const history = getHistory(userId);
  const favorites = getFavorites(userId);

  // любимый жанр = самый частый среди истории и избранного
  const genreCount = {};
  [...history, ...favorites].forEach((e) => {
    (e.genres || []).forEach((g) => {
      genreCount[g] = (genreCount[g] || 0) + 1;
    });
  });
  const favoriteGenre =
    Object.entries(genreCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  return {
    lang: user.lang,
    viewed: user.viewed || 0,
    favoritesCount: favorites.length,
    favoriteGenre,
    recent: history.slice(0, 5),
    createdAt: user.createdAt,
  };
}

load();

module.exports = {
  getUser,
  getLang,
  setLang,
  addHistory,
  getHistory,
  isFavorite,
  addFavorite,
  removeFavorite,
  getFavorites,
  getProfile,
  flushNow,
};
