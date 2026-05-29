'use strict';

/**
 * Графики через QuickChart (рендерит Chart.js в PNG, без нативных зависимостей).
 *  - priceChartUrl: динамика цены за ~год (#12), данные из ITAD.
 *  - ratingChartUrl: сравнение оценок по источникам (#13). Настоящей истории
 *    рейтинга со временем публичного источника нет, поэтому показываем
 *    наглядное сравнение текущих оценок всех источников.
 * Возвращаем короткий URL — Telegram сам скачает картинку.
 */

const axios = require('axios');
const log = require('../util/logger').create('chart');

const http = axios.create({ timeout: 15000 });

async function createChart(config, width = 640, height = 320) {
  try {
    const { data } = await http.post('https://quickchart.io/chart/create', {
      chart: config,
      width,
      height,
      backgroundColor: 'white',
      format: 'png',
      version: '4',
    });
    return data && data.success && data.url ? data.url : null;
  } catch (e) {
    log.warn('quickchart create failed:', e.message);
    return null;
  }
}

async function priceChartUrl(history, label = 'Price') {
  if (!history || history.length < 2) return null;
  const labels = history.map((p) => new Date(p.ts).toISOString().slice(0, 10));
  const values = history.map((p) => Math.round(p.price * 100) / 100);
  const config = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label,
          data: values,
          borderColor: '#1b9e4b',
          backgroundColor: 'rgba(27,158,75,0.15)',
          fill: true,
          tension: 0.2,
          pointRadius: 0,
        },
      ],
    },
    options: {
      plugins: { legend: { display: true }, title: { display: true, text: label } },
      scales: { y: { beginAtZero: true } },
    },
  };
  return createChart(config);
}

async function ratingChartUrl(rows, title = 'Ratings') {
  // rows: [{ label, value(0-100) }]
  const data = rows.filter((r) => typeof r.value === 'number');
  if (data.length < 2) return null;
  const colors = data.map((r) => (r.value >= 80 ? '#1b9e4b' : r.value >= 65 ? '#e6b800' : '#cc3333'));
  const config = {
    type: 'bar',
    data: {
      labels: data.map((r) => r.label),
      datasets: [{ label: title, data: data.map((r) => r.value), backgroundColor: colors }],
    },
    options: {
      plugins: { legend: { display: false }, title: { display: true, text: title } },
      scales: { y: { beginAtZero: true, max: 100 } },
    },
  };
  return createChart(config);
}

module.exports = { priceChartUrl, ratingChartUrl };
