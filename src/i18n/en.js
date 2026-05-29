'use strict';

module.exports = {
  start_welcome:
    '👋 *GameReviewBot* — your game\\-picking assistant\\.\n\n' +
    'I gather data from *Steam*, *OpenCritic*, *Metacritic* and *IGDB*, analyze reviews and give a verdict\\.\n\n' +
    '📌 Send `/review Game name` or just the game title\\.\n\n' +
    '*Commands:*\n' +
    '`/review <game>` — game review\n' +
    '`/random` — random game\n' +
    '`/top` — top\\-10 by genre/year\n' +
    '`/history` — recent queries\n' +
    '`/favorites` — favorites\n' +
    '`/profile` — your profile\n' +
    '`/lang` — language \\(RU/EN\\)',
  help: 'Send `/review Game name` — I will reply with ratings, price and a verdict\\.',

  searching: '🔍 Gathering data about "{name}"…',
  not_found: '❌ Could not find "{name}" on Steam\\.\nTry another title\\.',
  error_generic: '⚠️ Something went wrong\\. Please try again later\\.',
  usage_review: 'Specify a game title\\. Example:\n`/review Elden Ring`',

  verdict_label: 'Verdict',
  verdict_buy: 'Worth buying',
  verdict_think: 'Worth considering',
  verdict_skip: 'Not worth it',
  verdict_unknown: 'Not enough data',

  sec_ratings: '📊 *Ratings summary*',
  sec_price: '💰 *Price*',
  sec_genres: '🏷 *Genres*',
  sec_tags: '🔖 *Tags*',
  sec_sysreq: '🖥 *System requirements*',
  sec_release: '📅 *Release date*',
  sec_dev: '🛠 *Developer*',
  sec_pub: '🏢 *Publisher*',
  sec_about: 'ℹ️ *About*',
  sec_praise: '👍 *Praised*',
  sec_criticism: '👎 *Criticized*',
  sec_summary: '🎯 *Verdict*',
  sec_similar: '🎮 *If you liked it, also try*',
  sec_players: '👥 *Online*',

  tbl_source: 'Source',
  tbl_score: 'Score',
  no_data: 'no data',
  rating_stars: '⭐ *Rating:* {stars}  `{value}/5`',

  price_free: 'Free',
  price_was: 'was {price}',
  price_best_ever: 'all\\-time low: {price}',
  price_buy: '🛒 [Buy]({url})',

  sysreq_min: 'Minimum',
  sysreq_rec: 'Recommended',

  players_current: 'playing now: *{n}*',
  players_peak_na: 'all\\-time peak available on SteamDB',

  btn_details: '📖 Details',
  btn_compare: '⚖️ Compare',
  btn_similar: '🎮 Similar',
  btn_favorite: '⭐ Favorite',
  btn_unfavorite: '💔 Unfavorite',
  btn_price_chart: '📈 Price chart',
  btn_buy: '🛒 Buy',
  btn_repeat: '🔁 {name}',

  history_title: '🕘 *Recent queries*',
  history_empty: 'History is empty\\. Send `/review <game>`\\.',
  favorites_title: '⭐ *Favorites*',
  favorites_empty: 'No favorites yet\\. Add a game with the "Favorite" button\\.',
  added_to_fav: '⭐ "{name}" added to favorites',
  removed_from_fav: '💔 "{name}" removed from favorites',

  profile_title: '👤 *Your profile*',
  profile_viewed: 'Games viewed: *{n}*',
  profile_favs: 'Favorites: *{n}*',
  profile_genre: 'Favorite genre: *{genre}*',
  profile_recent: 'Recent queries:',
  profile_none: '—',

  choose_lang: 'Choose response language:',
  lang_set: '✅ Language switched to English',

  random_loading: '🎲 Picking a random game…',
  top_choose: 'Choose a genre for the top\\-10:',
  top_title: '🏆 *Top\\-10 — {genre}*',
  top_loading: '🏆 Building the top…',

  compare_prompt: 'Send the second game title to compare with "{name}":',
  compare_title: '⚖️ *Comparison*',

  source_unavailable: 'Source unavailable',
};
