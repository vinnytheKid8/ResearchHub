import { apiRequest } from './queryClient';

export interface Collection {
  id: number;
  name: string;
  color: string;
  description: string | null;
  position: number;
  itemCount?: number;
  createdAt: number;
}

export interface Item {
  id: number;
  kind: 'file' | 'link';
  name: string;
  description: string | null;
  mimeType: string | null;
  size: number | null;
  isText: number;
  url: string | null;
  collectionId: number | null;
  tags: string;
  taggedUsers: string;
  position: number;
  createdAt: number;
  updatedAt: number;
}

async function getJSON<T>(url: string): Promise<T> {
  const r = await apiRequest('GET', url);
  return r.json();
}

export const api = {
  listCollections: () =>
    getJSON<{ collections: Collection[]; unfiledCount: number }>('/api/collections'),
  createCollection: async (data: { name: string; color: string; description?: string }) => {
    const r = await apiRequest('POST', '/api/collections', data);
    return r.json();
  },
  patchCollection: async (id: number, patch: Partial<Collection>) => {
    const r = await apiRequest('PATCH', `/api/collections/${id}`, patch);
    return r.json();
  },
  deleteCollection: (id: number) => apiRequest('DELETE', `/api/collections/${id}`),

  listItems: (params?: { collectionId?: number | null; kind?: 'file' | 'link' }) => {
    const q: string[] = [];
    if (params?.collectionId !== undefined)
      q.push(`collection_id=${params.collectionId === null ? 'unfiled' : params.collectionId}`);
    if (params?.kind) q.push(`kind=${params.kind}`);
    return getJSON<{ items: Item[] }>(`/api/items${q.length ? `?${q.join('&')}` : ''}`);
  },
  /**
   * Stream a File straight to the server via multipart/form-data.
   * Handles files of any size (up to HUB_MAX_UPLOAD_MB on the server, default 5 GB)
   * without buffering them into memory.
   */
  uploadFile: async (
    file: File,
    opts?: {
      name?: string;
      description?: string;
      collectionId?: number | null;
      tags?: string[];
      taggedUsers?: string[];
      onProgress?: (loaded: number, total: number) => void;
    },
  ): Promise<Item> => {
    const form = new FormData();
    form.append('name', opts?.name || file.name);
    if (opts?.description) form.append('description', opts.description);
    if (opts?.collectionId != null) form.append('collectionId', String(opts.collectionId));
    if (opts?.tags) form.append('tags', JSON.stringify(opts.tags));
    if (opts?.taggedUsers) form.append('taggedUsers', JSON.stringify(opts.taggedUsers));
    if (file.type) form.append('mimeType', file.type);
    form.append('file', file, file.name);

    // Use XHR so we get upload progress; fetch() doesn't expose upload progress.
    return new Promise<Item>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/items/upload');
      xhr.responseType = 'json';
      if (opts?.onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) opts.onProgress!(e.loaded, e.total);
        };
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.response as Item);
        } else {
          const msg =
            (xhr.response && xhr.response.error) ||
            `upload failed (HTTP ${xhr.status})`;
          reject(new Error(msg));
        }
      };
      xhr.onerror = () => reject(new Error('network error during upload'));
      xhr.onabort = () => reject(new Error('upload aborted'));
      xhr.send(form);
    });
  },
  createLinkItem: async (data: {
    name: string;
    description?: string;
    url: string;
    collectionId?: number | null;
    tags?: string[];
    taggedUsers?: string[];
  }) => {
    const r = await apiRequest('POST', '/api/items', { kind: 'link', ...data });
    return r.json();
  },
  patchItem: async (
    id: number,
    patch: Partial<Pick<Item, 'name' | 'description' | 'url' | 'collectionId'>> & {
      tags?: string[];
      taggedUsers?: string[];
    },
  ) => {
    const r = await apiRequest('PATCH', `/api/items/${id}`, patch);
    return r.json();
  },
  deleteItem: (id: number) => apiRequest('DELETE', `/api/items/${id}`),
  reorderItems: (ids: number[]) => apiRequest('POST', '/api/items/reorder', { ids }),

  // URLs
  rawUrl: (id: number) => `/api/items/${id}/raw`,
  viewUrl: (id: number) => `/view/${id}`,
  dashboardUrl: (collectionId: number, cols = 2) =>
    `/dashboard/${collectionId}?cols=${cols}`,
};

export function safeTags(tags: string): string[] {
  try {
    const v = JSON.parse(tags || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export const safeUsers = safeTags;

export function formatUploadedAt(ms: number | null | undefined): string {
  if (!ms) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

export function formatBytes(n: number | null | undefined): string {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
