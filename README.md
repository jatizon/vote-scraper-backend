# voting-bot

Small Node server that automates voting for ITA (Instituto Tecnológico de Aeronáutica) on the Lovable for Schools challenge. It uses Puppeteer with a stealth plugin so the browser automation isn’t obvious, and can rotate through proxies so requests don’t all come from the same IP.

**Requirements:** Node 18+, Chrome/Chromium (the code expects `/usr/bin/google-chrome-stable`; change `executablePath` in `browser/voting_endpoints.js` if yours is elsewhere).

## Setup

```bash
npm install
```

Create a `.env` in the project root. Optional vars:

- `PORT` — server port (default 3000)
- `PROXY_1`, `PROXY_2`, … — proxy addresses. Format: `ip:port` or `user:pass@ip:port`

If you don’t set any `PROXY_*`, the server still runs; it just won’t use a proxy.

## Run

```bash
node browser/voting_endpoints.js
```

Server listens on the given port (or 3000).

## API

- **GET /health** — basic health + process/system info (handy for debugging).
- **POST /send_link_to_email** — body: `{ "email": "someone@example.com" }`. Opens the ITA school page, clicks “Vote for This School”, and sends the magic link to that email.
- **POST /vote** — body: `{ "link": "https://..." }`. Opens the voting link (e.g. the magic link from the email) and clicks the upvote for ITA.

Errors are returned as JSON with `status: "error"` and a `message` field.

## Other

`email_logic.py` is a separate script that creates temporary mail.tm inboxes and can drive the above endpoints (e.g. get a magic link, then call `/vote` with it). It uses its own env/proxy setup; run it with Python and the same `.env` if you use it.
