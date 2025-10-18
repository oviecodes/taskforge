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

# CMD ["sh", "-c", "export NODE_ENV=development && npm start"]

# ---- Base image ----
FROM node:18-alpine AS base
WORKDIR /usr/src/app
COPY package*.json ./


FROM base AS deps
ENV NODE_ENV=production

RUN --mount=type=cache,target=/usr/src/app/.npm \
    npm ci --omit=dev

FROM base AS builder
ENV NODE_ENV=development
RUN --mount=type=cache,target=/usr/src/app/.npm \
    npm ci
COPY . .
RUN npm run build

# ---- Final production image ----
FROM node:18-alpine AS production
WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY package*.json ./

EXPOSE 3000

CMD ["sh", "-c", "export NODE_ENV=production && npm start"]
