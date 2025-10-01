# FROM node:18-alpine

# WORKDIR /usr/src/app
# COPY package*.json ./

# ENV NODE_ENV=development

# # Use build cache for npm
# RUN --mount=type=cache,target=/usr/src/app/.npm \
#     npm set cache /usr/src/app/.npm && \
#     npm install

# COPY . .

# RUN npm run build
# # RUN npm run db-push

# CMD ["sh", "-c", "export NODE_ENV=development && npm start"]


# ---- Base ----
FROM node:18-alpine AS base
WORKDIR /usr/src/app
COPY package*.json ./

# ---- Development ----
FROM base AS development
ENV NODE_ENV=development

RUN --mount=type=cache,target=/usr/src/app/.npm \
    npm set cache /usr/src/app/.npm && \
    npm install

COPY . .
CMD ["npm", "run", "dev"]   # hot-reload server (e.g. nodemon)


# ---- Builder ----
FROM base AS builder
RUN --mount=type=cache,target=/usr/src/app/.npm \
    npm ci
COPY . .
RUN npm run build


# ---- Production ----
FROM base AS production
ENV NODE_ENV=production

RUN --mount=type=cache,target=/usr/src/app/.npm \
    npm ci --omit=dev

COPY --from=builder /usr/src/app/dist ./dist
COPY prisma ./prisma
# RUN npx prisma generate

CMD ["node", "dist/server.js"]

# ---- Migration ----
# FROM base AS migrate
# ENV NODE_ENV=development

# # RUN apk add --no-cache openssl

# # Install full deps (incl. Prisma CLI in devDependencies)
# RUN --mount=type=cache,target=/usr/src/app/.npm \
#     npm ci

# COPY . .

# # Prisma schema + migrations available here
# CMD ["npm", "run", "db-push"]
