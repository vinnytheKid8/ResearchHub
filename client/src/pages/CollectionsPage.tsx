import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { api, Collection } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Plus,
  Trash2,
  Pencil,
  Layers,
  ExternalLink,
  ArrowRight,
  Folder,
} from 'lucide-react';

const COLORS = [
  '#06b6d4', // cyan
  '#22d3ee', // cyan-bright
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f43f5e', // rose
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#10b981', // emerald
  '#64748b', // slate
];

export default function CollectionsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Collection | null>(null);
  const [creating, setCreating] = useState(false);

  const collQ = useQuery({
    queryKey: ['/api/collections'],
    queryFn: () => api.listCollections(),
  });
  const collections = collQ.data?.collections ?? [];
  const unfiledCount = collQ.data?.unfiledCount ?? 0;

  const createMut = useMutation({
    mutationFn: (data: { name: string; color: string; description?: string }) =>
      api.createCollection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/collections'] });
      setCreating(false);
      toast({ title: 'Collection created' });
    },
  });

  const patchMut = useMutation({
    mutationFn: (vars: { id: number; patch: any }) => api.patchCollection(vars.id, vars.patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/collections'] });
      setEditing(null);
      toast({ title: 'Updated' });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteCollection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/collections'] });
      queryClient.invalidateQueries({ queryKey: ['/api/items'] });
      toast({ title: 'Collection deleted', description: 'Items moved to Unfiled.' });
    },
  });

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Collections</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Group HTML files and web links. Open all items in tabs or as a tiled dashboard.
            </p>
          </div>
          <Button onClick={() => setCreating(true)} data-testid="button-new-collection">
            <Plus className="w-4 h-4 mr-1.5" /> New collection
          </Button>
        </div>

        {/* Unfiled card */}
        <button
          onClick={() => setLocation('/unfiled')}
          className="w-full text-left rounded-lg border border-dashed border-border bg-card hover-elevate active-elevate-2 p-4 mb-6 flex items-center gap-3"
          data-testid="card-unfiled"
        >
          <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center">
            <Folder className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Unfiled</div>
            <div className="text-xs text-muted-foreground">
              Items not in any collection
            </div>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {unfiledCount}
          </Badge>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* Collections grid */}
        {collQ.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : collections.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-12 text-center">
            <Layers className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <div className="text-sm font-medium mb-1">No collections yet</div>
            <div className="text-xs text-muted-foreground mb-5">
              Create your first collection to start organizing files and links.
            </div>
            <Button onClick={() => setCreating(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> Create collection
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {collections.map((c) => (
              <CollectionCard
                key={c.id}
                collection={c}
                onOpen={() => setLocation(`/c/${c.id}`)}
                onEdit={() => setEditing(c)}
                onDelete={() => {
                  if (confirm(`Delete "${c.name}"? Items will move to Unfiled.`)) {
                    deleteMut.mutate(c.id);
                  }
                }}
                onOpenDashboard={() =>
                  window.open(api.dashboardUrl(c.id, 2), '_blank', 'noopener,noreferrer')
                }
              />
            ))}
          </div>
        )}
      </div>

      <CollectionDialog
        open={creating || !!editing}
        initial={editing ?? undefined}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSubmit={(data) => {
          if (editing) patchMut.mutate({ id: editing.id, patch: data });
          else createMut.mutate(data);
        }}
        loading={createMut.isPending || patchMut.isPending}
      />
    </div>
  );
}

function CollectionCard({
  collection,
  onOpen,
  onEdit,
  onDelete,
  onOpenDashboard,
}: {
  collection: Collection;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenDashboard: () => void;
}) {
  const count = collection.itemCount ?? 0;
  return (
    <div
      data-testid={`card-collection-${collection.id}`}
      className="group rounded-lg border border-card-border bg-card p-4 transition-colors hover:border-foreground/20 flex flex-col gap-3"
    >
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${collection.color}22` }}
        >
          <span
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: collection.color }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{collection.name}</div>
          {collection.description && (
            <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
              {collection.description}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={onEdit}
            data-testid={`button-edit-collection-${collection.id}`}
            aria-label="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={onDelete}
            data-testid={`button-delete-collection-${collection.id}`}
            aria-label="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <Badge variant="outline" className="text-[10px]">
          {count} {count === 1 ? 'item' : 'items'}
        </Badge>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={onOpenDashboard}
            disabled={count === 0}
            data-testid={`button-dashboard-collection-${collection.id}`}
            title="Open as tiled dashboard"
          >
            <Layers className="w-3.5 h-3.5 mr-1" /> Dashboard
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={onOpen}
            data-testid={`button-open-collection-${collection.id}`}
          >
            Open <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function CollectionDialog({
  open,
  initial,
  onClose,
  onSubmit,
  loading,
}: {
  open: boolean;
  initial?: Collection;
  onClose: () => void;
  onSubmit: (data: { name: string; color: string; description: string }) => void;
  loading: boolean;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [description, setDescription] = useState('');
  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setColor(initial?.color ?? COLORS[0]);
      setDescription(initial?.description ?? '');
    }
  }, [open, initial]);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit collection' : 'New collection'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Funding research"
              data-testid="input-collection-name"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Description (optional)</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notes about this collection…"
              rows={2}
              data-testid="input-collection-description"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Color</label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${
                    color === c ? 'border-foreground scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                  data-testid={`button-color-${c}`}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || loading}
            onClick={() => onSubmit({ name: name.trim(), color, description: description.trim() })}
            data-testid="button-collection-submit"
          >
            {initial ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
