'use strict';

/**
 * Фабрики inline-клавиатур (#9). callback_data компактные (≤64 байт): action:arg.
 */

const { Markup } = require('telegraf');
const { forLang } = require('../i18n');
const igdb = require('../services/igdb');

/** Клавиатура под карточкой игры. */
function reviewKeyboard(card, lang, isFav) {
  const t = forLang(lang);
  const id = card.appid;
  const rows = [
    [Markup.button.callback(t('btn_details'), `more:${id}`), Markup.button.callback(t('btn_compare'), `cmp:${id}`)],
    [
      Markup.button.callback(t('btn_similar'), `sim:${id}`),
      isFav
        ? Markup.button.callback(t('btn_unfavorite'), `unfav:${id}`)
        : Markup.button.callback(t('btn_favorite'), `fav:${id}`),
    ],
  ];
  const third = [];
  if (card.priceHistory && card.priceHistory.length > 1) third.push(Markup.button.callback(t('btn_price_chart'), `chart:${id}`));
  if (card.buyUrl) third.push(Markup.button.url(t('btn_buy'), card.buyUrl));
  if (third.length) rows.push(third);
  return Markup.inlineKeyboard(rows);
}

function langKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🇷🇺 Русский', 'lang:ru'), Markup.button.callback('🇬🇧 English', 'lang:en')],
  ]);
}

/** Клавиатура выбора жанра для /top (#21). */
function topGenresKeyboard(lang) {
  const names = Object.keys(igdb.GENRES);
  const rows = [];
  for (let i = 0; i < names.length; i += 3) {
    rows.push(names.slice(i, i + 3).map((g) => Markup.button.callback(g, `top:${g}`)));
  }
  return Markup.inlineKeyboard(rows);
}

/** Кнопки быстрого повтора для /history (#10). */
function historyKeyboard(history, lang) {
  const t = forLang(lang);
  const rows = history.slice(0, 10).map((h) => [
    Markup.button.callback(t('btn_repeat', { name: h.name.slice(0, 40) }), `rev:${h.appid}`),
  ]);
  return Markup.inlineKeyboard(rows);
}

/** Кнопки открытия для /favorites (#11). */
function favoritesKeyboard(favs, lang) {
  const rows = favs.slice(0, 10).map((f) => [
    Markup.button.callback(`🎮 ${f.name.slice(0, 40)}`, `rev:${f.appid}`),
    Markup.button.callback('💔', `unfav:${f.appid}`),
  ]);
  return Markup.inlineKeyboard(rows);
}

module.exports = {
  reviewKeyboard,
  langKeyboard,
  topGenresKeyboard,
  historyKeyboard,
  favoritesKeyboard,
};
