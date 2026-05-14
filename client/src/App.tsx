import { Switch, Route, Router } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppShell } from '@/components/AppShell';
import NotFound from '@/pages/not-found';
import LibraryPage from '@/pages/LibraryPage';
import CollectionsPage from '@/pages/CollectionsPage';

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={LibraryPage} />
      <Route path="/c/:id" component={LibraryPage} />
      <Route path="/unfiled" component={LibraryPage} />
      <Route path="/collections" component={CollectionsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <AppShell>
            <AppRouter />
          </AppShell>
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
