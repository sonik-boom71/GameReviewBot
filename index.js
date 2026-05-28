'use strict';

/**
 * index.js — GameReviewBot.
 *
 * Команда /review <название игры> собирает данные из Steam и OpenCritic,
 * делает выжимку отзывов (GPT или эвристика) и выдаёт структурированный
 * обзор с вердиктом. Обычный текст без команды тоже работает как запрос.
 */

require('dotenv').config();

const { Telegraf } = require('telegraf');

const { getSteamData } = require('./steamApi');
const { getOpenCriticData } = require('./openCriticApi');
const {
  summarizeReviews,
  computeVerdict,
  formatReview,
  stripMarkdown,
} = require('./reviewFormatter');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ Не задан BOT_TOKEN в .env');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ── /start и /help ──────────────────────────────────────────
const START = [
  '👋 *GameReviewBot* — помощник по выбору игр\\.',
  '',
  'Собираю данные из *Steam* и *OpenCritic*, анализирую отзывы игроков и подсказываю, стоит ли покупать\\.',
  '',
  '📌 *Как пользоваться*',
  'Отправь название игры после команды:',
  '`/review Elden Ring`',
  '',
  'Или просто пришли название сообщением\\.',
  '',
  '*Примеры*',
  '• `/review Cyberpunk 2077`',
  '• `/review Hades`',
  '• `/review Baldurs Gate 3`',
  '',
  '⚙️ Источники: Steam \\(отзывы и цена\\), OpenCritic \\(оценки критиков\\), ИИ\\-выжимка отзывов\\.',
].join('\n');

const sendStart = (ctx) =>
  ctx.reply(START, { parse_mode: 'MarkdownV2', disable_web_page_preview: true });

bot.start(sendStart);
bot.help(sendStart);

// ── Основной обработчик обзора ──────────────────────────────
async function handleReview(ctx, query) {
  const name = (query || '').trim();
  if (name.length < 2) {
    return ctx.reply(
      'Укажи название игры. Пример:\n/review Elden Ring'
    );
  }

  let loading;
  try {
    loading = await ctx.reply(`🔍 Собираю данные про «${name}»…`);
    await ctx.sendChatAction('typing').catch(() => {});

    // Steam и OpenCritic — параллельно
    const [steam, opencritic] = await Promise.all([
      getSteamData(name).catch((e) => {
        console.error('Steam error:', e.message);
        return null;
      }),
      getOpenCriticData(name).catch((e) => {
        console.error('OpenCritic error:', e.message);
        return null;
      }),
    ]);

    if (!steam) {
      return editOrReply(
        ctx,
        loading,
        `❌ Не нашёл «${name}» в Steam.\n` +
          'Проверь название (лучше на английском) и попробуй снова.',
        false
      );
    }

    const sample = steam.reviews ? steam.reviews.sample : [];
    const analysis = await summarizeReviews(steam.name, sample);

    const verdict = computeVerdict({
      steamPositive:
        steam.reviews && steam.reviews.positivePercent != null
          ? steam.reviews.positivePercent
          : undefined,
      opencriticScore:
        opencritic && opencritic.score != null ? opencritic.score : undefined,
      discountPercent: steam.price ? steam.price.discountPercent : undefined,
    });

    const text = formatReview({
      gameName: steam.name,
      verdict,
      steam: {
        positivePercent: steam.reviews
          ? steam.reviews.positivePercent
          : null,
        totalReviews: steam.reviews ? steam.reviews.totalReviews : 0,
        storeUrl: steam.storeUrl,
      },
      opencritic,
      price: steam.price,
      analysis,
    });

    await editOrReply(ctx, loading, text, true);
  } catch (e) {
    console.error('handleReview fatal:', e);
    await editOrReply(
      ctx,
      loading,
      '⚠️ Что-то пошло не так при сборе данных. Попробуй ещё раз чуть позже.',
      false
    );
  }
}

/**
 * Редактирует «loading»-сообщение результатом. При ошибке разметки
 * MarkdownV2 откатывается на чистый текст, чтобы пользователь всё равно
 * получил ответ.
 */
async function editOrReply(ctx, loading, text, markdown) {
  const opts = markdown
    ? { parse_mode: 'MarkdownV2', disable_web_page_preview: true }
    : { disable_web_page_preview: true };

  const chatId = loading && loading.chat && loading.chat.id;
  const msgId = loading && loading.message_id;

  try {
    if (chatId && msgId) {
      await ctx.telegram.editMessageText(chatId, msgId, undefined, text, opts);
    } else {
      await ctx.reply(text, opts);
    }
    return;
  } catch (e) {
    console.error('send failed, retry as plain text:', e.message);
  }

  // Фоллбэк: без разметки
  const plain = markdown ? stripMarkdown(text) : text;
  try {
    if (chatId && msgId) {
      await ctx.telegram.editMessageText(chatId, msgId, undefined, plain);
    } else {
      await ctx.reply(plain);
    }
  } catch (e2) {
    console.error('plain send failed:', e2.message);
    await ctx.reply(plain).catch(() => {});
  }
}

// ── Команда /review ─────────────────────────────────────────
bot.command('review', (ctx) => {
  const text = ctx.message && ctx.message.text ? ctx.message.text : '';
  const parts = text.trim().split(/\s+/);
  parts.shift(); // убираем сам /review (или /review@Bot)
  return handleReview(ctx, parts.join(' '));
});

// ── Любой другой текст: команды-неизвестные подсказываем,
//    обычный текст трактуем как название игры ─────────────────
bot.on('text', (ctx) => {
  const text = (ctx.message.text || '').trim();
  if (text.startsWith('/')) {
    return ctx.reply(
      'Неизвестная команда. Используй:\n/review <название игры>\n/start — справка'
    );
  }
  return handleReview(ctx, text);
});

// ── Глобальный перехват ошибок ──────────────────────────────
bot.catch((err, ctx) => {
  console.error(`Telegraf error for ${ctx && ctx.updateType}:`, err);
});

// ── Запуск ──────────────────────────────────────────────────
bot.launch().catch((e) => {
  console.error('❌ Не удалось запустить бота:', e.message);
  process.exit(1);
});
// launch() в Telegraf v4 резолвится только при остановке, поэтому
// сообщение о старте печатаем сразу после запуска поллинга.
console.log('✅ GameReviewBot запущен. Открой Telegram и напиши боту /start');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
