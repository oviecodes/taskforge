# FROM zenika/alpine-chrome:with-node

# WORKDIR /app

# COPY package.json ./
# RUN npm install

# COPY . .

# # RUN npm run build
# ENV NODE_ENV=production
# CMD ["node", "dist/server.js"]

# ---- Base stage: Chrome + Node ----
FROM zenika/alpine-chrome:with-node AS base
WORKDIR /app
COPY package*.json ./

# ---- Install only prod deps ----
FROM base AS deps
ENV NODE_ENV=production
RUN npm ci --omit=dev

# ---- Builder (if you need TS/webpack build) ----
FROM base AS builder
ENV NODE_ENV=development
RUN npm ci
COPY . .
# RUN npm run build

# ---- Final runtime ----
FROM zenika/alpine-chrome:with-node AS production
WORKDIR /app
ENV NODE_ENV=production

# Copy only needed deps + built output
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./

# Drop root privileges → use pre-created chrome user
USER chrome

EXPOSE 3000
CMD ["node", "dist/server.js"]
