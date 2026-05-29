'use strict';

/**
 * LLM-сервис: любой OpenAI-совместимый провайдер (OpenAI / Groq / Gemini /
 * Ollama). Делает выжимку отзывов (#1 «что хвалят/ругают» + вердикт-резюме) и
 * предоставляет chat() для перевода-фолбэка (#16) и сравнения (#9).
 */

const OpenAI = require('openai');
const config = require('../config');
const log = require('../util/logger').create('llm');

const client =
  config.llm.apiKey || config.llm.baseUrl
    ? new OpenAI({ apiKey: config.llm.apiKey || 'local', baseURL: config.llm.baseUrl })
    : null;

const available = Boolean(client);

function parseJsonLoose(raw) {
  let t = String(raw || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch (_) {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('LLM returned non-JSON');
  }
}

/** Низкоуровневый чат-вызов. Возвращает строку или null. */
async function chat(messages, { json = false, temperature = 0.4, maxTokens } = {}) {
  if (!client) return null;
  try {
    const res = await client.chat.completions.create({
      model: config.llm.model,
      temperature,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      messages,
    });
    return res.choices[0].message.content;
  } catch (e) {
    log.warn('chat failed:', e.message);
    return null;
  }
}

function heuristic(sample, lang) {
  const cut = (t) => (t.length > 90 ? t.slice(0, 89) + '…' : t);
  const pos = sample.filter((r) => r.votedUp).slice(0, 3).map((r) => cut(r.text));
  const neg = sample.filter((r) => !r.votedUp).slice(0, 3).map((r) => cut(r.text));
  const ru = lang === 'ru';
  return {
    praise: pos.length ? pos : [ru ? 'Игроки в целом довольны' : 'Players are generally satisfied'],
    criticism: neg.length ? neg : [ru ? 'Явных жалоб не выделено' : 'No clear complaints'],
    summary: ru
      ? 'Анализ без ИИ: выше цитаты из реальных отзывов игроков.'
      : 'No-AI analysis: quotes from real player reviews above.',
    source: 'heuristic',
  };
}

async function summarizeReviews(gameName, sample, lang = 'ru') {
  if (!sample || !sample.length) {
    return {
      praise: [],
      criticism: [],
      summary: lang === 'ru' ? 'Недостаточно отзывов для анализа.' : 'Not enough reviews to analyze.',
      source: 'none',
    };
  }
  if (!client) return heuristic(sample, lang);

  const langName = lang === 'ru' ? 'русском' : 'English';
  const reviewsText = sample
    .map((r, i) => `${i + 1}. [${r.votedUp ? '+' : '-'}] ${r.text}`)
    .join('\n');

  const content = await chat(
    [
      {
        role: 'system',
        content:
          `You are an experienced game critic. Based on Steam player reviews you concisely highlight strengths and weaknesses. Reply ONLY in ${langName} language, strictly as JSON.`,
      },
      {
        role: 'user',
        content:
          `Game: ${gameName}\n\nReviews:\n${reviewsText}\n\n` +
          'Return strictly this JSON:\n' +
          '{ "praise": ["..."], "criticism": ["..."], "summary": "..." }\n' +
          'praise: 3-5 short points; criticism: 2-5 short points; summary: 2-3 sentences. Points up to 70 chars, no numbering.',
      },
    ],
    { json: true }
  );

  if (!content) return heuristic(sample, lang);

  try {
    const parsed = parseJsonLoose(content);
    const arr = (a) =>
      Array.isArray(a) ? a.map(String).map((s) => (s.length > 80 ? s.slice(0, 79) + '…' : s)).slice(0, 6) : [];
    return {
      praise: arr(parsed.praise),
      criticism: arr(parsed.criticism),
      summary: (typeof parsed.summary === 'string' && parsed.summary.trim()) || '',
      source: 'gpt',
    };
  } catch (e) {
    log.warn('summary parse failed:', e.message);
    return heuristic(sample, lang);
  }
}

module.exports = { available, chat, summarizeReviews };
