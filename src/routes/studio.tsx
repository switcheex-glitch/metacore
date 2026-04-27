import { createFileRoute } from "@tanstack/react-router";
import { StudioPage } from "@/pages/studio";

export const Route = createFileRoute("/studio")({
  component: StudioPage,
});
