import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Loading } from "./components/Common/Loading";
import { ErrorBoundary } from "./components/Common/ErrorBoundary";
import { Header } from "./components/Common/Header";
import { AuthProvider } from "./store/authStore";
import { AudioProvider } from "./store/audioStore";

const Home = lazy(() => import("./pages/Home"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const TextPage = lazy(() => import("./pages/TextPage"));
const HubPage = lazy(() => import("./pages/HubPage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));
const CirclePage = lazy(() => import("./pages/CirclePage"));
const AtlasPage = lazy(() => import("./pages/AtlasPage"));
const FigurePage = lazy(() => import("./pages/FigurePage"));
const FigureDetailPage = lazy(() => import("./pages/FigureDetailPage"));
const BookPage = lazy(() => import("./pages/BookPage"));
const ReaderPage = lazy(() => import("./pages/ReaderPage"));

/** 兼容旧链接 /figures/graph?focus=id → 新的集成星图模式，保留 focus */
function GraphRedirect() {
  const [sp] = useSearchParams();
  const focus = sp.get("focus");
  return (
    <Navigate
      to={`/figures?view=graph${focus ? `&focus=${encodeURIComponent(focus)}` : ""}`}
      replace
    />
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      >
        <Routes location={location}>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/books/:id" element={<BookPage />} />
          <Route path="/read/*" element={<ReaderPage />} />
          <Route path="/text/*" element={<TextPage />} />
          <Route path="/hub" element={<HubPage />} />
          <Route path="/figures" element={<FigurePage />} />
          <Route path="/figures/graph" element={<GraphRedirect />} />
          <Route path="/figures/:id" element={<FigureDetailPage />} />
          <Route path="/atlas" element={<AtlasPage />} />
          <Route path="/circle" element={<CirclePage />} />
          <Route
            path="/about"
            element={<AboutPage />}
          />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AudioProvider>
            <Header />
            <div className="site-body">
              <Suspense fallback={<Loading />}>
                <AnimatedRoutes />
              </Suspense>
            </div>
          </AudioProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
