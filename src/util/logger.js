'use strict';

/**
 * Простой уровневый логгер (аналог SLF4J + Logback).
 * Уровень задаётся LOG_LEVEL: debug | info | warn | error.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

let threshold = LEVELS.info;

function setLevel(level) {
  threshold = LEVELS[String(level || '').toLowerCase()] || LEVELS.info;
}

function ts() {
  return new Date().toISOString();
}

function log(level, scope, args) {
  if (LEVELS[level] < threshold) return;
  const prefix = `${ts()} ${level.toUpperCase().padEnd(5)} [${scope}]`;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(prefix, ...args);
}

/** Создаёт логгер с именем модуля (как LoggerFactory.getLogger). */
function create(scope) {
  return {
    debug: (...a) => log('debug', scope, a),
    info: (...a) => log('info', scope, a),
    warn: (...a) => log('warn', scope, a),
    error: (...a) => log('error', scope, a),
  };
}

module.exports = { create, setLevel, LEVELS };
