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

# --- Base image (shared across stages) ---
FROM node:18-alpine AS base
WORKDIR /usr/src/app
COPY package*.json ./

# --- Build stage ---
FROM base AS builder
# Use cached npm directory for faster builds
RUN --mount=type=cache,target=/usr/src/app/.npm \
    npm ci --omit=dev
COPY . .
RUN npm run build

# --- Production runtime ---
FROM node:18-alpine AS production
WORKDIR /usr/src/app

# Set environment to production
ENV NODE_ENV=production

# Copy only production dependencies
COPY package*.json ./
RUN --mount=type=cache,target=/usr/src/app/.npm \
    npm ci --omit=dev --ignore-scripts

# Copy built app from builder
COPY --from=builder /usr/src/app/dist ./dist

# Copy prisma schema (if you use Prisma at runtime)
COPY --from=builder /usr/src/app/prisma ./prisma

# Run app
CMD ["node", "dist/index.js"]

