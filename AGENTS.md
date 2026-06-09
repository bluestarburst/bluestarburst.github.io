# Portfolio Site Agent Guide

This repo is the Bluestar Bursts portfolio site. It is not the Plutonium
desktop/web app.

## OpenRTC Identity

- This site owns the workspace `.secrets` `[Portfolio App]` OpenRTC public API key, server secret, and app tag.
- Never copy these values into `../plutonium-src/`. Plutonium has a separate OpenRTC developer app.
- Generic names such as `VITE_OPENRTC_API_KEY` are local to this portfolio repo and do not imply a workspace-wide default.
- Keep production secrets in ignored dotenv files or deployment secrets, never committed source.

## Commands

```bash
pnpm dev
pnpm build
```
