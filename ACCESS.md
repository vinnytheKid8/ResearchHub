# Accessing Hub

Hub is hosted on the `vision` server (`192.168.50.39`) on port **8800**, reachable only via SSH through the `dc2` jump host. This guide covers how to access the UI in a browser and how to push items programmatically.

---

## One-time setup

Add this to `~/.ssh/config` on your laptop:

```ssh-config
Host dc2
    HostName <dc2-hostname-or-ip>
    User <your-username>

Host vision
    HostName 192.168.50.39
    User zhwang
    ProxyJump dc2
    LocalForward 8800 127.0.0.1:8800
```

Replace `<dc2-hostname-or-ip>` and `<your-username>` with your dc2 credentials. The `LocalForward` line is what makes Hub reachable — it tunnels port 8800 on your laptop through dc2 to vision.

**Port collision?** If port 8800 is already in use on your laptop, change the **local** side only:
```ssh-config
LocalForward 18800 127.0.0.1:8800
```
Then use `localhost:18800` everywhere below instead of `localhost:8800`.

---

## Accessing the UI

### Step 1 — open the tunnel

```bash
ssh vision
```

Leave that terminal open. Closing it kills the tunnel and the browser will stop working.

Prefer not to keep a shell open? Background the tunnel:
```bash
ssh -fN vision
```
Kill it later with:
```bash
lsof -ti:8800 | xargs kill
```

### Step 2 — open the browser

Go to:
```
http://localhost:8800
```

You should see the Hub library. Drag-and-drop an HTML file or click **Add link** to test.

Traffic flow: `browser → laptop:8800 → SSH → dc2 → vision:8800`

---

## Pushing items via script

The API has no auth — anyone with tunnel access can POST. Three patterns depending on where the script runs.

### Pattern A — script runs on your laptop (tunnel open)

The tunnel must be active (`ssh vision` or `ssh -fN vision`). Then `localhost:8800` works just like the browser.

**Recommended: streaming multipart upload for files (any size up to `HUB_MAX_UPLOAD_MB`, default 5 GB).** The request body is streamed to disk on the server, so the Node process stays at flat memory regardless of file size.

```python
import requests

HUB = "http://localhost:8800"

with open("/tmp/report.html", "rb") as f:
    r = requests.post(
        f"{HUB}/api/items/upload",
        files={"file": ("btc_funding_2026-05-15.html", f, "text/html")},
        data={
            "name": "btc_funding_2026-05-15.html",
            "collectionId": 3,
            "tags": '["funding", "auto"]',  # JSON-encoded string
            "description": "daily funding snapshot",  # optional
        },
    )
r.raise_for_status()
```

Equivalent `curl`:

```bash
curl -X POST http://localhost:8800/api/items/upload \
  -F "name=btc_funding_2026-05-15.html" \
  -F "collectionId=3" \
  -F 'tags=["funding","auto"]' \
  -F "file=@/tmp/report.html;type=text/html"
```

For link items, keep using the JSON endpoint:

```python
requests.post(f"{HUB}/api/items", json={
    "kind": "link",
    "name": "Grafana — BTC funding",
    "url": "https://grafana.internal/d/btc-funding",
    "collectionId": 3,
    "tags": ["dashboard"],
}).raise_for_status()
```

The legacy JSON-body file upload (`POST /api/items` with `kind="file"` + `content`) still works for small files but is capped by Express's body parser. **Avoid it for anything over ~5 MB** — the multipart endpoint above scales to GB without OOMing the server.

#### Bulk import pattern

If you have many files (e.g. shell-globbing through hundreds of reports), avoid `argument list too long` errors and the body-parser cap by streaming each file:

```bash
for f in /data/reports/*.html; do
  curl -sf -X POST http://localhost:8800/api/items/upload \
    -F "name=$(basename "$f")" \
    -F "collectionId=3" \
    -F "file=@$f;type=text/html" \
    > /dev/null
done
```

### Pattern B — script runs on vision itself

No tunnel needed — vision talks to itself directly:

```python
HUB = "http://localhost:8800"
```

This is the right pattern for cron jobs on vision (e.g. daily funding reports generated from ClickHouse on the same box).

```cron
0 9 * * * /usr/bin/python3 /home/zhwang/scripts/push_funding_report.py >> /tmp/hub.log 2>&1
```

### Pattern C — script runs on another machine without the SSH config

Open the tunnel from inside the script using `sshtunnel`:

```python
from sshtunnel import SSHTunnelForwarder
import requests

with SSHTunnelForwarder(
    ssh_address_or_host=("dc2", 22),
    ssh_username="<your-user>",
    remote_bind_address=("192.168.50.39", 8800),
    local_bind_address=("127.0.0.1", 8800),
) as tunnel:
    requests.post("http://localhost:8800/api/items", json={
        "kind": "link",
        "name": "Grafana — BTC funding",
        "url": "https://grafana.internal/d/btc-funding",
        "collectionId": 3,
    }).raise_for_status()
```

Requires `pip install sshtunnel paramiko` and SSH key auth to dc2.

---

## API quick reference

| Method | Path | Use |
| --- | --- | --- |
| GET | `/api/health` | `{"ok":true}` — sanity check |
| GET | `/api/collections` | list with item counts |
| POST | `/api/collections` | `{name, color?, description?}` |
| GET | `/api/items?collection_id=N\|unfiled&kind=file\|link` | list (metadata only) |
| POST | `/api/items` | JSON — create link, or small JSON-body file (legacy; see below) |
| POST | `/api/items/upload` | **multipart streaming** — recommended for files of any size |
| PATCH | `/api/items/:id` | rename / move / retag |
| DELETE | `/api/items/:id` | delete (also unlinks the on-disk file) |

**POST `/api/items/upload` — multipart streaming (recommended for files):**

Form fields:
- `file` — the file part (required)
- `name` — display name (required)
- `collectionId` — numeric collection id, or omit for Unfiled
- `tags` — JSON-encoded string array, e.g. `["funding","auto"]`
- `description` — optional notes

Server streams the file body straight to `uploads/YYYY/MM/<random>_<filename>` under `HUB_DATA_DIR`. The Node process buffers no more than ~1 MB at a time. Per-file cap = `HUB_MAX_UPLOAD_MB` (default 5120 = 5 GB).

**POST `/api/items` — JSON, file kind (legacy, small files only):**
```json
{
  "kind": "file",
  "name": "report.html",
  "mimeType": "text/html",
  "isText": true,
  "content": "<html>...</html>",
  "collectionId": 3,
  "description": "optional",
  "tags": ["funding", "auto"]
}
```

Subject to Express's JSON body limit (~50 MB). Prefer `/api/items/upload` for anything beyond a small inline snippet.

**POST `/api/items` — link:**
```json
{
  "kind": "link",
  "name": "Grafana — BTC funding",
  "url": "https://grafana.internal/d/btc-funding",
  "collectionId": 3,
  "tags": ["dashboard"]
}
```

---

## Troubleshooting

**`ssh vision` hangs or fails** — try `ssh -v vision` to see where it's stuck. Usually a dc2 auth issue.

**`bind: Address already in use`** — something on your laptop is using port 8800. Change the local side of the forward (see "Port collision" above) or kill whatever's on 8800: `lsof -ti:8800 | xargs kill`.

**Browser shows "connection refused"** — tunnel isn't active. Check with `lsof -i:8800` on your laptop — should show an `ssh` process listening.

**Browser loads but no items / API returns empty** — Hub is running but the DB is empty. Upload something via the UI or POST to `/api/items`.

**`curl http://localhost:8800/api/health` returns `{"ok":true}` from your laptop** — tunnel works, Hub is reachable. If the UI still doesn't load, hard-refresh (Cmd/Ctrl+Shift+R).
