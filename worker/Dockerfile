# Dockerfile para deploy no Railway
# v3.0: Baileys Engine - SEM Chromium/Puppeteer!
FROM node:20-bookworm-slim

# Ferramentas básicas apenas (sem Chromium!)
RUN apt-get update && apt-get install -y \
    dumb-init \
    git \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Forçar git a usar HTTPS ao invés de SSH (antes de qualquer npm install)
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" \
    && git config --global url."https://github.com/".insteadOf "git@github.com:" \
    && git config --global url."https://github.com/".insteadOf "git://github.com/"

# Definir timezone
ENV TZ=America/Sao_Paulo
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Criar diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./
COPY tsconfig.json ./

# Instalar dependências
RUN npm install

# Copiar código fonte
COPY src ./src

# Build
RUN npm run build

# Criar diretório para sessão WhatsApp com permissões adequadas
RUN mkdir -p /app/auth_info && chmod 777 /app/auth_info

# Expor porta para healthcheck
EXPOSE 3000

# Usar dumb-init como PID 1 para gerenciamento correto de processos
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Comando de inicialização
CMD ["npm", "start"]
