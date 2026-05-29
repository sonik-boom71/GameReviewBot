# 🎮 GameReviewBot

> Telegram-бот, который собирает обзор игры из **Steam, OpenCritic, Metacritic, IGDB** и **IsThereAnyDeal**, делает ИИ-выжимку отзывов и выдаёт карточку с вердиктом, рейтингами, ценой, скриншотами и кнопками.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-43853d)
![Telegraf](https://img.shields.io/badge/Telegraf-4.x-26A5E4)
![License](https://img.shields.io/badge/license-MIT-blue)

Напиши `/review Elden Ring` или просто пришли название — получишь полную карточку.

---

## ✨ Возможности (23 фичи)

| # | Фича | Статус |
|---|------|--------|
| 1 | Источники рейтингов: Steam, OpenCritic, **Metacritic**, **IGDB** | ✅ |
| 2 | Цены в регионах (USD/EUR/RUB), скидки, минимум за всё время, ссылка на покупку | ✅ / 💰 ITAD-ключ для истории |
| 3 | Жанры и теги | ✅ |
| 4 | Системные требования (мин/реком) | ✅ |
| 5 | Дата выхода, разработчик, издатель | ✅ |
| 6 | Краткое описание игры | ✅ |
| 7 | Скриншоты + трейлер (media group) | ✅ |
| 8 | Похожие игры с рейтингами | 🔑 IGDB |
| 9 | Inline-кнопки: Подробнее / Сравнить / Похожие / В избранное | ✅ |
| 10 | История последних 10 запросов (`/history`) | ✅ |
| 11 | Избранное (`/favorites`) | ✅ |
| 12 | График изменения цены (PNG) | 🔑 ITAD |
| 13 | График рейтинга по источникам | ✅¹ |
| 14 | Статистика игроков (текущий онлайн) | ✅² |
| 15 | Выбор языка RU/EN (`/lang`) | ✅ |
| 16 | Автоперевод отзывов на русский | ✅ |
| 17 | Обложка игры | ✅ |
| 18 | Цветовая индикация вердикта 🟢🟡🔴 | ✅ |
| 19 | Оценка звёздами ⭐ из 5 | ✅ |
| 20 | `/random` — случайная игра | ✅ |
| 21 | `/top` — топ-10 по жанру/году | 🔑 IGDB |
| 22 | Поддержка групповых чатов | ✅ |
| 23 | Личный кабинет (`/profile`) | ✅ |

¹ Публичного источника истории рейтинга *со временем* не существует, поэтому показывается сравнение текущих оценок по источникам.
² Пиковый онлайн за всё время недоступен в официальном Steam API (есть только на SteamDB) — показывается текущий онлайн.

> **Честно об источниках:** OpenCritic закрыл бесплатный API — бот парсит их страницы через `cheerio` (надёжнее с ключом RapidAPI). Metacritic не имеет API и жёстко блокирует ботов, поэтому оценка критиков берётся из Steam, а доп. парсинг — best-effort. Любой недоступный источник просто пропускается — бот не падает.

---

## 🖼 Пример ответа

```
🎮 ELDEN RING
⭐ Оценка: ⭐⭐⭐⭐⭐  4.7/5
Вердикт: 🟢 Стоит брать

━━━━━━━━━━━━━━━━━━━━
📊 Сводка рейтингов
+------------+-----------------+
| Источник   | Оценка          |
+------------+-----------------+
| Steam      | 93% (1 134 822) |
| OpenCritic | 95/100 · 97%    |
| Metacritic | 94/100          |
+------------+-----------------+

💰 Цена
3599 руб.  ·  $59.99  ·  59,99€
минимум за всё время: $29.99
🛒 Купить

👍 Что хвалят
• огромный открытый мир
• интересные боссы
• глубокий сюжет

🎯 Вердикт: Одна из лучших игр в жанре action-RPG…
[ 📖 Подробнее ][ ⚖️ Сравнить ]
[ 🎮 Похожие ][ ⭐ В избранное ]
```

---

## 🚀 Быстрый старт

```bash
git clone https://github.com/sonik-boom71/GameReviewBot.git
cd GameReviewBot
npm install
cp .env.example .env   # впиши BOT_TOKEN и (по желанию) ключи
npm start
```

Нужен **Node.js 18+**. Бот работает уже с одним `BOT_TOKEN`; остальные ключи включают доп. источники.

### Docker

```bash
docker compose up -d --build        # бот + LibreTranslate
docker compose up -d --build bot    # только бот
```

---

## 🔑 Ключи (все бесплатные, все опциональны кроме Telegram)

| Ключ | Что включает | Где взять |
|------|--------------|-----------|
| `BOT_TOKEN` | сам бот | [@BotFather](https://t.me/BotFather) |
| `OPENAI_*` | ИИ-выжимка и перевод отзывов | Groq / Gemini / Ollama (см. `.env`) |
| `TWITCH_CLIENT_ID/SECRET` | IGDB: похожие игры, `/top`, `/random`, жанры | [dev.twitch.tv](https://dev.twitch.tv/console/apps) |
| `ITAD_API_KEY` | история цен и минимум за всё время | [isthereanydeal.com](https://isthereanydeal.com/apps/my/) |
| `OPENCRITIC_RAPIDAPI_KEY` | стабильный OpenCritic | [RapidAPI](https://rapidapi.com/opencritic-opencritic-default/api/opencritic-api) |
| `LIBRETRANSLATE_URL` / `DEEPL_API_KEY` | перевод отзывов без ИИ | self-host / [DeepL](https://www.deepl.com/pro-api) |

---

## 💬 Команды

`/review <игра>` · `/random` · `/top` · `/history` · `/favorites` · `/profile` · `/lang` · `/start`

В группах бот отвечает на команды и на сообщения с упоминанием `@bot`.

---

## 🗂 Архитектура

```
index.js                 # bootstrap: Telegraf, регистрация хендлеров, запуск
src/
├── config/              # конфиг из .env + флаги доступности фич
├── util/                # logger, TTL-кэш (1ч), markdown, text, rating (вердикт+звёзды)
├── db/                  # JSON-хранилище: пользователи, история, избранное, профиль
├── i18n/                # RU/EN словари + t(key, lang, vars)
├── services/            # steam, opencritic, metacritic, igdb, itad, llm, translate, chart, aggregator
├── format/             # рендер карточки и сравнения (MarkdownV2)
├── keyboards/           # фабрики inline-клавиатур
└── handlers/            # команды, callback-кнопки, группы, медиагруппы
```

Кэширование — Caffeine-подобный in-memory TTL (1 час). Хранилище — JSON (`data/db.json`); для смены на Postgres достаточно заменить `src/db/store.js`.

## 📜 Лицензия

MIT
