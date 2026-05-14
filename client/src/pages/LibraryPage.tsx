import { useState, useRef, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation, useRoute } from 'wouter';
import { api, Collection, Item, safeTags, formatBytes } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Upload,
  Link as LinkIcon,
  FileCode,
  ExternalLink,
  Search,
  MoreVertical,
  Trash2,
  Pencil,
  FolderInput,
  Download,
  ChevronLeft,
  Layers,
  Plus,
  Inbox,
  X,
  Tag as TagIcon,
} from 'lucide-react';

type ViewMode = 'grid' | 'list';

export default function LibraryPage() {
  const [, setLocation] = useLocation();
  const [matchCollection, params] = useRoute('/c/:id');
  const [matchUnfiled] = useRoute('/unfiled');
  const collectionId = matchCollection
    ? parseInt(params!.id, 10)
    : matchUnfiled
    ? null
    : 'all';

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [view, setView] = useState<ViewMode>('grid');
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();

  const collQ = useQuery({
    queryKey: ['/api/collections'],
    queryFn: () => api.listCollections(),
  });
  const collections = collQ.data?.collections ?? [];
  const unfiledCount = collQ.data?.unfiledCount ?? 0;
  const currentCollection =
    typeof collectionId === 'number' ? collections.find((c) => c.id === collectionId) : null;

  const itemsQ = useQuery({
    queryKey: ['/api/items', collectionId],
    queryFn: () =>
      api.listItems(
        collectionId === 'all' ? undefined : { collectionId },
      ),
  });
  const items = itemsQ.data?.items ?? [];

  // Filter by search
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.url || '').toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q) ||
        safeTags(i.tags).some((t) => t.toLowerCase().includes(q)),
    );
  }, [items, search]);

  const selectedItem = filteredItems.find((i) => i.id === selectedId) || null;

  // Reset selection when changing collection
  useEffect(() => {
    setSelectedId(null);
  }, [collectionId]);

  // ============ Mutations ============
  const uploadMutation = useMutation({
    mutationFn: async (files: FileList | File[]) => {
      const targetCol = typeof collectionId === 'number' ? collectionId : null;
      const arr = Array.from(files);
      for (const file of arr) {
        const isText =
          file.type.startsWith('text/') ||
          file.type.includes('html') ||
          file.type.includes('json') ||
          file.type.includes('xml') ||
          file.type.includes('svg') ||
          file.type.includes('csv') ||
          /\.(html?|css|js|md|txt|csv|json|xml|svg)$/i.test(file.name);
        const content = isText ? await file.text() : await fileToBase64(file);
        await api.createFileItem({
          name: file.name,
          mimeType: file.type || guessMime(file.name),
          content,
          isText,
          collectionId: targetCol,
        });
      }
      return arr.length;
    },
    onSuccess: (n) => {
      toast({ title: `Uploaded ${n} file${n === 1 ? '' : 's'}` });
      queryClient.invalidateQueries({ queryKey: ['/api/items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/collections'] });
    },
    onError: (e: any) => toast({ title: 'Upload failed', description: e.message, variant: 'destructive' }),
  });

  const addLinkMutation = useMutation({
    mutationFn: async (data: { name: string; url: string; description: string }) => {
      const targetCol = typeof collectionId === 'number' ? collectionId : null;
      return api.createLinkItem({ ...data, collectionId: targetCol });
    },
    onSuccess: () => {
      toast({ title: 'Link added' });
      setLinkDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/collections'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/collections'] });
      setSelectedId(null);
      toast({ title: 'Deleted' });
    },
  });

  const moveMutation = useMutation({
    mutationFn: (vars: { id: number; collectionId: number | null }) =>
      api.patchItem(vars.id, { collectionId: vars.collectionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/collections'] });
    },
  });

  const patchMutation = useMutation({
    mutationFn: (vars: { id: number; patch: any }) => api.patchItem(vars.id, vars.patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/items'] });
      setEditItem(null);
    },
  });

  // ============ Open all & Dashboard ============
  function openAllInTabs() {
    if (!filteredItems.length) return;
    let blocked = 0;
    for (const it of filteredItems) {
      const url = it.kind === 'file' ? api.viewUrl(it.id) : it.url || '';
      if (!url) continue;
      const w = window.open(url, '_blank', 'noopener,noreferrer');
      if (!w) blocked++;
    }
    if (blocked > 0) {
      toast({
        title: 'Some tabs blocked',
        description: 'Please allow popups for this site to open all items.',
        variant: 'destructive',
      });
    }
  }

  function openDashboard() {
    if (typeof collectionId !== 'number') {
      toast({
        title: 'Pick a collection',
        description: 'Dashboard view is per-collection.',
      });
      return;
    }
    window.open(api.dashboardUrl(collectionId, 2), '_blank', 'noopener,noreferrer');
  }

  // ============ Render ============
  const headerTitle =
    collectionId === 'all'
      ? 'All items'
      : collectionId === null
      ? 'Unfiled'
      : currentCollection?.name || 'Loading…';

  return (
    <div className="flex-1 min-h-0 flex">
      {/* Collections sidebar */}
      <aside className="w-60 shrink-0 border-r border-border flex flex-col">
        <div className="p-3 border-b border-border">
          <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase mb-2">
            Collections
          </div>
          <div className="space-y-0.5">
            <CollectionRow
              active={collectionId === 'all'}
              onClick={() => setLocation('/')}
              icon={Layers}
              label="All items"
              count={items.length === 0 && itemsQ.isLoading ? null : null}
              dot={null}
              testid="nav-all"
            />
            <CollectionRow
              active={collectionId === null}
              onClick={() => setLocation('/unfiled')}
              icon={Inbox}
              label="Unfiled"
              count={unfiledCount}
              dot={null}
              testid="nav-unfiled"
            />
            {collections.map((c) => (
              <CollectionRow
                key={c.id}
                active={collectionId === c.id}
                onClick={() => setLocation(`/c/${c.id}`)}
                dot={c.color}
                label={c.name}
                count={c.itemCount ?? 0}
                testid={`nav-collection-${c.id}`}
              />
            ))}
          </div>
        </div>
        <div className="p-3 mt-auto">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => setLocation('/collections')}
            data-testid="button-manage-collections"
          >
            <Plus className="w-3.5 h-3.5" /> Manage collections
          </Button>
        </div>
      </aside>

      {/* Items column */}
      <section
        className={`flex-1 min-w-0 flex flex-col border-r border-border ${
          dragOver ? 'bg-primary/5 ring-2 ring-primary/40 ring-inset' : ''
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          if (e.dataTransfer.types.includes('Files')) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) {
            uploadMutation.mutate(e.dataTransfer.files);
          }
        }}
      >
        {/* Toolbar */}
        <div className="border-b border-border px-4 py-3 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-base font-semibold tracking-tight truncate flex items-center gap-2">
              {currentCollection && (
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: currentCollection.color }}
                />
              )}
              {headerTitle}
            </h1>
            <Badge variant="outline" className="text-[10px] h-5 shrink-0">
              {filteredItems.length}
            </Badge>
          </div>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="h-8 pl-7 w-44 text-sm"
                data-testid="input-search"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={openAllInTabs}
              disabled={!filteredItems.length}
              data-testid="button-open-all-tabs"
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open all
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={openDashboard}
              disabled={typeof collectionId !== 'number' || !filteredItems.length}
              data-testid="button-open-dashboard"
              title={
                typeof collectionId !== 'number'
                  ? 'Pick a collection to open as dashboard'
                  : 'Tile all items in iframes'
              }
            >
              <Layers className="w-3.5 h-3.5 mr-1.5" /> Dashboard
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLinkDialogOpen(true)}
              data-testid="button-add-link"
            >
              <LinkIcon className="w-3.5 h-3.5 mr-1.5" /> Add link
            </Button>
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              data-testid="button-upload"
            >
              <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept=".html,.htm,text/html,*/*"
              onChange={(e) => {
                if (e.target.files?.length) {
                  uploadMutation.mutate(e.target.files);
                  e.target.value = '';
                }
              }}
            />
          </div>
        </div>

        {/* Items list/grid */}
        <div className="flex-1 min-h-0 overflow-auto p-4">
          {itemsQ.isLoading ? (
            <div className="text-sm text-muted-foreground p-8 text-center">Loading…</div>
          ) : filteredItems.length === 0 ? (
            <EmptyState
              hasSearch={!!search}
              onUpload={() => fileInputRef.current?.click()}
              onAddLink={() => setLinkDialogOpen(true)}
            />
          ) : view === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredItems.map((it) => (
                <ItemCard
                  key={it.id}
                  item={it}
                  collections={collections}
                  selected={selectedId === it.id}
                  onSelect={() => setSelectedId(it.id)}
                  onEdit={() => setEditItem(it)}
                  onDelete={() => deleteMutation.mutate(it.id)}
                  onMove={(cid) => moveMutation.mutate({ id: it.id, collectionId: cid })}
                />
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {/* Preview pane */}
      <section className="w-[44%] min-w-[400px] max-w-[820px] shrink-0 flex flex-col bg-muted/30">
        {selectedItem ? (
          <PreviewPane
            item={selectedItem}
            onClose={() => setSelectedId(null)}
            onEdit={() => setEditItem(selectedItem)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-8 text-center">
            <div>
              <FileCode className="w-8 h-8 mx-auto mb-3 opacity-40" />
              Select an item to preview
            </div>
          </div>
        )}
      </section>

      {/* Add link dialog */}
      <AddLinkDialog
        open={linkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        onSubmit={(data) => addLinkMutation.mutate(data)}
        loading={addLinkMutation.isPending}
      />

      {/* Edit dialog */}
      <EditItemDialog
        item={editItem}
        collections={collections}
        onClose={() => setEditItem(null)}
        onSubmit={(patch) =>
          editItem ? patchMutation.mutate({ id: editItem.id, patch }) : null
        }
        loading={patchMutation.isPending}
      />
    </div>
  );
}

// ============ Components ============

function CollectionRow({
  active,
  onClick,
  icon: Icon,
  dot,
  label,
  count,
  testid,
}: {
  active: boolean;
  onClick: () => void;
  icon?: any;
  dot?: string | null;
  label: string;
  count: number | null;
  testid: string;
}) {
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover-elevate active-elevate-2 ${
        active ? 'bg-secondary text-secondary-foreground' : 'text-foreground/80'
      }`}
    >
      {Icon ? (
        <Icon className="w-3.5 h-3.5 shrink-0" />
      ) : (
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: dot || '#888' }}
        />
      )}
      <span className="truncate flex-1 text-left">{label}</span>
      {count !== null && (
        <span className="text-[10px] text-muted-foreground tabular-nums">{count}</span>
      )}
    </button>
  );
}

function ItemCard({
  item,
  collections,
  selected,
  onSelect,
  onEdit,
  onDelete,
  onMove,
}: {
  item: Item;
  collections: Collection[];
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (collectionId: number | null) => void;
}) {
  const tags = safeTags(item.tags);
  const isLink = item.kind === 'link';
  const opensTo = isLink ? item.url || '' : api.viewUrl(item.id);
  const fileExt = item.kind === 'file' ? (item.name.split('.').pop() || 'file').toLowerCase() : null;

  return (
    <div
      data-testid={`card-item-${item.id}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect();
      }}
      className={`group rounded-lg border bg-card p-4 cursor-pointer transition-colors flex flex-col gap-3 ${
        selected
          ? 'border-primary ring-1 ring-primary/40'
          : 'border-card-border hover:border-foreground/20'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isLink ? (
            <LinkIcon className="w-4 h-4 text-chart-1 shrink-0" />
          ) : (
            <FileCode className="w-4 h-4 text-chart-2 shrink-0" />
          )}
          <Badge
            variant="outline"
            className="text-[9px] h-4 px-1.5 leading-none uppercase tracking-wider"
          >
            {isLink ? 'Link' : fileExt}
          </Badge>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <a
            href={opensTo}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-1 rounded hover-elevate text-muted-foreground hover:text-foreground"
            data-testid={`link-open-${item.id}`}
            title="Open in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="p-1 rounded hover-elevate text-muted-foreground hover:text-foreground"
                data-testid={`button-more-${item.id}`}
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={onEdit} data-testid={`menu-edit-${item.id}`}>
                <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
              </DropdownMenuItem>
              {item.kind === 'file' && (
                <DropdownMenuItem
                  onClick={() => {
                    window.location.href = `/api/items/${item.id}/raw?download=1`;
                  }}
                  data-testid={`menu-download-${item.id}`}
                >
                  <Download className="w-3.5 h-3.5 mr-2" /> Download
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onMove(null)}>
                <FolderInput className="w-3.5 h-3.5 mr-2" /> Move to Unfiled
              </DropdownMenuItem>
              {collections.map((c) => (
                <DropdownMenuItem key={c.id} onClick={() => onMove(c.id)}>
                  <span
                    className="w-2 h-2 rounded-full mr-2"
                    style={{ backgroundColor: c.color }}
                  />
                  Move to {c.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
                data-testid={`menu-delete-${item.id}`}
              >
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div>
        <div className="text-sm font-medium leading-snug line-clamp-2">{item.name}</div>
        {item.description && (
          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {item.description}
          </div>
        )}
        {isLink && item.url && (
          <div className="text-[11px] text-muted-foreground mt-1.5 truncate font-mono">
            {item.url}
          </div>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1 flex-wrap">
          {tags.slice(0, 3).map((t) => (
            <Badge
              key={t}
              variant="outline"
              className="text-[9px] h-4 px-1.5 leading-none"
            >
              {t}
            </Badge>
          ))}
        </div>
        <div className="shrink-0 tabular-nums">
          {item.kind === 'file' ? formatBytes(item.size) : 'Web link'}
        </div>
      </div>
    </div>
  );
}

function PreviewPane({
  item,
  onClose,
  onEdit,
}: {
  item: Item;
  onClose: () => void;
  onEdit: () => void;
}) {
  const isLink = item.kind === 'link';
  const tags = safeTags(item.tags);
  return (
    <>
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 bg-background">
        {isLink ? (
          <LinkIcon className="w-4 h-4 text-chart-1 shrink-0" />
        ) : (
          <FileCode className="w-4 h-4 text-chart-2 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{item.name}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {isLink
              ? item.url
              : `${(item.mimeType || '').split('/')[1] || 'file'} · ${formatBytes(item.size)}`}
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={onEdit} data-testid="button-edit-preview">
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <a
          href={isLink ? item.url || '#' : api.viewUrl(item.id)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border hover-elevate active-elevate-2 text-muted-foreground"
          data-testid="link-open-preview"
          title="Open in new tab"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          data-testid="button-close-preview"
          aria-label="Close preview"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      {(item.description || tags.length > 0) && (
        <div className="px-4 py-2 border-b border-border bg-background">
          {item.description && (
            <div className="text-xs text-muted-foreground">{item.description}</div>
          )}
          {tags.length > 0 && (
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              <TagIcon className="w-3 h-3 text-muted-foreground" />
              {tags.map((t) => (
                <Badge key={t} variant="outline" className="text-[10px] h-4 px-1.5 leading-none">
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex-1 min-h-0 bg-white">
        {isLink ? (
          <LinkPreview url={item.url || ''} />
        ) : (
          <iframe
            key={item.id}
            src={api.rawUrl(item.id)}
            className="w-full h-full border-0 bg-white"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            referrerPolicy="no-referrer"
            title={item.name}
          />
        )}
      </div>
    </>
  );
}

function LinkPreview({ url }: { url: string }) {
  // Try to embed; many sites set X-Frame-Options. Provide fallback.
  const [failed, setFailed] = useState(false);
  // We can't reliably detect iframe load failures cross-origin, so show a
  // small banner with an "Open in new tab" affordance always.
  return (
    <div className="w-full h-full flex flex-col bg-muted/40">
      <div className="px-3 py-2 text-[11px] text-muted-foreground border-b border-border flex items-center gap-2 bg-background">
        Some sites block embedding. If the preview is blank,
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline ml-1"
        >
          open in a new tab ↗
        </a>
      </div>
      {failed ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-8 text-center">
          Cannot embed this site.
        </div>
      ) : (
        <iframe
          src={url}
          className="flex-1 w-full border-0 bg-white"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          title={url}
        />
      )}
    </div>
  );
}

function EmptyState({
  hasSearch,
  onUpload,
  onAddLink,
}: {
  hasSearch: boolean;
  onUpload: () => void;
  onAddLink: () => void;
}) {
  if (hasSearch) {
    return (
      <div className="text-sm text-muted-foreground p-12 text-center">
        No items match your search.
      </div>
    );
  }
  return (
    <div className="border border-dashed border-border rounded-xl p-12 text-center">
      <Upload className="w-8 h-8 mx-auto mb-3 opacity-40" />
      <div className="text-sm font-medium mb-1">Drop HTML files here</div>
      <div className="text-xs text-muted-foreground mb-5">
        Or upload from disk. You can also add web links for dashboards, docs, or anything with a URL.
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button size="sm" onClick={onUpload}>
          <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload files
        </Button>
        <Button size="sm" variant="outline" onClick={onAddLink}>
          <LinkIcon className="w-3.5 h-3.5 mr-1.5" /> Add link
        </Button>
      </div>
    </div>
  );
}

function AddLinkDialog({
  open,
  onClose,
  onSubmit,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; url: string; description: string }) => void;
  loading: boolean;
}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  useEffect(() => {
    if (open) {
      setName('');
      setUrl('');
      setDescription('');
    }
  }, [open]);
  const valid = name.trim() && (() => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  })();
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add web link</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">URL</label>
            <Input
              placeholder="https://grafana.example.com/d/abc"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (!name) {
                  try {
                    const u = new URL(e.target.value);
                    setName(u.hostname);
                  } catch {}
                }
              }}
              data-testid="input-link-url"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Name</label>
            <Input
              placeholder="Grafana — Funding dashboard"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-link-name"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Description (optional)</label>
            <Textarea
              placeholder="Notes about this link…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              data-testid="input-link-description"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid || loading}
            onClick={() => onSubmit({ name: name.trim(), url: url.trim(), description: description.trim() })}
            data-testid="button-link-submit"
          >
            Add link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditItemDialog({
  item,
  collections,
  onClose,
  onSubmit,
  loading,
}: {
  item: Item | null;
  collections: Collection[];
  onClose: () => void;
  onSubmit: (patch: any) => void;
  loading: boolean;
}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [collectionId, setCollectionId] = useState<string>('null');
  useEffect(() => {
    if (item) {
      setName(item.name);
      setUrl(item.url || '');
      setDescription(item.description || '');
      setTags(safeTags(item.tags).join(', '));
      setCollectionId(item.collectionId == null ? 'null' : String(item.collectionId));
    }
  }, [item]);
  if (!item) return null;
  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {item.kind === 'link' ? 'link' : 'file'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-edit-name"
            />
          </div>
          {item.kind === 'link' && (
            <div>
              <label className="text-xs text-muted-foreground">URL</label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} data-testid="input-edit-url" />
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              data-testid="input-edit-description"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Tags (comma-separated)</label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} data-testid="input-edit-tags" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Collection</label>
            <Select value={collectionId} onValueChange={setCollectionId}>
              <SelectTrigger data-testid="select-edit-collection">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="null">Unfiled</SelectItem>
                {collections.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || loading}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                url: item.kind === 'link' ? url.trim() : undefined,
                description: description.trim() || null,
                tags: tags
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean),
                collectionId: collectionId === 'null' ? null : parseInt(collectionId, 10),
              })
            }
            data-testid="button-edit-submit"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ helpers ============

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result as string;
      const i = result.indexOf(',');
      resolve(i >= 0 ? result.slice(i + 1) : result);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function guessMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    json: 'application/json',
    xml: 'application/xml',
    svg: 'image/svg+xml',
    csv: 'text/csv',
    md: 'text/markdown',
    txt: 'text/plain',
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  return ext && map[ext] ? map[ext] : 'application/octet-stream';
}
