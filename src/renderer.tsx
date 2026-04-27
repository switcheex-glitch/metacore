import React from "react";
import ReactDOM from "react-dom/client";
import { Provider as JotaiProvider } from "jotai";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter, createHashHistory } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { ConsentDialogHost } from "./components/consent-dialog";
import "./globals.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

const router = createRouter({ routeTree, history: createHashHistory() });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <JotaiProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <ConsentDialogHost />
      </QueryClientProvider>
    </JotaiProvider>
  </React.StrictMode>,
);
