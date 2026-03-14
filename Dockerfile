FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
RUN npm install
RUN npx prisma generate
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]