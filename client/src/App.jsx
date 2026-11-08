import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { useAuth } from './auth.jsx';
import { GuestOnly, RequireAuth } from './components/RouteGuards.jsx';
import { FullPageLoading, Skeleton } from './components/States.jsx';
import Join from './pages/Join.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';
import Register from './pages/Register.jsx';

// Code splitting: pages behind the login are separate files, downloaded the first time
// they are opened — someone just visiting the landing page never loads them.
const AppLayout = lazy(() => import('./components/AppLayout.jsx'));
const Today = lazy(() => import('./pages/Today.jsx'));
const Album = lazy(() => import('./pages/Album.jsx'));
const MemoryDetail = lazy(() => import('./pages/MemoryDetail.jsx'));
const People = lazy(() => import('./pages/People.jsx'));
const PersonDetail = lazy(() => import('./pages/PersonDetail.jsx'));
const Archive = lazy(() => import('./pages/Archive.jsx'));
const Artifacts = lazy(() => import('./pages/Artifacts.jsx'));
const Timeline = lazy(() => import('./pages/Timeline.jsx'));
const Search = lazy(() => import('./pages/Search.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const Sharing = lazy(() => import('./pages/Sharing.jsx'));

/** "/" shows the landing page to visitors and the dashboard to people who are logged in. */
function Home() {
  const { user } = useAuth();
  if (user === undefined) return <FullPageLoading />;
  return user ? <Navigate to="/today" replace /> : <Landing />;
}

/** A new page starts at the top (links to #anchors handle their own scrolling). */
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

const page = (element) => <Suspense fallback={<Skeleton height={320} radius={8} />}>{element}</Suspense>;

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Home />} />

        {/* Invite links work whether or not you are logged in. */}
        <Route path="/join/:token" element={<Join />} />

        <Route element={<GuestOnly />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>

        <Route
          element={
            <RequireAuth>
              <Suspense fallback={<FullPageLoading />}>
                <AppLayout />
              </Suspense>
            </RequireAuth>
          }
        >
          <Route path="/today" element={page(<Today />)} />
          <Route path="/album" element={page(<Album />)} />
          <Route path="/album/:id" element={page(<MemoryDetail />)} />
          <Route path="/people" element={page(<People />)} />
          <Route path="/people/:id" element={page(<PersonDetail />)} />
          <Route path="/sharing" element={page(<Sharing />)} />
          <Route path="/archive" element={page(<Archive />)} />
          <Route path="/artifacts" element={page(<Artifacts />)} />
          <Route path="/timeline" element={page(<Timeline />)} />
          <Route path="/search" element={page(<Search />)} />
          <Route path="/settings" element={page(<Settings />)} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
