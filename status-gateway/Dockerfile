FROM node:18-alpine

WORKDIR /usr/src/app
COPY package*.json ./

ENV NODE_ENV=development

# Use build cache for npm
RUN --mount=type=cache,target=/usr/src/app/.npm \
    npm set cache /usr/src/app/.npm && \
    npm install

COPY . .

RUN npm run build

CMD ["sh", "-c", "export NODE_ENV=development && npm start"]
