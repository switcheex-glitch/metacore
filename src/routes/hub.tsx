import { createFileRoute } from "@tanstack/react-router";
import { HubPage } from "@/pages/hub";

export const Route = createFileRoute("/hub")({
  component: HubPage,
});
