# Single-image demo build: the console is built and served by the API process.
FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm ci

COPY . .
RUN npm run build

ENV HOST=0.0.0.0 PORT=4000
EXPOSE 4000

# Seed on first boot only; the volume keeps the corpus across restarts.
CMD ["sh", "-c", "npm run seed --workspace server || true; npm run start --workspace server"]
