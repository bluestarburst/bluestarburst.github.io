# Contributing

This is the Bluestar Bursts portfolio site. It is a standalone OpenRTC
consumer app and owns the Portfolio App OpenRTC identity.

## Start From Zero

```bash
git clone https://github.com/bluestarburst/bluestarburst.github.io.git
cd bluestarburst.github.io
corepack enable
pnpm install
pnpm mode
pnpm env:setup -- --tier dev
```

Edit `.env.development.local`:

```bash
VITE_OPENRTC_API_KEY=pk_test_or_pk_live_portfolio_key
```

Then run:

```bash
pnpm env:doctor -- --tier dev
pnpm dev
```

Use only the portfolio OpenRTC public key. Do not copy Plutonium, notebook,
sample-game, boilerplate, or OpenRTC platform credentials.

## Deployment Env

GitHub Pages deploys read `VITE_OPENRTC_API_KEY` from this repo's Actions
environment. Do not commit `.env.production.local`.

## Validate Before PR

```bash
pnpm env:doctor -- --tier dev
pnpm typecheck
pnpm test
pnpm build
```
