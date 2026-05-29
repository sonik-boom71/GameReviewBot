'use strict';

/**
 * Помощники для Telegram MarkdownV2.
 *  esc      — экранирование спецсимволов в обычном тексте
 *  escCode  — внутри ``` ``` экранируются только ` и \
 *  escUrl   — внутри (URL) экранируются только ) и \
 *  strip    — снять разметку (фолбэк, если Telegram отверг MarkdownV2)
 *  table    — моноширинная таблица в code-блоке
 */

const esc = (t) =>
  String(t == null ? '' : t).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');

const escCode = (t) => String(t == null ? '' : t).replace(/[`\\]/g, '\\$&');

const escUrl = (u) => String(u == null ? '' : u).replace(/[)\\]/g, '\\$&');

function strip(text) {
  return String(text)
    .replace(/\\([_*[\]()~`>#+\-=|{}.!\\])/g, '$1')
    .replace(/[*`_]/g, '');
}

/** rows: массив [col0, col1]; первая строка — заголовок. Возвращает текст для code-блока. */
function table(rows) {
  const w0 = Math.max(...rows.map((r) => String(r[0]).length));
  const w1 = Math.max(...rows.map((r) => String(r[1]).length));
  const sep = `+${'-'.repeat(w0 + 2)}+${'-'.repeat(w1 + 2)}+`;
  const line = (r) => `| ${String(r[0]).padEnd(w0)} | ${String(r[1]).padEnd(w1)} |`;
  const out = [sep, line(rows[0]), sep];
  for (let i = 1; i < rows.length; i++) out.push(line(rows[i]));
  out.push(sep);
  return out.join('\n');
}

/** Обёртка кода-блока с экранированием содержимого. */
function codeBlock(text) {
  return '```\n' + escCode(text) + '\n```';
}

module.exports = { esc, escCode, escUrl, strip, table, codeBlock };
