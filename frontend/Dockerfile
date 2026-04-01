FROM node:18-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
ARG REACT_APP_API_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL
RUN npm run build
RUN npm install -g serve
CMD ["sh", "-c", "serve -s build -p ${PORT:-3000}"]
