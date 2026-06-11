FROM node:20-alpine

WORKDIR /app

RUN mkdir -p /app/data

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

ENV PORT=3000
ENV NODE_ENV=production
ENV DB_PATH=/app/data/venues.db
ENV VENUE_NAME="กาดกองต้า ลำปาง"
ENV VENUE_ID=kad-kong-ta

EXPOSE 3000

CMD ["npm", "start"]
