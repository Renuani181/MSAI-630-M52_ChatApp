FROM node:18-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
ARG REACT_APP_API_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL
RUN npm run build
RUN npm install -g http-server
CMD ["sh", "-c", "http-server build -p ${PORT:-3000} --proxy http://localhost:${PORT:-3000}?"]
