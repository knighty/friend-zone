FROM node:18.16.0-alpine3.17
RUN mkdir -p /opt/app
WORKDIR /opt/app

# Package setup
COPY package.json package-lock.json ./
COPY public/package.json public/package-lock.json ./public/
COPY server/package.json server/package-lock.json ./server/

# Install
RUN npm install
WORKDIR /opt/app/public
RUN npm install
WORKDIR /opt/app/server
RUN npm install

# Copy Source
WORKDIR /opt/app

# Run App
EXPOSE 3000
WORKDIR /opt/app/server
CMD [ "npm", "run", "dev" ]