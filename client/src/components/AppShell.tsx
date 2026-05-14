import { ReactNode, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Logo } from './Logo';
import { Sun, Moon, Folders, Library as LibraryIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ThemeToggle() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const root = document.documentElement;
    if (dark) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [dark]);
  return (
    <button
      data-testid="button-theme-toggle"
      onClick={() => setDark((d) => !d)}
      className="hover-elevate active-elevate-2 inline-flex items-center justify-center rounded-md w-8 h-8 border border-border text-muted-foreground"
      aria-label="Toggle theme"
    >
      {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const onLibrary = location === '/' || location.startsWith('/c/') || location === '/unfiled';
  const onCollections = location.startsWith('/collections');
  return (
    <div className="h-screen flex flex-col bg-background text-foreground font-sans">
      <header className="h-14 flex items-center justify-between px-4 border-b border-border shrink-0">
        <button
          onClick={() => setLocation('/')}
          className="flex items-center gap-2 hover-elevate active-elevate-2 rounded-md px-2 py-1 -ml-2"
          data-testid="button-home"
        >
          <Logo className="w-6 h-6 text-primary" />
          <div className="font-semibold tracking-tight">Hub</div>
        </button>
        <div className="flex items-center gap-1">
          <NavBtn
            onClick={() => setLocation('/')}
            active={onLibrary}
            icon={LibraryIcon}
            label="Library"
            testid="nav-library"
          />
          <NavBtn
            onClick={() => setLocation('/collections')}
            active={onCollections}
            icon={Folders}
            label="Collections"
            testid="nav-collections"
          />
          <div className="ml-2">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="flex-1 min-h-0 flex flex-col">{children}</main>
    </div>
  );
}

function NavBtn({
  onClick,
  active,
  icon: Icon,
  label,
  testid,
}: {
  onClick: () => void;
  active: boolean;
  icon: any;
  label: string;
  testid: string;
}) {
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 h-8 rounded-md text-sm hover-elevate active-elevate-2',
        active ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground',
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}
