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
  createFileItem: async (data: {
    name: string;
    description?: string;
    mimeType: string;
    content: string;
    isText: boolean;
    collectionId?: number | null;
    tags?: string[];
  }) => {
    const r = await apiRequest('POST', '/api/items', { kind: 'file', ...data });
    return r.json();
  },
  createLinkItem: async (data: {
    name: string;
    description?: string;
    url: string;
    collectionId?: number | null;
    tags?: string[];
  }) => {
    const r = await apiRequest('POST', '/api/items', { kind: 'link', ...data });
    return r.json();
  },
  patchItem: async (
    id: number,
    patch: Partial<Pick<Item, 'name' | 'description' | 'url' | 'collectionId'>> & { tags?: string[] },
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

export function formatBytes(n: number | null | undefined): string {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
