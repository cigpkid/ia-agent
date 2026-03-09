# backend-gateway/Dockerfile
FROM node:24-slim

WORKDIR /app

# Instalar dependencias del sistema para compilar si es necesario
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3000

# Usamos el modo producción
CMD ["npm", "run", "start:prod"]
