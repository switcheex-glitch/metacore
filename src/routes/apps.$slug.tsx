import { createFileRoute } from "@tanstack/react-router";
import { AppDetailsPage } from "@/pages/app-details";

export const Route = createFileRoute("/apps/$slug")({
  component: AppDetailsPage,
});
