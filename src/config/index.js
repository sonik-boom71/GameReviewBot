'use strict';

/**
 * Централизованная конфигурация из переменных окружения (аналог application.yml).
 * Здесь же — флаги доступности фич: если ключа нет, соответствующий источник
 * просто отключается, а бот продолжает работать (graceful degradation).
 */

require('dotenv').config();

const num = (v, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

// Steam-коды регионов для мультивалютных цен (#2). RUB в Steam с 2022 часто
// недоступен — тогда регион просто пропускается.
const PRICE_REGIONS = (process.env.STEAM_PRICE_REGIONS || 'USD:us,EUR:de,RUB:ru')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean)
  .map((p) => {
    const [label, cc] = p.split(':');
    return { label: (label || '').trim(), cc: (cc || 'us').trim() };
  });

const config = {
  // Telegram
  botToken: process.env.BOT_TOKEN || '',

  // Языки (#15)
  defaultLang: (process.env.DEFAULT_LANG || 'ru').toLowerCase(),

  // Steam (#2,#3,#4,#5,#6,#7,#14,#17)
  steam: {
    apiKey: process.env.STEAM_API_KEY || '',
    cc: process.env.STEAM_CC || 'us',
    priceRegions: PRICE_REGIONS,
  },

  // LLM — любой OpenAI-совместимый провайдер (выжимка отзывов, перевод-фолбэк)
  llm: {
    baseUrl: process.env.OPENAI_BASE_URL || undefined,
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },

  // OpenCritic (через RapidAPI, опционально)
  openCritic: {
    rapidApiKey: process.env.OPENCRITIC_RAPIDAPI_KEY || '',
  },

  // IGDB через Twitch OAuth (#1,#8,#20,#21)
  igdb: {
    clientId: process.env.TWITCH_CLIENT_ID || '',
    clientSecret: process.env.TWITCH_CLIENT_SECRET || '',
  },

  // IsThereAnyDeal — история цен и минимальная цена (#2,#12)
  itad: {
    apiKey: process.env.ITAD_API_KEY || '',
  },

  // Перевод отзывов (#16)
  translate: {
    libreUrl: process.env.LIBRETRANSLATE_URL || '',
    libreApiKey: process.env.LIBRETRANSLATE_API_KEY || '',
    deeplApiKey: process.env.DEEPL_API_KEY || '',
  },

  // Инфраструктура
  cacheTtlMs: num(process.env.CACHE_TTL_MS, 60 * 60 * 1000), // 1 час
  logLevel: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  dbFile: process.env.DB_FILE || require('path').join(process.cwd(), 'data', 'db.json'),
};

// Флаги доступности источников
config.features = {
  llm: Boolean(config.llm.apiKey || config.llm.baseUrl),
  openCritic: true, // публичный парсинг + опционально RapidAPI
  igdb: Boolean(config.igdb.clientId && config.igdb.clientSecret),
  itad: Boolean(config.itad.apiKey),
  metacritic: true, // best-effort парсинг
  translate: Boolean(
    config.translate.libreUrl ||
      config.translate.deeplApiKey ||
      config.llm.apiKey ||
      config.llm.baseUrl
  ),
  steamPlayers: Boolean(config.steam.apiKey),
};

module.exports = config;
