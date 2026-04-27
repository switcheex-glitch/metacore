# AI Rules for this app

This file is automatically included in every AI system prompt. Edit it to guide the assistant's
behaviour. Metacore regenerates a default version when you import an existing project without one.

## Stack (do not change without explicit request)

- React 18 + TypeScript (strict mode)
- Vite 5 for dev server and production build
- Tailwind CSS with the `cn()` helper from `src/lib/utils.ts`
- shadcn/ui primitives in `src/components/ui/` — add via "add component" requests
- Routing: none by default. Add TanStack Router only if the app needs multiple pages.
- State: start with component state. Add Jotai or Zustand only when two sibling components share state.

## File-change rules

- Always use full file paths relative to the project root (e.g. `src/App.tsx`).
- Prefer editing existing files over creating new ones unless the feature genuinely needs one.
- Never touch: `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`,
  `postcss.config.js`, `.gitignore`, `AI_RULES.md` — ask Metacore to propose a dependency via a
  dedicated tool instead.
- Keep Tailwind classes on a single line; avoid inline styles.

## Database / backend guidance

If a Supabase or Neon project is connected, use `execute_sql` (Agent mode) or `<metacore-execute-sql>`
(Build mode) for schema changes. Prefer backwards-compatible migrations: add columns with defaults,
never drop columns without an explicit request.

## Look and feel

- Minimalist, card-based layouts. Generous whitespace. Rounded corners (`rounded-xl` default).
- Use the CSS variables already defined in `src/index.css`.
- Dark mode via the `dark` class on `<html>`.
- Icons from `lucide-react`.
