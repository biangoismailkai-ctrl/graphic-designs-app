# SL Limited - Graphic Design Course Website

Website and backend for SL Limited (Photoshop course, Koidu City). No packages to install: only Node.js 18 or newer.

## Run it
1. Install Node.js from https://nodejs.org (version 18 or newer).
2. Copy `.env.example` to `.env` and set `ADMIN_PASSWORD` (10+ characters). Add `ANTHROPIC_API_KEY` to turn on the AI chatbot.
3. In this folder run: `node server.js`
4. Open http://localhost:3000 (site) and http://localhost:3000/admin.html (admin dashboard).

If you leave `ADMIN_PASSWORD` empty, a random password is printed in the terminal the first time the server starts. Save it.

## What the backend does
- **Sign up** form: saves name, email, phone.
- **Hire Me** form: saves the project request.
- **Subscribe**: saves emails (no duplicates).
- **Admin login**: only the admin account can open the dashboard to view, delete and export (CSV) all entries.
- **AI chatbot**: the server calls the Claude API, so your API key stays private.
- Data is stored in `data/db.json`. Back this file up regularly.

## Security built in
Passwords hashed with scrypt, HttpOnly SameSite=Strict session cookie (8 hours), login limited to 5 tries per 15 minutes, rate limits on forms and chat, input validation, same-origin checks, Content-Security-Policy and other security headers.

## Putting it online
Use any host that runs Node.js (Render, Railway, Fly.io, or a VPS). Start command: `node server.js`. Set the same values as in `.env.example` in the host's settings, with `NODE_ENV=production` and `TRUST_PROXY=1`. Most free hosts erase files on restart, so use a host with a persistent disk for the `data` folder, or move to a hosted database later.

## Not included yet
Email notifications when someone signs up, password reset, your own social page links (Facebook currently goes to facebook.com; edit the four links in `public/index.html`), and an admin page for changing the course price and times (edit `public/index.html` and the `SYS` text in `server.js`).
