FROM node:18-alpine
WORKDIR /app

COPY package.json package.json
RUN npm install --production

COPY . .
RUN npm run build || true

EXPOSE 3000
CMD ["npm", "run", "dev"]
