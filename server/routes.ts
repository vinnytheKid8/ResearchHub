import type { Express, Request, Response } from 'express';
import type { Server } from 'node:http';
import { storage } from './storage';
import { insertCollectionSchema, insertItemSchema } from '@shared/schema';

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // ============ HEALTH ============
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // ============ COLLECTIONS ============
  app.get('/api/collections', async (_req, res) => {
    const cols = await storage.listCollections();
    // Annotate with item counts
    const items = await storage.listItems();
    const counts = new Map<number, number>();
    for (const it of items) {
      if (it.collectionId != null) counts.set(it.collectionId, (counts.get(it.collectionId) || 0) + 1);
    }
    const unfiled = items.filter((i) => i.collectionId == null).length;
    res.json({
      collections: cols.map((c) => ({ ...c, itemCount: counts.get(c.id) || 0 })),
      unfiledCount: unfiled,
    });
  });
  app.post('/api/collections', async (req, res) => {
    const parsed = insertCollectionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(await storage.createCollection(parsed.data));
  });
  app.patch('/api/collections/:id', async (req, res) => {
    const updated = await storage.updateCollection(parseInt(req.params.id, 10), req.body);
    if (!updated) return res.status(404).json({ error: 'not found' });
    res.json(updated);
  });
  app.delete('/api/collections/:id', async (req, res) => {
    await storage.deleteCollection(parseInt(req.params.id, 10));
    res.json({ ok: true });
  });

  // ============ ITEMS ============
  app.get('/api/items', async (req, res) => {
    const collectionParam = req.query.collection_id;
    let collectionId: number | null | undefined = undefined;
    if (collectionParam === 'null' || collectionParam === 'unfiled') collectionId = null;
    else if (collectionParam !== undefined) collectionId = parseInt(collectionParam as string, 10);
    const kind = req.query.kind as 'file' | 'link' | undefined;
    res.json({ items: await storage.listItems({ collectionId, kind }) });
  });

  app.get('/api/items/:id', async (req, res) => {
    const it = await storage.getItem(parseInt(req.params.id, 10));
    if (!it) return res.status(404).json({ error: 'not found' });
    // Don't ship full content here unless asked
    const { content: _content, ...rest } = it;
    res.json({ ...rest, hasContent: !!_content });
  });

  app.post('/api/items', async (req: Request, res: Response) => {
    try {
      const body = req.body as any;
      if (!body?.kind || !['file', 'link'].includes(body.kind)) {
        return res.status(400).json({ error: "kind must be 'file' or 'link'" });
      }
      if (!body.name) return res.status(400).json({ error: 'name required' });

      let isText = 1;
      let size = 0;
      let content: string | null = null;
      let mimeType: string | null = null;
      let url: string | null = null;

      if (body.kind === 'file') {
        if (!body.content) return res.status(400).json({ error: 'content required for files' });
        mimeType = body.mimeType || 'text/html';
        const inferText =
          body.isText !== undefined
            ? !!body.isText
            : mimeType.startsWith('text/') ||
              mimeType.includes('html') ||
              mimeType.includes('json') ||
              mimeType.includes('xml') ||
              mimeType.includes('svg') ||
              mimeType.includes('csv') ||
              mimeType.includes('javascript');
        isText = inferText ? 1 : 0;
        content = body.content;
        size = isText
          ? Buffer.byteLength(body.content, 'utf8')
          : Math.floor((body.content.length * 3) / 4);
      } else {
        if (!body.url) return res.status(400).json({ error: 'url required for links' });
        url = String(body.url);
        try {
          // Sanity check
          new URL(url);
        } catch {
          return res.status(400).json({ error: 'invalid url' });
        }
      }

      const parsed = insertItemSchema.safeParse({
        kind: body.kind,
        name: body.name,
        description: body.description ?? null,
        mimeType,
        size: size || null,
        content,
        isText,
        url,
        collectionId: body.collectionId ?? null,
        tags: JSON.stringify(body.tags ?? []),
      });
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

      const created = await storage.createItem(parsed.data);
      const { content: _c, ...rest } = created;
      res.json(rest);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/api/items/:id', async (req, res) => {
    const patch: any = { ...req.body };
    if (Array.isArray(patch.tags)) patch.tags = JSON.stringify(patch.tags);
    // Don't allow changing kind after creation
    delete patch.kind;
    const updated = await storage.updateItem(parseInt(req.params.id, 10), patch);
    if (!updated) return res.status(404).json({ error: 'not found' });
    const { content: _c, ...rest } = updated;
    res.json(rest);
  });

  app.delete('/api/items/:id', async (req, res) => {
    await storage.deleteItem(parseInt(req.params.id, 10));
    res.json({ ok: true });
  });

  app.post('/api/items/reorder', async (req, res) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
    await storage.reorderItems(ids.map(Number));
    res.json({ ok: true });
  });

  // Raw content for inline iframe rendering of file items
  app.get('/api/items/:id/raw', async (req, res) => {
    const it = await storage.getItem(parseInt(req.params.id, 10));
    if (!it) return res.status(404).send('Not found');
    if (it.kind !== 'file' || !it.content) return res.status(404).send('Not a file');
    res.setHeader('content-type', it.mimeType || 'text/html; charset=utf-8');
    if (req.query.download === '1') {
      res.setHeader(
        'content-disposition',
        `attachment; filename="${encodeURIComponent(it.name)}"`,
      );
    }
    res.setHeader('cache-control', 'no-store');
    if (it.isText) res.send(it.content);
    else res.send(Buffer.from(it.content, 'base64'));
  });

  // Standalone "open in new tab" page — wraps the file in a minimal HTML chrome
  app.get('/view/:id', async (req, res) => {
    const it = await storage.getItem(parseInt(req.params.id, 10));
    if (!it) return res.status(404).send('Not found');
    if (it.kind === 'link' && it.url) {
      // Just redirect for links
      res.redirect(it.url);
      return;
    }
    if (it.kind === 'file' && it.content) {
      // Send raw file directly so URLs and JS work as authored
      res.setHeader('content-type', it.mimeType || 'text/html; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      if (it.isText) res.send(it.content);
      else res.send(Buffer.from(it.content, 'base64'));
      return;
    }
    res.status(404).send('Not found');
  });

  // Dashboard page: tile every item in a collection in iframes
  app.get('/dashboard/:collectionId', async (req, res) => {
    const cid = parseInt(req.params.collectionId, 10);
    if (Number.isNaN(cid)) return res.status(400).send('Invalid collection id');
    const col = await storage.getCollection(cid);
    if (!col) return res.status(404).send('Collection not found');
    const items = await storage.listItemsForCollection(cid);
    const cols = Math.max(1, Math.min(4, parseInt((req.query.cols as string) || '2', 10)));

    const tiles = items
      .map((it) => {
        const src = it.kind === 'file' ? `/view/${it.id}` : it.url || 'about:blank';
        const safeName = String(it.name).replace(/[<>&"']/g, (c) =>
          ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] || c),
        );
        const badge = it.kind === 'link' ? 'LINK' : (it.mimeType?.split('/')[1] || 'FILE').toUpperCase();
        return `
          <div class="tile">
            <div class="tile-head">
              <span class="tile-kind">${badge}</span>
              <span class="tile-name" title="${safeName}">${safeName}</span>
              <a class="tile-open" href="${src}" target="_blank" rel="noreferrer">Open ↗</a>
            </div>
            <iframe
              src="${src}"
              loading="lazy"
              referrerpolicy="no-referrer"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            ></iframe>
          </div>
        `;
      })
      .join('');

    const safeColName = String(col.name).replace(/[<>&"']/g, (c) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] || c),
    );

    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${safeColName} — Hub Dashboard</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: #0b1220; color: #e2e8f0;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Inter, sans-serif; }
  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px; border-bottom: 1px solid #1e293b; background: #0f172a;
    position: sticky; top: 0; z-index: 10;
  }
  header h1 { font-size: 14px; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
  header .meta { font-size: 12px; color: #94a3b8; }
  header .controls { display: flex; gap: 6px; }
  header .controls a, header .controls button {
    border: 1px solid #334155; background: #0f172a; color: #cbd5e1;
    padding: 4px 10px; border-radius: 6px; font-size: 12px;
    cursor: pointer; text-decoration: none;
  }
  header .controls a:hover, header .controls button:hover { background: #1e293b; }
  .grid {
    display: grid; gap: 8px; padding: 8px;
    grid-template-columns: repeat(${cols}, minmax(0, 1fr));
    height: calc(100vh - 49px);
  }
  .tile {
    display: flex; flex-direction: column; min-height: 0;
    border: 1px solid #1e293b; border-radius: 8px; overflow: hidden;
    background: #0f172a;
  }
  .tile-head {
    display: flex; align-items: center; gap: 8px; padding: 6px 10px;
    border-bottom: 1px solid #1e293b; font-size: 11px; flex-shrink: 0;
  }
  .tile-kind { font-size: 9px; padding: 2px 6px; border-radius: 999px;
    background: #164e63; color: #67e8f9; letter-spacing: 0.05em; font-weight: 600; }
  .tile-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #e2e8f0; }
  .tile-open { color: #22d3ee; text-decoration: none; font-weight: 500; }
  .tile-open:hover { text-decoration: underline; }
  iframe { flex: 1; width: 100%; border: 0; background: #fff; min-height: 0; }
  .empty { padding: 80px; text-align: center; color: #64748b; }
</style>
</head>
<body>
  <header>
    <div>
      <h1>${safeColName}</h1>
      <div class="meta">${items.length} item${items.length === 1 ? '' : 's'} · dashboard view</div>
    </div>
    <div class="controls">
      <a href="?cols=1">1</a>
      <a href="?cols=2">2</a>
      <a href="?cols=3">3</a>
      <a href="?cols=4">4</a>
    </div>
  </header>
  ${items.length ? `<div class="grid">${tiles}</div>` : `<div class="empty">No items in this collection yet.</div>`}
</body>
</html>`);
  });

  return httpServer;
}
