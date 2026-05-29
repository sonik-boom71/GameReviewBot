# GameReviewBot — образ для деплоя
FROM node:20-alpine

WORKDIR /app

# Зависимости (кэшируемый слой)
COPY package*.json ./
RUN npm ci --omit=dev

# Исходники
COPY index.js ./
COPY src ./src

# Каталог для JSON-БД (история/избранное/профиль)
RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV NODE_ENV=production

CMD ["node", "index.js"]
