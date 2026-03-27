FROM node:20-alpine

WORKDIR /app

# Copiamos primero solo package.json para aprovechar la caché de Docker.
# Si el código cambia pero las dependencias no, esta capa no se vuelve a ejecutar.
COPY package.json .
RUN npm install --omit=dev

# Ahora copiamos el resto del código
COPY src ./src

EXPOSE 3000

CMD ["node", "src/app.js"]
