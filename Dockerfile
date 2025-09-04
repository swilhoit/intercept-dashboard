FROM node:18-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY src/ src/
COPY sync-server.js .

EXPOSE 8080
CMD ["node", "sync-server.js"]