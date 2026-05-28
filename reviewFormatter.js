'use strict';

/**
 * reviewFormatter.js — анализ отзывов через GPT, расчёт вердикта и
 * сборка финального сообщения в формате Telegram MarkdownV2.
 *
 * Если OPENAI_API_KEY не задан или запрос упал — используется эвристика
 * (короткие цитаты из реальных отзывов), бот продолжает работать.
 */

const OpenAI = require('openai');

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
// Поддержка любого OpenAI-совместимого провайдера (OpenAI, Groq, Gemini,
// OpenRouter, Ollama) через OPENAI_BASE_URL. Для локального Ollama ключ
// не нужен, поэтому подставляем заглушку, если задан только base URL.
const LLM_BASE_URL = process.env.OPENAI_BASE_URL || undefined;
const LLM_KEY = process.env.OPENAI_API_KEY || (LLM_BASE_URL ? 'local' : '');
const openai = LLM_KEY
  ? new OpenAI({ apiKey: LLM_KEY, baseURL: LLM_BASE_URL })
  : null;

// Бесплатные модели иногда оборачивают JSON в ```-блок — парсим устойчиво.
function parseJsonLoose(raw) {
  let t = String(raw || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch (_) {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('LLM вернул не-JSON');
  }
}

// ── MarkdownV2 helpers ──────────────────────────────────────
// Telegram MarkdownV2 требует экранирования спецсимволов в обычном тексте.
const esc = (t) =>
  String(t == null ? '' : t).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
// Внутри ``` ``` блока экранируются только обратный слэш и бэктик.
const escCode = (t) => String(t == null ? '' : t).replace(/[`\\]/g, '\\$&');
// В URL ссылки экранируются только ) и \.
const escUrl = (u) => String(u == null ? '' : u).replace(/[)\\]/g, '\\$&');

const fmtNum = (n) =>
  typeof n === 'number' ? n.toLocaleString('ru-RU') : String(n);

const shorten = (t, n = 90) => {
  const s = String(t).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};

// ── 1. Саммари отзывов ──────────────────────────────────────
async function summarizeReviews(gameName, sample) {
  if (!sample || !sample.length) {
    return {
      praise: [],
      criticism: [],
      summary: 'Недостаточно отзывов для анализа.',
      source: 'none',
    };
  }

  if (!openai) return heuristicSummary(sample);

  try {
    const reviewsText = sample
      .map(
        (r, i) =>
          `${i + 1}. [${r.votedUp ? 'положительный' : 'отрицательный'}] ${r.text}`
      )
      .join('\n');

    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Ты — опытный игровой критик. По отзывам игроков из Steam кратко и по делу выделяешь сильные и слабые стороны игры. Отвечай ТОЛЬКО на русском языке и строго в формате JSON.',
        },
        {
          role: 'user',
          content:
            `Игра: ${gameName}\n\nОтзывы игроков:\n${reviewsText}\n\n` +
            'Проанализируй отзывы и верни строго такой JSON:\n' +
            '{\n  "praise": ["..."],     // 3-5 коротких пунктов: что хвалят\n' +
            '  "criticism": ["..."],  // 2-5 коротких пунктов: что ругают\n' +
            '  "summary": "..."        // итог в 2-3 предложениях\n}\n' +
            'Пункты — короткие фразы до 70 символов, без нумерации и кавычек.',
        },
      ],
    });

    const parsed = parseJsonLoose(completion.choices[0].message.content);
    const arr = (a) =>
      Array.isArray(a) ? a.map(String).map((s) => shorten(s, 80)).slice(0, 6) : [];

    return {
      praise: arr(parsed.praise),
      criticism: arr(parsed.criticism),
      summary:
        (typeof parsed.summary === 'string' && parsed.summary.trim()) ||
        'Общий вывод сформировать не удалось.',
      source: 'gpt',
    };
  } catch (e) {
    console.error('OpenAI error:', e.message);
    return heuristicSummary(sample);
  }
}

function heuristicSummary(sample) {
  const pos = sample.filter((r) => r.votedUp).slice(0, 3).map((r) => shorten(r.text));
  const neg = sample.filter((r) => !r.votedUp).slice(0, 3).map((r) => shorten(r.text));
  return {
    praise: pos.length ? pos : ['Игроки в целом довольны'],
    criticism: neg.length ? neg : ['Явных жалоб не выделено'],
    summary:
      'Анализ без ИИ: выше приведены цитаты из реальных отзывов игроков. ' +
      'Добавь OPENAI_API_KEY в .env, чтобы получать осмысленные выжимки.',
    source: 'heuristic',
  };
}

// ── 2. Вердикт ──────────────────────────────────────────────
function computeVerdict({ steamPositive, opencriticScore, discountPercent }) {
  const signals = [];
  if (typeof steamPositive === 'number') signals.push(steamPositive);
  if (typeof opencriticScore === 'number') signals.push(opencriticScore);

  if (!signals.length) return { emoji: '🤔', text: 'Недостаточно данных' };

  const combined = signals.reduce((a, b) => a + b, 0) / signals.length;
  const hasDiscount = typeof discountPercent === 'number' && discountPercent > 0;

  if (combined >= 90) return { emoji: '🟢', text: 'Смело покупай' };
  if (combined >= 80)
    return hasDiscount
      ? { emoji: '🟢', text: 'Стоит брать — и сейчас отличная скидка' }
      : { emoji: '✅', text: 'Стоит брать' };
  if (combined >= 70)
    return hasDiscount
      ? { emoji: '✅', text: 'Можно брать со скидкой' }
      : { emoji: '🟡', text: 'Лучше подождать скидку' };
  if (combined >= 55) return { emoji: '🟠', text: 'Осторожно' };
  return { emoji: '🔴', text: 'Лучше пройти мимо' };
}

// ── 3. Вспомогательные части сообщения ──────────────────────
function priceText(price) {
  if (!price) return 'нет данных';
  if (price.isFree) return 'Бесплатно';
  if (price.discountPercent > 0)
    return `${price.final}  (−${price.discountPercent}%, было ${price.initial})`;
  return price.final || 'нет данных';
}

// Моноширинная «таблица» (Telegram не умеет настоящие MD-таблицы,
// поэтому выравниваем колонки внутри code-блока).
function buildRatingsTable(steam, oc) {
  const steamVal =
    steam && steam.positivePercent != null
      ? `${steam.positivePercent}% положит. (${fmtNum(steam.totalReviews)} отз.)`
      : 'нет данных';

  const ocVal =
    oc && oc.score != null
      ? `${oc.score}/100` +
        (oc.percentRecommended != null
          ? ` · ${oc.percentRecommended}% реком.`
          : '')
      : 'нет данных';

  const rows = [
    ['Источник', 'Оценка'],
    ['Steam', steamVal],
    ['OpenCritic', ocVal],
  ];

  const w0 = Math.max(...rows.map((r) => r[0].length));
  const w1 = Math.max(...rows.map((r) => r[1].length));
  const sep = `+${'-'.repeat(w0 + 2)}+${'-'.repeat(w1 + 2)}+`;
  const line = (r) => `| ${r[0].padEnd(w0)} | ${r[1].padEnd(w1)} |`;

  return [sep, line(rows[0]), sep, line(rows[1]), line(rows[2]), sep].join('\n');
}

// ── 4. Финальное сообщение (MarkdownV2) ─────────────────────
function formatReview({ gameName, verdict, steam, opencritic, price, analysis }) {
  const divider = '━━━━━━━━━━━━━━━━━━━━';
  const out = [];

  out.push(`🎮 *${esc(gameName)}*`);
  out.push('');
  out.push(`*Вердикт:* ${verdict.emoji} *${esc(verdict.text)}*`);
  out.push('');
  out.push(divider);
  out.push('');
  out.push('📊 *Сводка рейтингов*');
  out.push('```');
  out.push(escCode(buildRatingsTable(steam, opencritic)));
  out.push('```');
  out.push('');
  out.push(`💰 *Цена:* ${esc(priceText(price))}`);
  out.push('');

  out.push('👍 *Что хвалят*');
  if (analysis.praise.length) {
    analysis.praise.forEach((p) => out.push(`• ${esc(p)}`));
  } else {
    out.push('• нет данных');
  }
  out.push('');

  out.push('👎 *Что ругают*');
  if (analysis.criticism.length) {
    analysis.criticism.forEach((c) => out.push(`• ${esc(c)}`));
  } else {
    out.push('• нет данных');
  }
  out.push('');

  out.push(`🎯 *Вердикт:* ${esc(analysis.summary)}`);
  out.push('');
  out.push(divider);

  const links = [];
  if (steam && steam.storeUrl)
    links.push(`[Steam](${escUrl(steam.storeUrl)})`);
  if (opencritic && opencritic.url)
    links.push(`[OpenCritic](${escUrl(opencritic.url)})`);
  if (links.length) out.push('🔗 ' + links.join('  ·  '));

  const note =
    analysis.source === 'gpt'
      ? '🤖 _выжимка отзывов сделана ИИ_'
      : analysis.source === 'heuristic'
      ? '📝 _цитаты из реальных отзывов_'
      : '';
  if (note) out.push(note);

  return out.join('\n');
}

// Грубая «очистка» MarkdownV2 на случай, если Telegram отклонит разметку.
function stripMarkdown(text) {
  return String(text)
    .replace(/\\([_*[\]()~`>#+\-=|{}.!\\])/g, '$1')
    .replace(/[*`_]/g, '');
}

module.exports = {
  summarizeReviews,
  computeVerdict,
  formatReview,
  stripMarkdown,
};
