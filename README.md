# Hub

A small, self-hosted webapp for organizing HTML reports and web links into collections. Drop in a self-contained HTML report or paste a URL (Grafana, Coinglass, internal dashboards — anything), then open items individually, all-at-once in tabs, or as a tiled iframe dashboard.

No login, no accounts. Anyone who can reach the URL sees the same library — meant to be hosted on your own machine or a trusted internal network.

## Features

- **Library** — three-pane view: collection sidebar, item grid with drag-and-drop HTML upload, sandboxed preview pane.
- **Two item kinds** — uploaded HTML files (stored inside the SQLite DB) and plain web links.
- **Collections** — group items, pick a color, edit/delete from the Collections page.
- **Open all** — opens every item in the current view as new browser tabs (links 302 to their URL, files render inline).
- **Dashboard view** — server-rendered tiled iframe page at `/dashboard/:collectionId` with 1/2/3/4 column toggles. Open it directly or click "Dashboard" on a collection card.
- **Search + tags** — quick text filter and tag chips on each card.
- **Dark/light theme** — toggle in the top-right; defaults to your OS preference.

## Requirements

- **Node.js 20+** (uses `better-sqlite3` and ES2022 features)
- macOS, Linux, or Windows (Windows users: WSL2 recommended for `better-sqlite3` builds)

## Quick start

```bash
# 1. Install deps
npm install

# 2. Build the frontend + backend bundle
npm run build

# 3. Run it
npm start
```

The app listens on **port 5000** by default and binds to `0.0.0.0`, so other devices on your LAN can reach it at `http://<your-ip>:5000`.

To use a different port:

```bash
PORT=8080 npm start
```

## Where data lives

Everything is stored in a single SQLite file in the project root:

- `data.db` — schema + all collections + items (including uploaded HTML content)
- `data.db-shm`, `data.db-wal` — SQLite write-ahead-log sidecar files

**Backup** = copy `data.db*` somewhere safe. **Restore** = put them back. Migrating to another machine = copy the project plus `data.db*`.

The DB is created automatically on first run (no migration step needed).

## Adding things

- **Drop an HTML file** onto the items grid, or click **Upload**. Files are saved as text inside the DB. For now, uploads are expected to be self-contained — inline CSS/SVG is fine; external `<link>`/`<script>`/image references won't resolve. (Bundles of HTML + assets may be added later.)
- **Add link** opens a small dialog for URL + name + description. Use this for Grafana panels, Coinglass pages, internal tools — anything you reach by URL.

Some external sites set `X-Frame-Options: deny`, which prevents them from rendering inside the preview iframe or the dashboard tile. The "Open" button on each tile and the "Open all" button always work — they pop the URL out into a real tab.

## Development

```bash
npm run dev
```

Runs Express + Vite on the same port with HMR. The frontend lives under `client/`, the backend under `server/`, shared types under `shared/`.

## Useful endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | liveness check |
| `GET /api/collections` | list with item counts |
| `GET /api/items?collection_id=N\|unfiled&kind=file\|link` | filtered item list (no file content) |
| `GET /api/items/:id/raw[?download=1]` | raw HTML body with proper mime |
| `GET /view/:id` | file raw or 302 → URL for links (used by "Open all") |
| `GET /dashboard/:collectionId?cols=1\|2\|3\|4` | server-rendered tiled iframe page |

## Stopping it

Just `Ctrl+C` the `npm start` process. To run it in the background, use your platform's standard tools (`tmux`, `pm2`, `systemd`, `launchd`, etc.).
