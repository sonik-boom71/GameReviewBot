'use strict';

/**
 * Форматирование карточки игры в Telegram MarkdownV2 (язык-зависимо).
 * renderCard(card, lang, { full }) -> строка.
 *  full=false: компактный ответ (вердикт, таблица, цена, «что хвалят», резюме)
 *  full=true : всё (жанры, теги, сисреки, дата, разработчик, описание, похожие…)
 */

const { forLang } = require('../i18n');
const md = require('../util/markdown');
const { fmtNum } = require('../util/text');

const DIV = '━━━━━━━━━━━━━━━━━━━━';

function ratingsTable(card, t) {
  const rows = [[t('tbl_source'), t('tbl_score')]];
  const r = card.ratings;
  if (r.steam) rows.push(['Steam', `${r.steam.percent}% (${fmtNum(r.steam.total, card.lang)})`]);
  if (r.opencritic) rows.push(['OpenCritic', `${r.opencritic.score}/100` + (r.opencritic.rec != null ? ` · ${r.opencritic.rec}%` : '')]);
  if (r.metacritic && (r.metacritic.critic != null || r.metacritic.user != null)) {
    const parts = [];
    if (r.metacritic.critic != null) parts.push(`${r.metacritic.critic}/100`);
    if (r.metacritic.user != null) parts.push(`${r.metacritic.user}/10`);
    rows.push(['Metacritic', parts.join(' · ')]);
  }
  if (r.igdb && (r.igdb.critic != null || r.igdb.user != null)) {
    rows.push(['IGDB', `${(r.igdb.critic != null ? r.igdb.critic : r.igdb.user)}/100`]);
  }
  if (rows.length === 1) return null;
  return md.codeBlock(md.table(rows));
}

function priceBlock(card, t) {
  const lines = [t('sec_price')];
  if (card.basePrice && card.basePrice.isFree) {
    lines.push(md.esc(t('price_free')));
  } else if (card.prices && card.prices.length) {
    const parts = card.prices.map((p) => {
      let s = p.final;
      if (p.discountPercent > 0) s += ` (−${p.discountPercent}%)`;
      return s;
    });
    lines.push(md.esc(parts.join('  ·  ')));
  } else if (card.basePrice && card.basePrice.final) {
    lines.push(md.esc(card.basePrice.final));
  } else {
    lines.push(md.esc(t('no_data')));
  }
  if (card.bestEver && typeof card.bestEver.price === 'number') {
    lines.push(md.esc(t('price_best_ever', { price: `${card.bestEver.price} ${card.bestEver.currency || ''}`.trim() })));
  }
  if (card.buyUrl) lines.push(t('price_buy', { url: md.escUrl(card.buyUrl) }));
  return lines.join('\n');
}

function bullets(items) {
  return items.map((x) => `• ${md.esc(x)}`).join('\n');
}

function footer(card, t) {
  const on = [];
  if (card.sources.steam) on.push('Steam');
  if (card.sources.opencritic) on.push('OpenCritic');
  if (card.sources.metacritic) on.push('Metacritic');
  if (card.sources.igdb) on.push('IGDB');
  if (card.sources.itad) on.push('ITAD');
  const line = [];
  if (on.length) line.push(md.esc('📚 ' + on.join(' · ')));
  if (card.sources.ai) line.push(card.lang === 'ru' ? md.esc('🤖 ИИ-анализ') : md.esc('🤖 AI analysis'));
  return line.join('   ');
}

function renderCard(card, lang = 'ru', { full = false } = {}) {
  const t = forLang(lang);
  const out = [];

  out.push(`🎮 *${md.esc(card.name)}*`);
  out.push(t('rating_stars', { stars: card.stars.render, value: card.stars.value }));
  out.push(`*${t('verdict_label')}:* ${card.verdict.emoji} *${md.esc(t('verdict_' + card.verdict.level))}*`);
  out.push('');
  out.push(DIV);

  const table = ratingsTable(card, t);
  if (table) {
    out.push(t('sec_ratings'));
    out.push(table);
  }

  out.push('');
  out.push(priceBlock(card, t));

  if (full) {
    if (card.genres && card.genres.length) {
      out.push('');
      out.push(`${t('sec_genres')}: ${md.esc(card.genres.join(', '))}`);
    }
    if (card.tags && card.tags.length) {
      out.push(`${t('sec_tags')}: ${md.esc(card.tags.slice(0, 8).join(', '))}`);
    }
    if (card.releaseDate) {
      out.push('');
      out.push(`${t('sec_release')}: ${md.esc(card.releaseDate)}`);
    }
    if (card.developers && card.developers.length) out.push(`${t('sec_dev')}: ${md.esc(card.developers.join(', '))}`);
    if (card.publishers && card.publishers.length) out.push(`${t('sec_pub')}: ${md.esc(card.publishers.join(', '))}`);
    if (card.players && typeof card.players.current === 'number') {
      out.push('');
      out.push(`${t('sec_players')}: ${md.esc(t('players_current', { n: fmtNum(card.players.current, lang) }))}`);
    }
    if (card.description) {
      out.push('');
      out.push(t('sec_about'));
      out.push(`_${md.esc(card.description)}_`);
    }
    if (card.sysReq && card.sysReq.min) {
      out.push('');
      out.push(t('sec_sysreq'));
      out.push(md.codeBlock(`${t('sysreq_min')}:\n${card.sysReq.min}`));
    }
  }

  if (card.analysis && card.analysis.praise && card.analysis.praise.length) {
    out.push('');
    out.push(t('sec_praise'));
    out.push(bullets(card.analysis.praise));
  }
  if (full && card.analysis && card.analysis.criticism && card.analysis.criticism.length) {
    out.push('');
    out.push(t('sec_criticism'));
    out.push(bullets(card.analysis.criticism));
  }

  if (full && card.similar && card.similar.length) {
    out.push('');
    out.push(t('sec_similar'));
    out.push(
      card.similar
        .map((s) => `• ${md.esc(s.name)}${s.rating != null ? md.esc(` — ${s.rating}/100`) : ''}`)
        .join('\n')
    );
  }

  if (card.analysis && card.analysis.summary) {
    out.push('');
    out.push(`${t('sec_summary')}: ${md.esc(card.analysis.summary)}`);
  }

  out.push('');
  out.push(DIV);
  const f = footer(card, t);
  if (f) out.push(f);

  return out.join('\n');
}

/** Компактное сравнение двух игр (#9). */
function renderCompare(a, b, lang = 'ru') {
  const t = forLang(lang);
  const line = (label, va, vb) => `${md.esc(label)}: ${md.esc(va)}  ⟷  ${md.esc(vb)}`;
  const stars = (c) => `${c.stars.value}/5`;
  const steamPct = (c) => (c.ratings.steam ? `${c.ratings.steam.percent}%` : '—');
  const price = (c) => (c.basePrice && c.basePrice.isFree ? t('price_free') : c.prices[0] ? c.prices[0].final : '—');

  return [
    `${t('compare_title')}`,
    '',
    `🎮 *${md.esc(a.name)}*  ⟷  *${md.esc(b.name)}*`,
    '',
    line(t('verdict_label'), `${a.verdict.emoji} ${stars(a)}`, `${b.verdict.emoji} ${stars(b)}`),
    line('Steam', steamPct(a), steamPct(b)),
    line(t('sec_price'), price(a), price(b)),
  ].join('\n');
}

module.exports = { renderCard, renderCompare };
