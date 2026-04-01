FROM node:18-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
RUN npm install express
COPY . .
ARG REACT_APP_API_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL
RUN npm run build
EXPOSE 3000
CMD ["node", "server.js"]
