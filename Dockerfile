FROM node:24-alpine
WORKDIR /app
COPY package.json build.mjs index.html favicon.svg favicon-32.png apple-touch-icon.png ./
COPY css ./css
COPY js ./js
COPY server.mjs rooms.mjs api-handler.mjs ./
RUN node build.mjs
ENV PORT=4173
EXPOSE 4173
USER node
CMD ["node", "server.mjs"]
