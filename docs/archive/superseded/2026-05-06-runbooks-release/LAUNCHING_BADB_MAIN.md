# Launching BADB_main

## Static frontend + backend

From `/Users/Dalia/Developer/RENERA/BADB_main` run:

```bash
npm start
```

or:

```bash
node server.js
```

Then open:

- [http://localhost:3003](http://localhost:3003)

This serves the classic static frontend from `public/`.

## Vue frontend

Use two terminals.

Terminal 1, from `/Users/Dalia/Developer/RENERA/BADB_main`:

```bash
npm start
```

Terminal 2:

```bash
cd /Users/Dalia/Developer/RENERA/BADB_main/client-web
npm install
npm run dev
```

Then open:

- [http://localhost:5173](http://localhost:5173)

The Vue frontend runs on port `5173` and proxies `/api` requests to the backend on port `3003`.

## Quick reminder

- `localhost:3003` = backend + static HTML frontend
- `localhost:5173` = Vue frontend

# Bypass AUTH

cd /Users/Dalia/Developer/RENERA/BADB_main
AUTH_BYPASS=true BYPASS_LOGIN=dkmaraulayte npm start

cd /Users/Dalia/Developer/RENERA/BADB_main
AUTH_BYPASS=true BYPASS_LOGIN=dkmaraulayte npm run dev

npm run dev in this repo already starts the backend on 3003 and the frontend dev server.

So when you also run npm start, you are starting a second backend on the same port.

That causes:

port conflict on 3003
one of the server processes to die/shutdown
Use only one of these:

For backend only:

cd /Users/Dalia/Developer/RENERA/BADB_main
AUTH_BYPASS=true BYPASS_LOGIN=dkmaraulayte npm start

For backend + frontend together:

cd /Users/Dalia/Developer/RENERA/BADB_main
AUTH_BYPASS=true BYPASS_LOGIN=dkmaraulayte npm run dev

Do not run both at the same time.