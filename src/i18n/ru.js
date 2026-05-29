'use strict';

module.exports = {
  // Команды / общее
  start_welcome:
    '👋 *GameReviewBot* — помощник по выбору игр\\.\n\n' +
    'Собираю данные из *Steam*, *OpenCritic*, *Metacritic* и *IGDB*, анализирую отзывы и выдаю вердикт\\.\n\n' +
    '📌 Напиши `/review Название игры` или просто пришли название\\.\n\n' +
    '*Команды:*\n' +
    '`/review <игра>` — обзор игры\n' +
    '`/random` — случайная игра\n' +
    '`/top` — топ\\-10 по жанру/году\n' +
    '`/history` — последние запросы\n' +
    '`/favorites` — избранное\n' +
    '`/profile` — твой профиль\n' +
    '`/lang` — язык \\(RU/EN\\)',
  help: 'Напиши `/review Название игры` — пришлю обзор с рейтингами, ценой и вердиктом\\.',

  searching: '🔍 Собираю данные про «{name}»…',
  not_found:
    '❌ Не нашёл «{name}» в Steam\\.\nПопробуй другое название \\(лучше на английском\\)\\.',
  error_generic: '⚠️ Что\\-то пошло не так\\. Попробуй ещё раз чуть позже\\.',
  usage_review: 'Укажи название игры\\. Пример:\n`/review Elden Ring`',

  // Карточка
  verdict_label: 'Вердикт',
  verdict_buy: 'Стоит брать',
  verdict_think: 'Стоит подумать',
  verdict_skip: 'Не стоит брать',
  verdict_unknown: 'Недостаточно данных',

  sec_ratings: '📊 *Сводка рейтингов*',
  sec_price: '💰 *Цена*',
  sec_genres: '🏷 *Жанры*',
  sec_tags: '🔖 *Теги*',
  sec_sysreq: '🖥 *Системные требования*',
  sec_release: '📅 *Дата выхода*',
  sec_dev: '🛠 *Разработчик*',
  sec_pub: '🏢 *Издатель*',
  sec_about: 'ℹ️ *Об игре*',
  sec_praise: '👍 *Что хвалят*',
  sec_criticism: '👎 *Что ругают*',
  sec_summary: '🎯 *Вердикт*',
  sec_similar: '🎮 *Если понравилось, попробуй также*',
  sec_players: '👥 *Онлайн*',

  tbl_source: 'Источник',
  tbl_score: 'Оценка',
  no_data: 'нет данных',
  rating_stars: '⭐ *Оценка:* {stars}  `{value}/5`',

  price_free: 'Бесплатно',
  price_was: 'было {price}',
  price_best_ever: 'минимум за всё время: {price}',
  price_buy: '🛒 [Купить]({url})',

  sysreq_min: 'Минимальные',
  sysreq_rec: 'Рекомендуемые',

  players_current: 'сейчас играют: *{n}*',
  players_peak_na: 'пиковый онлайн доступен на SteamDB',

  // Кнопки (#9)
  btn_details: '📖 Подробнее',
  btn_compare: '⚖️ Сравнить',
  btn_similar: '🎮 Похожие',
  btn_favorite: '⭐ В избранное',
  btn_unfavorite: '💔 Из избранного',
  btn_price_chart: '📈 График цены',
  btn_buy: '🛒 Купить',
  btn_repeat: '🔁 {name}',

  // История / избранное / профиль
  history_title: '🕘 *Последние запросы*',
  history_empty: 'История пуста\\. Напиши `/review <игра>`\\.',
  favorites_title: '⭐ *Избранное*',
  favorites_empty: 'В избранном пусто\\. Добавь игру кнопкой «В избранное»\\.',
  added_to_fav: '⭐ «{name}» добавлена в избранное',
  removed_from_fav: '💔 «{name}» убрана из избранного',

  profile_title: '👤 *Твой профиль*',
  profile_viewed: 'Посмотрено игр: *{n}*',
  profile_favs: 'В избранном: *{n}*',
  profile_genre: 'Любимый жанр: *{genre}*',
  profile_recent: 'Недавние запросы:',
  profile_none: '—',

  // Язык
  choose_lang: 'Выбери язык ответа:',
  lang_set: '✅ Язык переключён на Русский',

  // /random /top
  random_loading: '🎲 Выбираю случайную игру…',
  top_choose: 'Выбери жанр для топ\\-10:',
  top_title: '🏆 *Топ\\-10 — {genre}*',
  top_loading: '🏆 Собираю топ…',

  // Сравнение (#9)
  compare_prompt: 'Пришли название второй игры для сравнения с «{name}»:',
  compare_title: '⚖️ *Сравнение*',

  source_unavailable: 'Источник недоступен',
};
