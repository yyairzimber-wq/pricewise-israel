import { lazy, Suspense } from "react";
import { createHashRouter, RouterProvider } from "react-router-dom";
import { AppShell } from "./ui/layout/AppShell";
import { HomeScreen } from "./ui/screens/HomeScreen";
import { SearchScreen } from "./ui/screens/SearchScreen";
import { NotFoundScreen, RouteError } from "./ui/screens/NotFoundScreen";
import { ResultsScreen } from "./ui/screens/ResultsScreen";

// Secondary screens load on demand, so the first paint ships only Home, Search and Results.
const lazyScreen = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) => lazy(() => load().then((m) => ({ default: m[name] })));
const ProductDetailsScreen = lazyScreen(() => import("./ui/screens/ProductDetailsScreen"), "ProductDetailsScreen");
const BasketScreen = lazyScreen(() => import("./ui/screens/BasketScreen"), "BasketScreen");
const NearbyScreen = lazyScreen(() => import("./ui/screens/NearbyScreen"), "NearbyScreen");
const FavoritesScreen = lazyScreen(() => import("./ui/screens/FavoritesScreen"), "FavoritesScreen");
const HistoryScreen = lazyScreen(() => import("./ui/screens/HistoryScreen"), "HistoryScreen");
const SettingsScreen = lazyScreen(() => import("./ui/screens/SettingsScreen"), "SettingsScreen");
const SharedListScreen = lazyScreen(() => import("./ui/screens/SharedListScreen"), "SharedListScreen");
const CaptureScreen = lazy(() => import("./ui/screens/CaptureScreen").then((m) => ({ default: m.CaptureScreen })));
const ScanScreen = lazy(() => import("./ui/screens/ScanScreen").then((m) => ({ default: m.ScanScreen })));

// Hash routing works unchanged on static hosting and inside a Capacitor WebView.
const router = createHashRouter([
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { path: "/", element: <HomeScreen /> },
      { path: "/search", element: <SearchScreen /> },
      { path: "/product/:id", element: <ResultsScreen /> },
      { path: "/product/:id/details", element: <ProductDetailsScreen /> },
      { path: "/basket", element: <BasketScreen /> },
      { path: "/list/:data", element: <SharedListScreen /> },
      { path: "/nearby", element: <NearbyScreen /> },
      { path: "/favorites", element: <FavoritesScreen /> },
      { path: "/history", element: <HistoryScreen /> },
      { path: "/settings", element: <SettingsScreen /> },
      { path: "*", element: <NotFoundScreen /> },
    ],
  },
  // Full-screen camera flows live outside the shell.
  { path: "/capture", errorElement: <RouteError />, element: <Suspense fallback={<div className="camera" />}><CaptureScreen /></Suspense> },
  { path: "/scan", errorElement: <RouteError />, element: <Suspense fallback={<div className="camera" />}><ScanScreen /></Suspense> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
