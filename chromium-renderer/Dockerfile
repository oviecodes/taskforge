FROM zenika/alpine-chrome:with-node

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

# RUN npm run build
ENV NODE_ENV=production
CMD ["node", "dist/server.js"]
