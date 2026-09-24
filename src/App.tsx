import { lazy, Suspense } from "react";
import { createHashRouter, RouterProvider } from "react-router-dom";
import { AppShell } from "./ui/layout/AppShell";
import { HomeScreen } from "./ui/screens/HomeScreen";
import { SearchScreen } from "./ui/screens/SearchScreen";
import { ResultsScreen } from "./ui/screens/ResultsScreen";
import { ProductDetailsScreen } from "./ui/screens/ProductDetailsScreen";
import { BasketScreen } from "./ui/screens/BasketScreen";
import { NearbyScreen } from "./ui/screens/NearbyScreen";
import { FavoritesScreen } from "./ui/screens/FavoritesScreen";
import { HistoryScreen } from "./ui/screens/HistoryScreen";
import { SettingsScreen } from "./ui/screens/SettingsScreen";

const CaptureScreen = lazy(() => import("./ui/screens/CaptureScreen").then((m) => ({ default: m.CaptureScreen })));
const ScanScreen = lazy(() => import("./ui/screens/ScanScreen").then((m) => ({ default: m.ScanScreen })));

// Hash routing works unchanged on static hosting and inside a Capacitor WebView.
const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <HomeScreen /> },
      { path: "/search", element: <SearchScreen /> },
      { path: "/product/:id", element: <ResultsScreen /> },
      { path: "/product/:id/details", element: <ProductDetailsScreen /> },
      { path: "/basket", element: <BasketScreen /> },
      { path: "/nearby", element: <NearbyScreen /> },
      { path: "/favorites", element: <FavoritesScreen /> },
      { path: "/history", element: <HistoryScreen /> },
      { path: "/settings", element: <SettingsScreen /> },
    ],
  },
  // Full-screen camera flows live outside the shell.
  { path: "/capture", element: <Suspense fallback={<div className="camera" />}><CaptureScreen /></Suspense> },
  { path: "/scan", element: <Suspense fallback={<div className="camera" />}><ScanScreen /></Suspense> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
