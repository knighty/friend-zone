FROM node:18.16.0-alpine3.17
RUN mkdir -p /opt/app
WORKDIR /opt/app

# Install PM2
RUN npm install pm2 -g

# Package setup
COPY public/package.json public/package-lock.json ./public/
COPY src/package.json src/package-lock.json ./src/
COPY shared/package.json shared/package-lock.json ./shared/

# Install
WORKDIR /opt/app/public
RUN npm install
WORKDIR /opt/app/src
RUN npm install
WORKDIR /opt/app/shared
RUN npm install

# Copy Source
WORKDIR /opt/app
COPY public ./public
COPY src ./src
COPY shared ./shared

# Compile public
WORKDIR /opt/app/public
RUN npm run build:prod

# Compile src
WORKDIR /opt/app/src
RUN npm run build:prod

# Run
EXPOSE 3000
CMD [ "pm2-runtime", "src/index.js" ]