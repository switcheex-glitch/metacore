import { createFileRoute } from "@tanstack/react-router";
import { AppsListPage } from "@/pages/apps-list";

export const Route = createFileRoute("/apps/")({
  component: AppsListPage,
});
