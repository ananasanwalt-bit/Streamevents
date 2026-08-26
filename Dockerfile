# StreamEvents production container
FROM node:20-alpine

WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application
COPY . .

ENV NODE_ENV=production
ENV PORT=10000

EXPOSE 10000

CMD ["npm", "start"]
