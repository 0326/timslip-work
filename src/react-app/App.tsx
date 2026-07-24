import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Loading } from "./components/Common/Loading";
import { ErrorBoundary } from "./components/Common/ErrorBoundary";
import { Header } from "./components/Common/Header";
import { AuthProvider } from "./store/authStore";
import Home from "./pages/Home";

const SearchPage = lazy(() => import("./pages/SearchPage"));
const TextPage = lazy(() => import("./pages/TextPage"));
const HubPage = lazy(() => import("./pages/HubPage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));
const AtlasPage = lazy(() => import("./pages/AtlasPage"));
const FigurePage = lazy(() => import("./pages/FigurePage"));
const FigureDetailPage = lazy(() => import("./pages/FigureDetailPage"));
const BookPage = lazy(() => import("./pages/BookPage"));
const ReaderPage = lazy(() => import("./pages/ReaderPage"));

/** 空闲时预加载所有懒加载路由 chunk，消除首次切换的 Suspense 闪烁 */
function usePreloadRoutes() {
  useEffect(() => {
    const run = () => {
      void import("./pages/SearchPage");
      void import("./pages/TextPage");
      void import("./pages/HubPage");
      void import("./pages/AboutPage");
      void import("./pages/AtlasPage");
      void import("./pages/FigurePage");
      void import("./pages/FigureDetailPage");
      void import("./pages/BookPage");
      void import("./pages/ReaderPage");
    };
    if ("requestIdleCallback" in window) {
      const id = (window as Window & {
        requestIdleCallback: (cb: () => void) => number;
      }).requestIdleCallback(run);
      return () =>
        (window as Window & {
          cancelIdleCallback: (id: number) => void;
        }).cancelIdleCallback(id);
    }
    const id = setTimeout(run, 1500);
    return () => clearTimeout(id);
  }, []);
}

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
  usePreloadRoutes();
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Header />
          <div className="site-body">
            <Suspense fallback={<Loading />}>
              <AnimatedRoutes />
            </Suspense>
          </div>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
