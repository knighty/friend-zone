## Remote Control

### Requirements

1. Git: https://git-scm.com/download/win
2. Python: https://www.python.org/downloads/release/python-3126/
3. Node: https://nodejs.org/en/download/prebuilt-installer 
4. Java: https://www.java.com/en/download/help/download_options.html

### Install

In root directory where you want the code:

```
git pull
npm install
cd remote-control 
npm install
cd ../public
npm install
cd ../server
npm install
cd ../remote-control
npm run build:dev
```

### Run

In `remote-control` directory:

`npx ts-node src/index.ts`

## Server

## Build

1. git checkout on server
2. Create `.env` file from `.env.template`, filling in required parameters
3. Run `docker compose build`

## Run

1. Run `docker compose up`. If running in production add `-f production.yml`
