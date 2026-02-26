# Copilot Instructions

## Project Overview

**遊戲時間助手 (Game Time Assistant)** — a React/TypeScript SPA built for the game "七號黑店". It helps players calculate time differences between in-game time and real-world time. The game clock runs exactly **10 hours behind real time** (`GAME_TIME_OFFSET_HOURS = 10` in `constants.ts`). All time logic assumes the user's device is set to **GMT+8**.

## Commands

```bash
npm run dev        # Start local dev server (Vite)
npm run build      # Production build → dist/
npm run deploy     # Build + push to GitHub Pages (gh-pages -d dist)
```

No test suite exists.

## Architecture

```
App.tsx                          # Mode switcher (nav + renders active mode)
types.ts                         # Shared enums/interfaces (AppMode, TimeDuration, ConversionDirection)
constants.ts                     # GEMINI_MODEL_NAME, GAME_TIME_OFFSET_HOURS
index.tsx                        # ReactDOM.createRoot entry point
index.html                       # Loads Tailwind via CDN, defines ESM importmap

components/
  Mode1TimeDifference.tsx        # Countdown to a target datetime
  Mode2TimeAddition.tsx          # Add a duration to current time
  Mode3GameTimeConverter.tsx     # Convert between game time ↔ real time
  Mode4OffsetDisplay.tsx         # Show current real + game time side-by-side
  shared/
    Button.tsx                   # Primary/secondary variants, isLoading spinner
    Input.tsx                    # Labelled input wrapper
    GeminiMessage.tsx            # AI message display (unused - Gemini removed)
    LoadingSpinner.tsx           # Standalone spinner

services/
  timeUtils.ts                   # All pure time calculation/formatting functions
  geminiService.ts               # Gemini AI client (present but not called from UI)
```

`App.tsx` switches between modes via `AppMode` enum and passes `GAME_TIME_OFFSET_HOURS` as a prop to the modes that need it. There is no routing library — just a `useState<AppMode>`.

## Key Conventions

**Adding a new mode:** Create `components/ModeN<Name>.tsx`, add a value to the `AppMode` enum in `types.ts`, add a `case` in `App.tsx`'s `renderModeContent`, and add a `<NavButton>` in the nav grid.

**Time utilities:** All calculation and formatting helpers live in `services/timeUtils.ts` as named exports. Modes import only what they need — do not inline time logic inside components.

**Tailwind via CDN:** There is no `tailwind.config.js`. Tailwind is loaded via `<script src="https://cdn.tailwindcss.com">` in `index.html`. All utility classes are available but there is no purge/JIT optimisation and no custom theme extension.

**All UI text is Traditional Chinese (zh-Hant).** Keep labels, error messages, and result strings in Chinese.

**Gemini integration is removed.** `geminiService.ts` and `GeminiMessage.tsx` remain but are not wired up. Mode components contain the removed code as comments (marked `// Gemini removed`). Do not re-enable without updating the `API_KEY` access pattern — it uses `process.env.API_KEY` (not a `VITE_` prefix).

**Deployment:** `vite.config.ts` sets `base: '/LFtime/'` for GitHub Pages. The deploy workflow is manual: `npm run deploy` after pushing to `main`.
