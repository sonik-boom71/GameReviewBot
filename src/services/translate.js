'use strict';

/**
 * Перевод отзывов (#16). Приоритет: LibreTranslate (self-host/публичный) →
 * DeepL → LLM-фолбэк (Groq и т.п.) → исходный текст. Любой сбой не валит бота.
 */

const axios = require('axios');
const config = require('../config');
const log = require('../util/logger').create('translate');
const llm = require('./llm');
const { looksEnglish } = require('../util/text');

const http = axios.create({ timeout: 12000 });

async function viaLibre(text, target) {
  if (!config.translate.libreUrl) return null;
  try {
    const { data } = await http.post(`${config.translate.libreUrl.replace(/\/$/, '')}/translate`, {
      q: text,
      source: 'auto',
      target,
      format: 'text',
      ...(config.translate.libreApiKey ? { api_key: config.translate.libreApiKey } : {}),
    });
    return data && data.translatedText ? data.translatedText : null;
  } catch (e) {
    log.debug('LibreTranslate failed:', e.message);
    return null;
  }
}

async function viaDeepl(text, target) {
  if (!config.translate.deeplApiKey) return null;
  try {
    const { data } = await http.post(
      'https://api-free.deepl.com/v2/translate',
      new URLSearchParams({ text, target_lang: target.toUpperCase() }).toString(),
      {
        headers: {
          Authorization: `DeepL-Auth-Key ${config.translate.deeplApiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    return data && data.translations && data.translations[0] ? data.translations[0].text : null;
  } catch (e) {
    log.debug('DeepL failed:', e.message);
    return null;
  }
}

async function viaLlm(text, target) {
  if (!llm.available) return null;
  const langName = target === 'ru' ? 'Russian' : 'English';
  const out = await llm.chat(
    [
      { role: 'system', content: `Translate the user's text to ${langName}. Output only the translation, no quotes.` },
      { role: 'user', content: text },
    ],
    { temperature: 0.2 }
  );
  return out ? out.trim() : null;
}

/** Переводит один фрагмент на target ('ru'|'en'). Возвращает текст (или исходный). */
async function translate(text, target = 'ru') {
  if (!text) return text;
  // не переводим, если уже на целевом языке (грубо: для ru — если не выглядит англ.)
  if (target === 'ru' && !looksEnglish(text)) return text;
  if (target === 'en' && looksEnglish(text)) return text;

  const out = (await viaLibre(text, target)) || (await viaDeepl(text, target)) || (await viaLlm(text, target));
  return out || text;
}

/** Переводит массив строк (по возможности параллельно). */
async function translateAll(texts, target = 'ru') {
  return Promise.all(texts.map((t) => translate(t, target)));
}

module.exports = { translate, translateAll };
