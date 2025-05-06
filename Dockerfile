FROM node:18-bullseye

# Instalar Chromium e dependências necessárias
RUN apt-get update \
    && apt-get install -y wget gnupg curl dumb-init \
    && apt-get install -y --no-install-recommends \
        chromium \
        fonts-ipafont-gothic \
        fonts-wqy-zenhei \
        fonts-thai-tlwg \
        fonts-kacst \
        fonts-freefont-ttf \
        libxss1 \
        libxtst6 \
        libatk-bridge2.0-0 \
        libgtk-3-0 \
        libasound2 \
        libgbm1 \
        ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Configurar variáveis de ambiente para o Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_BIN=/usr/bin/chromium
ENV NODE_ENV=production

# Criar diretório de trabalho
WORKDIR /app

# Copiar package.json
COPY package*.json ./

# Usar npm install em vez de npm ci
RUN npm install --omit=dev

# Copiar o código fonte
COPY . .

# Criar e configurar diretório para dados persistentes do WhatsApp
RUN mkdir -p /app/.wwebjs_auth && chmod -R 777 /app/.wwebjs_auth
VOLUME /app/.wwebjs_auth

# Expor porta
EXPOSE 3001

# Iniciar o bot
CMD ["node", "index.js"]
