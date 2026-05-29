'use strict';

/** Текстовые утилиты: HTML→текст, обрезка, числа, эвристика языка. */

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;|&#39;/gi, (m) => (ENTITIES[m] != null ? ENTITIES[m] : m));
}

/** Превращает HTML системных требований/описаний в чистый текст. */
function stripHtml(html) {
  if (!html) return '';
  let s = String(html)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|li|div|tr)\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  return s
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function truncate(s, n = 300) {
  const t = String(s == null ? '' : s).trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
}

function looksEnglish(t) {
  const letters = (String(t).match(/[a-zA-Z]/g) || []).length;
  return letters / Math.max(String(t).length, 1) > 0.5;
}

function fmtNum(n, lang = 'ru') {
  if (typeof n !== 'number' || !isFinite(n)) return String(n);
  try {
    return n.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US');
  } catch (_) {
    return String(n);
  }
}

module.exports = { decodeEntities, stripHtml, truncate, looksEnglish, fmtNum };
