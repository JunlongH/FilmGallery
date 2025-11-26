// src/App.js
import React, { useCallback, useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import RollLibrary from './components/RollLibrary';
import NewRollForm from './components/NewRollForm';
import RollDetail from './components/RollDetail';
import FilmLibrary from './components/FilmLibrary';
import Overview from './components/Overview';
import Favorites from './components/Favorites';
import TagGallery from './components/TagGallery';
import Settings from './components/Settings';
import TitleBar from './components/TitleBar';
import { getTags } from './api';
import FloatingRefreshButton from './components/FloatingRefreshButton';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      cacheTime: 1000 * 60 * 30, // 30 minutes
      refetchOnWindowFocus: false,
    },
  },
});

function Layout() {
  const location = useLocation();
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
    <>
      <div className="app-shell">
        <TitleBar />
        <div className="app-body">
          <nav className="sidebar">
            <h2>Film Manager</h2>
            <ul>
              <li>
                <Link to="/">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11.5L12 4l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V11.5z"/></svg>
                  Overview
                </Link>
              </li>
              <li>
                <Link to="/rolls">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h4l1.5-2h5L16 7h4v12H4z"/><circle cx="12" cy="14" r="3"/></svg>
                  Roll Library
                </Link>
              </li>
              {/* Upload moved to Roll Library */}
              <li>
                <Link to="/films">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 7v10M17 7v10"/></svg>
                  Film Library
                </Link>
              </li>
              <li>
                <Link to="/favorites">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 6.6a5.5 5.5 0 0 0-7.8 0L12 7.6l-1-1a5.5 5.5 0 0 0-7.8 7.8L6.3 16l5.7 5.6L17.7 16l1.4-1.4a5.5 5.5 0 0 0 0-7.8z"/></svg>
                  Favorites
                </Link>
              </li>
              <li>
                <Link to="/themes">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12a8 8 0 1 0-16 0 8 8 0 0 0 16 0z"/></svg>
                  Themes
                </Link>
                {/* Show tags list if we are in themes section */}
                {location.pathname.startsWith('/themes') && (
                  <div style={{ paddingLeft: 28, marginTop: 0, fontSize: '13px', color: '#5a4632', lineHeight: '1.4' }}>
                    {tags.map((tag, index) => (
                      <React.Fragment key={tag.id}>
                        <Link 
                          to={`/themes/${tag.id}`} 
                          style={{ textDecoration: 'none', color: 'inherit', display: 'inline-block' }}
                          onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
                          onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
                        >
                          {tag.name}
                        </Link>
                        {index < tags.length - 1 && <span style={{ margin: '0 4px', opacity: 0.5 }}>·</span>}
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </li>
              <li>
                <Link to="/settings">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0A1.65 1.65 0 0 0 9 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                  Settings
                </Link>
              </li>
            </ul>
          </nav>
          <main className="main">
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/rolls" element={<RollLibrary />} />
              <Route path="/rolls/new" element={<NewRollForm />} />
              <Route path="/rolls/:id" element={<RollDetail />} />
              <Route path="/films" element={<FilmLibrary />} />
              <Route path="/favorites" element={<Favorites />} />
              <Route path="/themes" element={<TagGallery />} />
              <Route path="/themes/:tagId" element={<TagGallery />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
      </div>
      <FloatingRefreshButton onRefresh={handleHardRefresh} />
    </>
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
