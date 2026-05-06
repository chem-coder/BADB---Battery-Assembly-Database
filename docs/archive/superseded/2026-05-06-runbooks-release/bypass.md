# bypass

Created: 2026-05-06
Edited: 2026-05-06
Status: raw inbox
Converted from: `bypass.txt`

Make sure Postgres is running.

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
