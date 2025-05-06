FROM node:20-bullseye

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

# Criar diretório de trabalho e usuário não-root
WORKDIR /app

# Copiar package.json e package-lock.json
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production

# Copiar o resto do código fonte
COPY . .

# Criar e configurar diretório para dados persistentes do WhatsApp
RUN mkdir -p /app/.wwebjs_auth && chown -R node:node /app/.wwebjs_auth
VOLUME /app/.wwebjs_auth

# Expor porta
EXPOSE 3001

# Comando para iniciar o bot
CMD ["node", "index.js"]
