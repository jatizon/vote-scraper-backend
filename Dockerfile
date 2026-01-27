# Use official Node.js LTS
FROM node:22-bullseye

# Install Chromium dependencies
RUN apt-get update && \
    apt-get install -y wget gnupg ca-certificates fonts-liberation libnss3 libx11-xcb1 \
    libxcomposite1 libxcursor1 libxdamage1 libxi6 libxtst6 xdg-utils libpangocairo-1.0-0 \
    libatk-bridge2.0-0 libgtk-3-0 libxrandr2 libasound2 && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first for caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy rest of the code
COPY . .

# Expose port (Render sets PORT via env variable)
ENV PORT=3000
EXPOSE $PORT

# Start app
CMD ["node", "browser/voting_endpoints.js"]
