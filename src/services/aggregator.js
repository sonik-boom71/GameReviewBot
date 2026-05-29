'use strict';

/**
 * Агрегатор: собирает данные из всех источников в единую модель GameCard,
 * считает вердикт (#18) и звёзды (#19). Каждый источник изолирован: если он
 * упал/недоступен — его секция просто пропускается (бот не падает).
 */

const cache = require('../util/cache');
const config = require('../config');
const log = require('../util/logger').create('aggregator');

const steam = require('./steam');
const opencritic = require('./opencritic');
const metacritic = require('./metacritic');
const igdb = require('./igdb');
const itad = require('./itad');
const llm = require('./llm');
const translate = require('./translate');
const rating = require('../util/rating');

const itadCountry = (lang) => (lang === 'ru' ? 'RU' : 'US');

async function settle(promise, label) {
  try {
    return await promise;
  } catch (e) {
    log.warn(`${label} failed:`, e.message);
    return null;
  }
}

/** Собирает полную карточку игры по названию. lang: 'ru'|'en'. */
async function buildCard(name, lang = 'ru') {
  return cache.getOrLoad(`card:${name.toLowerCase()}:${lang}`, async () => {
    const game = await steam.searchGame(name);
    if (!game) return { notFound: true, query: name };

    const details = await settle(steam.getDetails(game.appid, lang), 'steam.details');

    const [reviews, prices, players, oc, ig, deal, mc] = await Promise.all([
      settle(steam.getReviews(game.appid), 'steam.reviews'),
      settle(steam.getRegionalPrices(game.appid), 'steam.prices'),
      settle(steam.getCurrentPlayers(game.appid), 'steam.players'),
      settle(opencritic.getOpenCriticData(game.appid ? (details && details.name) || game.name : name), 'opencritic'),
      settle(igdb.getGame((details && details.name) || game.name), 'igdb'),
      settle(itad.getItadData(game.appid, (details && details.name) || game.name, itadCountry(lang)), 'itad'),
      settle(metacritic.getMetacritic((details && details.name) || game.name, details && details.metacriticScore), 'metacritic'),
    ]);

    // ── ИИ-выжимка отзывов (+ перевод для эвристики) (#16) ──
    let analysis = { praise: [], criticism: [], summary: '', source: 'none' };
    if (reviews && reviews.sample && reviews.sample.length) {
      analysis = await settle(llm.summarizeReviews((details && details.name) || game.name, reviews.sample, lang), 'llm') || analysis;
      if (analysis.source === 'heuristic') {
        analysis.praise = await translate.translateAll(analysis.praise, lang);
        analysis.criticism = await translate.translateAll(analysis.criticism, lang);
      }
    }

    // ── Оценки и вердикт ──
    const scores = {
      steam: reviews ? reviews.positivePercent : undefined,
      opencritic: oc ? oc.score : undefined,
      metacriticCritic: mc ? mc.critic : (details ? details.metacriticScore : undefined),
      metacriticUser: mc ? mc.user : undefined,
      igdb: ig ? (ig.critic != null ? ig.critic : ig.user) : undefined,
    };
    const summary = rating.summarize(scores);

    // ── Описание (язык-зависимое) ──
    let description = details && details.shortDescription;
    if (!description && ig && ig.summary) {
      description = (await translate.translate(ig.summary, lang)) || ig.summary;
      description = description.length > 400 ? description.slice(0, 399) + '…' : description;
    }

    return {
      appid: game.appid,
      name: (details && details.name) || (ig && ig.name) || game.name,
      lang,
      verdict: summary.verdict,
      stars: summary.stars,
      avg: summary.avg,
      ratings: {
        steam: reviews && reviews.positivePercent != null ? { percent: reviews.positivePercent, total: reviews.totalReviews } : null,
        opencritic: oc && oc.score != null ? { score: oc.score, rec: oc.percentRecommended, reviews: oc.numReviews, url: oc.url } : null,
        metacritic: mc && (mc.critic != null || mc.user != null) ? { critic: mc.critic, user: mc.user, url: mc.url } : null,
        igdb: ig && (ig.critic != null || ig.user != null) ? { critic: ig.critic, user: ig.user } : null,
      },
      basePrice: details ? details.basePrice : null,
      prices: prices || [],
      bestEver: deal && deal.low ? deal.low : null,
      currentDeal: deal && deal.best ? deal.best : null,
      priceHistory: deal && deal.history ? deal.history : [],
      buyUrl: (deal && deal.best && deal.best.url) || (details && details.storeUrl) || `https://store.steampowered.com/app/${game.appid}`,
      storeUrl: (details && details.storeUrl) || `https://store.steampowered.com/app/${game.appid}`,
      genres: (details && details.genres && details.genres.length ? details.genres : (ig && ig.genres) || []),
      tags: (details && details.tags && details.tags.length ? details.tags : (ig && ig.tags) || []),
      sysReq: details ? details.sysReq : null,
      releaseDate: (details && details.releaseDate) || (ig && ig.releaseDate ? ig.releaseDate.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US') : null),
      developers: (details && details.developers && details.developers.length ? details.developers : (ig && ig.developers) || []),
      publishers: (details && details.publishers && details.publishers.length ? details.publishers : (ig && ig.publishers) || []),
      description,
      cover: (details && details.cover) || (ig && ig.cover) || null,
      screenshots: (details && details.screenshots && details.screenshots.length ? details.screenshots : (ig && ig.screenshots) || []).slice(0, 4),
      trailer: (ig && ig.trailerYoutube) || (details && details.trailer) || null,
      players: players != null ? { current: players } : null,
      similar: (ig && ig.similar ? ig.similar : []).filter((s) => s.name).slice(0, 5),
      sources: {
        steam: Boolean(details || reviews),
        opencritic: Boolean(oc),
        metacritic: Boolean(mc),
        igdb: Boolean(ig),
        itad: Boolean(deal),
        ai: analysis.source === 'gpt',
      },
      analysis,
    };
  });
}

/** Карточка по appid (для кнопок истории/избранного и callback'ов). */
async function buildCardByAppid(appid, lang = 'ru') {
  const d = await settle(steam.getDetails(appid, lang), 'steam.details');
  if (!d || !d.name) return { notFound: true, query: String(appid) };
  return buildCard(d.name, lang);
}

module.exports = { buildCard, buildCardByAppid };
