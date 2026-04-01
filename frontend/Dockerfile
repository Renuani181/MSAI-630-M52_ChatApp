FROM node:18-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build
RUN npm install -g serve
EXPOSE $PORT
CMD ["sh", "-c", "serve -s build -l ${PORT:-3000}"]
