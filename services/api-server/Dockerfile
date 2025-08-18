FROM node:20-alpine

# Install sqlite3 for direct database access
RUN apk add --no-cache sqlite

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy source code
COPY . .

# Create directories for data, files, and logs
RUN mkdir -p /app/data /app/files /app/logs

EXPOSE 4000

CMD ["npm", "start"]