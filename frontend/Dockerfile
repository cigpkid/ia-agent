# frontend/Dockerfile
FROM node:24-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

# Host 0.0.0.0 es vital para que Docker mapee el puerto
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
