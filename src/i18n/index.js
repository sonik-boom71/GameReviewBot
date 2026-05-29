'use strict';

/**
 * i18n (#15). t(key, lang, vars) с подстановкой {переменных}.
 * Аналог MessageSource/ResourceBundle.
 */

const config = require('../config');

const DICTS = {
  ru: require('./ru'),
  en: require('./en'),
};

const SUPPORTED = Object.keys(DICTS);

function t(key, lang, vars) {
  const dict = DICTS[lang] || DICTS[config.defaultLang] || DICTS.ru;
  let str = dict[key] != null ? dict[key] : (DICTS.ru[key] != null ? DICTS.ru[key] : key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.split(`{${k}}`).join(String(v));
    }
  }
  return str;
}

/** Возвращает функцию-переводчик, привязанную к языку (удобно в хендлерах). */
function forLang(lang) {
  const l = SUPPORTED.includes(lang) ? lang : config.defaultLang;
  return (key, vars) => t(key, l, vars);
}

module.exports = { t, forLang, SUPPORTED };
