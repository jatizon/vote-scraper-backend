# Node.js LTS oficial (debian/bullseye)
FROM node:22-bullseye

# Dependências necessárias para Chrome
RUN apt-get update && \
    apt-get install -y wget gnupg ca-certificates fonts-liberation libnss3 libx11-xcb1 \
    libxcomposite1 libxcursor1 libxdamage1 libxi6 libxtst6 xdg-utils libpangocairo-1.0-0 \
    libatk-bridge2.0-0 libgtk-3-0 libxrandr2 libasound2 && \
    rm -rf /var/lib/apt/lists/*

# Instalar Google Chrome Stable
RUN wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - && \
    echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list && \
    apt-get update && \
    apt-get install -y google-chrome-stable && \
    rm -rf /var/lib/apt/lists/*

# Diretório de trabalho
WORKDIR /app

# Copiar package.json para cache de dependências
COPY package*.json ./

# Instalar dependências Node
RUN npm install

# Copiar todo o código
COPY . .

# Variável de porta (Render seta PORT automaticamente)
ENV PORT=3000
EXPOSE $PORT

# Rodar seu script
CMD ["node", "browser/voting_endpoints.js"]
