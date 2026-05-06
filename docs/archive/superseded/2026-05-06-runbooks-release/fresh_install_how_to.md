# fresh install how to

Created: 2026-05-06
Edited: 2026-05-06
Status: raw inbox
Converted from: `fresh_install_how_to.txt`

If not installed yet, install PostgreSQL 16 and node/express.

To install the app:

cd C:\path\where\you\want\it

git clone <REPO_URL> TARGET_FOLDER_NAME

cd TARGET_FOLDER_NAME
git status
npm install

cd client-web
npm install
cd ..

Bypass instructions:

set AUTH_BYPASS=true
set BYPASS_LOGIN=dkmaraulayte (or other login id)
npm run dev



FILES UPDATES:

1. In config/index.js, change:

user: process.env.DB_USER || 'Dalia'

to 

user: process.env.DB_USER || 'postgres'

2. If needed, update BypassLogin (see config/index.js)

3. db/pool.js looks fine

4.
