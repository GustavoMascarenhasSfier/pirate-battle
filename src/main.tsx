import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./ui/App";
import "./ui/styles.css";
const qc = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 0, refetchOnWindowFocus: true },
  },
});
async function boot() {
  const { setupWorker } = await import("msw/browser");
  const { handlers } = await import("./api/handlers");
  await setupWorker(...handlers).start({
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  });
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
}
void boot();
