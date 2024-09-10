FROM node:18.16.0-alpine3.17
RUN mkdir -p /opt/app
WORKDIR /opt/app

# Package setup
COPY public/package.json public/package-lock.json ./public/
COPY server/package.json server/package-lock.json ./server/
COPY package.json package-lock.json ./

# Install
RUN npm install
WORKDIR /opt/app/public
RUN npm install
WORKDIR /opt/app/server
RUN npm install

# Copy Source
WORKDIR /opt/app
COPY tsconfig.json ./
COPY public ./public
COPY server ./server

# Compile src
WORKDIR /opt/app/public
RUN npm run build:dev

# Run
EXPOSE 3000
WORKDIR /opt/app/server
CMD [ "npm", "run", "dev" ]