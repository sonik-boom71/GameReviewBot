'use strict';

/**
 * GameReviewBot — точка входа.
 * Собирает данные об игре из Steam, OpenCritic, Metacritic, IGDB, IsThereAnyDeal,
 * делает ИИ-выжимку отзывов и выдаёт карточку с вердиктом, рейтингами, ценой,
 * скриншотами и inline-кнопками. См. README.
 */

const { Telegraf } = require('telegraf');
const config = require('./src/config');
const logger = require('./src/util/logger');
logger.setLevel(config.logLevel);
const log = logger.create('bot');
const handlers = require('./src/handlers');

if (!config.botToken) {
  log.error('BOT_TOKEN не задан в .env');
  process.exit(1);
}

const bot = new Telegraf(config.botToken);

handlers.register(bot);

bot.catch((err, ctx) => {
  log.error(`Telegraf error (${ctx && ctx.updateType}):`, err);
});

// Меню команд
const COMMANDS = [
  { command: 'review', description: 'Обзор игры / Game review' },
  { command: 'random', description: 'Случайная игра / Random game' },
  { command: 'top', description: 'Топ по жанру / Top by genre' },
  { command: 'history', description: 'История запросов / History' },
  { command: 'favorites', description: 'Избранное / Favorites' },
  { command: 'profile', description: 'Профиль / Profile' },
  { command: 'lang', description: 'Язык / Language' },
];

bot.launch({ dropPendingUpdates: true }).catch((e) => {
  log.error('Не удалось запустить бота:', e.message);
  process.exit(1);
});

bot.telegram.setMyCommands(COMMANDS).catch(() => {});

log.info('Features:', JSON.stringify(config.features));
log.info('✅ GameReviewBot запущен. Открой Telegram и напиши /start');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
