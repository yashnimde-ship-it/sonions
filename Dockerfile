# The whole game as one service: the built web client and the game server (which serves it,
# plus the WebSocket at /ws and GET /health) on one port.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src ./src
COPY public ./public
EXPOSE 8080
# Node 22 runs the TypeScript server directly (type stripping).
CMD ["node", "server/index.ts"]
