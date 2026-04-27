import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function App() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="max-w-lg rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Welcome to your app</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Edit <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">src/App.tsx</code>{" "}
          or ask Metacore in chat to modify this file. Changes hot-reload here.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button>Get started</Button>
          <Button variant="outline">Learn more</Button>
        </div>
      </div>
    </div>
  );
}
