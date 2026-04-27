import { createFileRoute } from "@tanstack/react-router";
import { LibraryPage } from "@/pages/library";

export const Route = createFileRoute("/library")({
  component: LibraryPage,
});
