# Contributing

This portfolio site is a standalone OpenRTC consumer app. It uses the
published `openrtc` package by default and owns a separate Portfolio App
OpenRTC identity.

## Quick Start

```bash
corepack enable
pnpm install
pnpm mode
pnpm env:setup -- --tier dev
pnpm env:doctor -- --tier dev
pnpm dev
```

`pnpm env:setup` writes `.env.development.local`. Set
`VITE_OPENRTC_API_KEY` there for shared cursors. Use only the portfolio
OpenRTC public key. Do not copy Plutonium, Notebook, or boilerplate
credentials into this repo.

## Validation

```bash
pnpm typecheck
pnpm test
pnpm build
```
