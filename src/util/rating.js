'use strict';

/**
 * Расчёт средней оценки, вердикта с цветовой индикацией (#18) и звёзд (#19).
 * Все источники нормализуются к шкале 0–100.
 */

function collect(scores) {
  const out = [];
  const push = (v) => {
    if (typeof v === 'number' && isFinite(v) && v >= 0) out.push(v);
  };
  push(scores.steam); // % положительных, 0–100
  push(scores.opencritic); // 0–100
  push(scores.metacriticCritic); // 0–100
  if (typeof scores.metacriticUser === 'number') push(scores.metacriticUser * 10); // 0–10 → 0–100
  push(scores.igdb); // 0–100
  return out;
}

function average(scores) {
  const a = collect(scores);
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
}

// #18: 🟢 стоит брать / 🟡 стоит подумать / 🔴 не стоит брать
function verdict(avg) {
  if (avg == null) return { level: 'unknown', emoji: '⚪' };
  if (avg >= 80) return { level: 'buy', emoji: '🟢' };
  if (avg >= 65) return { level: 'think', emoji: '🟡' };
  return { level: 'skip', emoji: '🔴' };
}

// #19: ⭐ из 5
function stars(avg) {
  if (avg == null) return { value: 0, render: '☆☆☆☆☆' };
  const value = Math.round((avg / 20) * 10) / 10;
  const filled = Math.max(0, Math.min(5, Math.round(avg / 20)));
  return { value, render: '⭐'.repeat(filled) + '☆'.repeat(5 - filled) };
}

function summarize(scores) {
  const avg = average(scores);
  return { avg, verdict: verdict(avg), stars: stars(avg) };
}

module.exports = { average, verdict, stars, summarize };
