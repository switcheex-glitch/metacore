# Metacore — local AI app builder

A desktop application for building React apps with an AI assistant. Scaffold a
new project, chat with the model to generate code, preview it live, and push to
GitHub.

## Quick start

```bash
npm install
npm start
```

Opens an Electron window with Home, Settings, Hub, and Library pages.

## Features

- SQLite + Drizzle for apps, chats, messages, versions.
- Encrypted settings storage (Electron `safeStorage`).
- Per-project GitHub connect + push (PAT, encrypted per app).
- `<metacore-*>` tag parser for structured file edits and dependency installs.
- Live preview via Vite dev-server spawn + iframe.
- Agent mode with Zod-typed tools and consent UI.
- Version history with per-message commits.
