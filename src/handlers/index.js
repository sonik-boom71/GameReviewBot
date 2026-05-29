'use strict';

/**
 * Регистрация всех обработчиков команд и callback-кнопок, поддержка групп (#22),
 * отправка карточки игры (медиагруппа + текст + клавиатура).
 */

const config = require('../config');
const log = require('../util/logger').create('handlers');
const store = require('../db/store');
const { forLang } = require('../i18n');
const md = require('../util/markdown');

const { buildCard, buildCardByAppid } = require('../services/aggregator');
const igdb = require('../services/igdb');
const steam = require('../services/steam');
const chart = require('../services/chart');
const { renderCard, renderCompare } = require('../format/card');
const kb = require('../keyboards');

// Ожидание ввода второй игры для сравнения (#9): userId -> { appid, name }
const pendingCompare = new Map();

const langOf = (ctx) => store.getLang(ctx.from.id);

// ── Безопасная отправка/редактирование MarkdownV2 ───────────
async function safeReply(ctx, text, extra = {}) {
  const opts = { parse_mode: 'MarkdownV2', disable_web_page_preview: true, ...extra };
  try {
    return await ctx.reply(text, opts);
  } catch (e) {
    log.warn('reply MarkdownV2 failed, fallback to plain:', e.message);
    const { parse_mode, ...rest } = opts;
    return ctx.reply(md.strip(text), rest);
  }
}

async function safeEdit(ctx, text, extra = {}) {
  const opts = { parse_mode: 'MarkdownV2', disable_web_page_preview: true, ...extra };
  try {
    return await ctx.editMessageText(text, opts);
  } catch (e) {
    log.debug('edit failed:', e.message);
    return null;
  }
}

// ── Отправка медиагруппы (обложка + скриншоты) (#7, #17) ────
async function sendMedia(ctx, card) {
  const urls = [];
  if (card.cover) urls.push(card.cover);
  for (const s of card.screenshots) if (urls.length < 4) urls.push(s);
  if (!urls.length) return;
  const group = urls.map((url, i) => ({
    type: 'photo',
    media: url,
    ...(i === 0 ? { caption: `🎮 ${card.name}` } : {}),
  }));
  try {
    await ctx.replyWithMediaGroup(group);
  } catch (e) {
    log.warn('media group failed:', e.message);
  }
}

// ── Отправка карточки целиком ───────────────────────────────
async function sendCard(ctx, card, lang) {
  store.addHistory(ctx.from.id, {
    name: card.name,
    appid: card.appid,
    genres: card.genres || [],
  });
  await sendMedia(ctx, card);
  const isFav = store.isFavorite(ctx.from.id, card.appid);
  await safeReply(ctx, renderCard(card, lang, { full: false }), {
    reply_markup: kb.reviewKeyboard(card, lang, isFav).reply_markup,
  });
}

// ── /review и обычный текст ─────────────────────────────────
async function handleReview(ctx, query, lang) {
  const t = forLang(lang);
  const name = (query || '').trim();
  if (name.length < 2) return safeReply(ctx, t('usage_review'));

  let loading;
  try {
    loading = await ctx.reply(md.strip(t('searching', { name })));
    await ctx.sendChatAction('typing').catch(() => {});
    const card = await buildCard(name, lang);
    if (loading) await ctx.telegram.deleteMessage(loading.chat.id, loading.message_id).catch(() => {});
    if (card.notFound) return safeReply(ctx, t('not_found', { name }));
    await sendCard(ctx, card, lang);
  } catch (e) {
    log.error('handleReview error:', e);
    if (loading) await ctx.telegram.deleteMessage(loading.chat.id, loading.message_id).catch(() => {});
    return safeReply(ctx, t('error_generic'));
  }
}

// ── Команды ─────────────────────────────────────────────────
function cmdArg(ctx) {
  const text = (ctx.message && ctx.message.text) || '';
  const parts = text.trim().split(/\s+/);
  parts.shift();
  return parts.join(' ').trim();
}

async function onStart(ctx) {
  store.getUser(ctx.from.id);
  return safeReply(ctx, forLang(langOf(ctx))('start_welcome'));
}

async function onLang(ctx) {
  return safeReply(ctx, forLang(langOf(ctx))('choose_lang'), {
    reply_markup: kb.langKeyboard().reply_markup,
  });
}

async function onHistory(ctx) {
  const lang = langOf(ctx);
  const t = forLang(lang);
  const history = store.getHistory(ctx.from.id);
  if (!history.length) return safeReply(ctx, t('history_empty'));
  return safeReply(ctx, t('history_title'), { reply_markup: kb.historyKeyboard(history, lang).reply_markup });
}

async function onFavorites(ctx) {
  const lang = langOf(ctx);
  const t = forLang(lang);
  const favs = store.getFavorites(ctx.from.id);
  if (!favs.length) return safeReply(ctx, t('favorites_empty'));
  return safeReply(ctx, t('favorites_title'), { reply_markup: kb.favoritesKeyboard(favs, lang).reply_markup });
}

async function onProfile(ctx) {
  const lang = langOf(ctx);
  const t = forLang(lang);
  const p = store.getProfile(ctx.from.id);
  const lines = [
    t('profile_title'),
    '',
    md.esc('• ') + t('profile_viewed', { n: p.viewed }),
    md.esc('• ') + t('profile_favs', { n: p.favoritesCount }),
    md.esc('• ') + t('profile_genre', { genre: p.favoriteGenre || t('profile_none') }),
  ];
  if (p.recent.length) {
    lines.push('');
    lines.push(t('profile_recent'));
    lines.push(p.recent.map((r) => `• ${md.esc(r.name)}`).join('\n'));
  }
  return safeReply(ctx, lines.join('\n'));
}

async function onRandom(ctx) {
  const lang = langOf(ctx);
  const t = forLang(lang);
  const loading = await ctx.reply(md.strip(t('random_loading')));
  try {
    let name = igdb.available ? await igdb.randomTop() : null;
    if (!name) {
      const top = await steam.getTopSellers();
      if (top.length) name = top[Math.floor(Math.random() * top.length)].name;
    }
    await ctx.telegram.deleteMessage(loading.chat.id, loading.message_id).catch(() => {});
    if (!name) return safeReply(ctx, t('error_generic'));
    const card = await buildCard(name, lang);
    if (card.notFound) return safeReply(ctx, t('error_generic'));
    return sendCard(ctx, card, lang);
  } catch (e) {
    log.error('random error:', e);
    await ctx.telegram.deleteMessage(loading.chat.id, loading.message_id).catch(() => {});
    return safeReply(ctx, t('error_generic'));
  }
}

async function onTop(ctx) {
  const lang = langOf(ctx);
  const t = forLang(lang);
  if (!igdb.available) return safeReply(ctx, t('source_unavailable') + ' \\(IGDB\\)');
  return safeReply(ctx, t('top_choose'), {
    reply_markup: kb.topGenresKeyboard(lang).reply_markup,
  });
}

// ── Callback-кнопки ─────────────────────────────────────────
async function onCallback(ctx) {
  const lang = langOf(ctx);
  const t = forLang(lang);
  const dataStr = ctx.callbackQuery && ctx.callbackQuery.data ? ctx.callbackQuery.data : '';
  const [action, ...rest] = dataStr.split(':');
  const arg = rest.join(':');

  try {
    switch (action) {
      case 'lang': {
        const newLang = arg === 'en' ? 'en' : 'ru';
        store.setLang(ctx.from.id, newLang);
        await ctx.answerCbQuery();
        return safeEdit(ctx, forLang(newLang)('lang_set'));
      }
      case 'more': {
        await ctx.answerCbQuery();
        const card = await buildCardByAppid(Number(arg), lang);
        if (card.notFound) return;
        const isFav = store.isFavorite(ctx.from.id, card.appid);
        return safeEdit(ctx, renderCard(card, lang, { full: true }), {
          reply_markup: kb.reviewKeyboard(card, lang, isFav).reply_markup,
        });
      }
      case 'sim': {
        await ctx.answerCbQuery();
        const card = await buildCardByAppid(Number(arg), lang);
        if (card.notFound || !card.similar.length) return safeReply(ctx, t('no_data'));
        const list = [t('sec_similar'), card.similar.map((s) => `• ${md.esc(s.name)}${s.rating != null ? md.esc(` — ${s.rating}/100`) : ''}`).join('\n')].join('\n');
        return safeReply(ctx, list);
      }
      case 'fav':
      case 'unfav': {
        const card = await buildCardByAppid(Number(arg), lang);
        if (card.notFound) return ctx.answerCbQuery('?');
        if (action === 'fav') {
          store.addFavorite(ctx.from.id, { appid: card.appid, name: card.name, genres: card.genres });
          await ctx.answerCbQuery(md.strip(t('added_to_fav', { name: card.name })));
        } else {
          store.removeFavorite(ctx.from.id, card.appid);
          await ctx.answerCbQuery(md.strip(t('removed_from_fav', { name: card.name })));
        }
        const isFav = store.isFavorite(ctx.from.id, card.appid);
        return ctx.editMessageReplyMarkup(kb.reviewKeyboard(card, lang, isFav).reply_markup).catch(() => {});
      }
      case 'chart': {
        await ctx.answerCbQuery();
        const card = await buildCardByAppid(Number(arg), lang);
        if (card.notFound || !card.priceHistory.length) return safeReply(ctx, t('no_data'));
        const url = await chart.priceChartUrl(card.priceHistory, `${card.name} — price`);
        if (!url) return safeReply(ctx, t('no_data'));
        return ctx.replyWithPhoto(url).catch(() => safeReply(ctx, t('no_data')));
      }
      case 'cmp': {
        const card = await buildCardByAppid(Number(arg), lang);
        if (card.notFound) return ctx.answerCbQuery('?');
        pendingCompare.set(ctx.from.id, { appid: card.appid, name: card.name });
        await ctx.answerCbQuery();
        return safeReply(ctx, t('compare_prompt', { name: card.name }));
      }
      case 'rev': {
        await ctx.answerCbQuery();
        const card = await buildCardByAppid(Number(arg), lang);
        if (card.notFound) return safeReply(ctx, t('error_generic'));
        return sendCard(ctx, card, lang);
      }
      case 'top': {
        await ctx.answerCbQuery();
        const rows = await igdb.topByGenre(arg);
        if (!rows || !rows.length) return safeEdit(ctx, t('source_unavailable'));
        const body = rows.map((g, i) => `${md.esc(`${i + 1}.`)} ${md.esc(g.name)}${g.score != null ? md.esc(` — ${g.score}/100`) : ''}${g.year ? md.esc(` (${g.year})`) : ''}`).join('\n');
        return safeEdit(ctx, `${t('top_title', { genre: arg })}\n\n${body}`);
      }
      default:
        return ctx.answerCbQuery();
    }
  } catch (e) {
    log.error('callback error:', e);
    return ctx.answerCbQuery(md.strip(t('error_generic'))).catch(() => {});
  }
}

// ── Текстовые сообщения (с учётом групп #22 и сравнения #9) ──
async function onText(ctx) {
  const text = (ctx.message.text || '').trim();
  if (!text || text.startsWith('/')) return;

  const lang = langOf(ctx);
  let query = text;

  // В группах реагируем только на упоминание бота (#22)
  if (ctx.chat.type !== 'private') {
    const uname = ctx.botInfo && ctx.botInfo.username;
    if (!uname || !text.includes('@' + uname)) return;
    query = text.split('@' + uname).join('').trim();
  }

  // Ожидается вторая игра для сравнения?
  const pend = pendingCompare.get(ctx.from.id);
  if (pend) {
    pendingCompare.delete(ctx.from.id);
    const t = forLang(lang);
    try {
      const [a, b] = await Promise.all([buildCardByAppid(pend.appid, lang), buildCard(query, lang)]);
      if (!b || b.notFound) return safeReply(ctx, t('not_found', { name: query }));
      return safeReply(ctx, renderCompare(a, b, lang));
    } catch (e) {
      log.error('compare error:', e);
      return safeReply(ctx, t('error_generic'));
    }
  }

  return handleReview(ctx, query, lang);
}

// ── Регистрация ─────────────────────────────────────────────
function register(bot) {
  bot.start(onStart);
  bot.help((ctx) => safeReply(ctx, forLang(langOf(ctx))('help')));
  bot.command('review', (ctx) => handleReview(ctx, cmdArg(ctx), langOf(ctx)));
  bot.command('lang', onLang);
  bot.command('history', onHistory);
  bot.command('favorites', onFavorites);
  bot.command('profile', onProfile);
  bot.command('random', onRandom);
  bot.command('top', onTop);
  bot.on('callback_query', onCallback);
  bot.on('text', onText);
}

module.exports = { register };
