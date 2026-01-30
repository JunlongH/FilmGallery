// src/App.js
import React, { useCallback, useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import RollLibrary from './components/RollLibrary';
import NewRollForm from './components/NewRollForm';
import RollDetail from './components/RollDetail';
import FilmLibrary from './components/FilmLibrary';
import Overview from './components/Overview';
import CalendarView from './components/CalendarView';
import Statistics from './components/Statistics';
import Favorites from './components/Favorites';
import TagGallery from './components/TagGallery';
import Settings from './components/Settings';
import TitleBar from './components/TitleBar';
import ConflictBanner from './components/ConflictBanner';
import EquipmentManager from './components/EquipmentManager';
import LutLibrary from './components/Settings/LutLibrary';
import MapPage from './pages/MapPage';
import { getTags } from './api';
import FloatingRefreshButton from './components/FloatingRefreshButton';
// HeroUI Provider for modern UI components
import { HeroUIProvider } from './providers';
// Modern Sidebar
import { Sidebar, SidebarProvider } from './components/Sidebar';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 10, // 10 minutes (increased for desktop stability)
      cacheTime: 1000 * 60 * 30, // 30 minutes
      refetchOnWindowFocus: false,
      refetchOnReconnect: false, // Desktop app doesn't need reconnect refetch
      refetchOnMount: false, // Use cache if available
      retry: 1, // Reduce retry attempts to speed up error feedback
    },
  },
});

function Layout() {
  const [tags, setTags] = useState([]);
  const queryClient = useQueryClient();

  const refreshTags = useCallback(async () => {
    try {
      const data = await getTags();
      // Filter out tags with 0 photos
      const validTags = (Array.isArray(data) ? data : []).filter(tag => tag.photos_count > 0);
      setTags(validTags);
    } catch (err) {
      console.error('Failed to load tags', err);
      setTags([]);
    }
  }, []);

  useEffect(() => {
    refreshTags();
    const handler = () => refreshTags();
    window.addEventListener('refresh-tags', handler);
    return () => window.removeEventListener('refresh-tags', handler);
  }, [refreshTags]);

  const handleHardRefresh = useCallback(() => {
    try {
      // Clear React Query caches to avoid stale data
      queryClient.clear();
    } catch (e) {
      console.warn('Failed to clear query cache', e);
    }
    // Append a cache-busting param to the URL hash (HashRouter)
    const now = Date.now();
    const href = window.location.href;
    const [base, hash] = href.split('#');
    const newHash = hash ? `${hash.replace(/[?&]force=\d+/, '')}${hash.includes('?') ? '&' : '?'}force=${now}` : `?force=${now}`;
    window.location.replace(`${base}#${newHash}`);
    // Then trigger a full reload to re-fetch assets and data
    window.location.reload();
  }, [queryClient]);

  return (
    <HeroUIProvider>
      <SidebarProvider>
        <ConflictBanner />
        <div className="app-shell">
          <TitleBar />
          <div className="app-body flex">
            {/* Modern Sidebar */}
            <Sidebar tags={tags} />
            
            {/* Main Content */}
            <main className="main flex-1 overflow-auto">
              <Routes>
                <Route path="/" element={<Overview />} />
                <Route path="/calendar" element={<CalendarView />} />
                <Route path="/map" element={<MapPage />} />
                <Route path="/stats" element={<Statistics />} />
                <Route path="/spending" element={<Statistics mode="spending" />} />
                <Route path="/rolls" element={<RollLibrary />} />
                <Route path="/rolls/new" element={<NewRollForm />} />
                <Route path="/rolls/:id" element={<RollDetail />} />
                <Route path="/films" element={<FilmLibrary />} />
                <Route path="/favorites" element={<Favorites />} />
                <Route path="/themes" element={<TagGallery />} />
                <Route path="/themes/:tagId" element={<TagGallery />} />
                <Route path="/equipment" element={<EquipmentManager />} />
                <Route path="/luts" element={<LutLibrary />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </main>
          </div>
        </div>
        <FloatingRefreshButton onRefresh={handleHardRefresh} />
      </SidebarProvider>
    </HeroUIProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Layout />
      </Router>
    </QueryClientProvider>
  );
}

export default App;
