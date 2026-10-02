# Pirate Battle
<p align="left">
  <a href="https://pirate-battle-tau.vercel.app/" target="_blank">
    <img src="https://img.shields.io/badge/🚀%20Acessar%20Site-4CAF50?style=for-the-badge">
  </a>
</p>

Top-down naval shooter. React and TypeScript (strict) for menus, PixiJS for the arena, TanStack Query and Axios for the ranking and match history, MSW for those APIs, Playwright for end-to-end tests.

No environment variables are required. The mock API is part of the app and runs in development, in `npm run preview`, and in a static deploy.

## Setup

```bash
npm install
npx playwright install chromium
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). A production check is:

```bash
npm run build
npm run preview
```

Other commands:

| Command                   | What it does                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| `npm run lint`            | ESLint on `src`                                                                                       |
| `npm run typecheck`       | `tsc --noEmit`                                                                                        |
| `npm run test:e2e`        | Playwright on desktop Chromium and Pixel 7. HTML report in `playwright-report/`, traces for failures. |
| `npm run test:e2e:update` | Rewrite visual baselines                                                                              |

## Controls

| Action                    | Keyboard                      | Touch                  |
| ------------------------- | ----------------------------- | ---------------------- |
| Forward                   | W or ↑                        | Forward                |
| Rotate                    | A/D or ←/→                    | Turn left / Turn right |
| Front cannon              | Space                         | Fire front             |
| Left broadside (3 shots)  | Q                             | Fire left              |
| Right broadside (3 shots) | E                             | Fire right             |
| Pause / resume            | Esc or P, or the Pause button | same                   |

Movement and firing can be held together. Touch buttons are shown for coarse pointers and for browsers that report touch points. Landscape is the supported phone orientation; portrait letterboxes the same arena.

Game keys are listened to only while a match is mounted. They are ignored when focus is in a text field.

## Gameplay configuration

All balance numbers live in `src/game/config.ts` (`makeConfig`). Options exposes two of them, saved in `localStorage` under `options`:

| Field             | Allowed                                     | Default |
| ----------------- | ------------------------------------------- | ------- |
| Game session time | integers 60–180 seconds                     | 90      |
| Enemy spawn time  | 1–15 seconds, decimals allowed, must be > 0 | 3       |

Play snapshots the config. Editing Options during a later visit does not change a match that already started. A refresh or leaving the fight abandons it and does not record it. The last finished match is kept in `localStorage` (`last-result`) and the result screen is restored if you refresh it.

Default combat numbers (edit `makeConfig`, not the systems): player hull 100, speed 190, turn 2.6 rad/s, front cooldown 0.35 s, broadside cooldown 1.2 s, bullet speed 520, bullet life 1.4 s, bullet damage 2, Chaser hull 2 / speed 120 / ram damage 20, Shooter hull 3 / speed 90 / range 320 / cooldown 2.8 s / damage 3, spawn mix 0.5, minimum spawn distance 350. The mix is deterministic: at 0.5 the order is shooter, chaser, shooter, chaser. A Chaser that rams you does not score.

## Network scenarios

On the main menu, open **Network scenario**. The choice is stored in `localStorage` (`mock-scenario`) and applies to the next request. **Reset mock state** deletes the mock database, the scenario, the pending queue and the latency pin, then reloads. Confirmed matches stay in `localStorage` (`mock-db`) until that reset.

| Scenario                  | Behavior                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `normal`                  | Fixtures plus anything you have saved. Several pages.                                        |
| `empty`                   | Both lists are empty.                                                                        |
| `slow`                    | About 1.6 s before a response.                                                               |
| `variable`                | Seeded delay between 40 ms and 320 ms (`mock-seed`).                                         |
| `out-of-order`            | Alternates about 1.4 s and 40 ms.                                                            |
| `ranking-error`           | Ranking returns HTTP 503. History still works if you switch back.                            |
| `history-error`           | History returns HTTP 500.                                                                    |
| `ranking-4xx`             | Ranking returns HTTP 400.                                                                    |
| `get-timeout`             | Ranking and history never respond (client times out).                                        |
| `connection-error`        | The socket fails.                                                                            |
| `post-timeout-after-save` | The match is stored, then the response never arrives. Retrying does not insert a second row. |
| `post-down`               | The save returns HTTP 503 and nothing is stored until a later successful retry.              |

Play and Options keep working when these fail. A failed save stays in `pending-matches`. You can start another match, refresh, and use **Retry save**. The server treats the match id as an idempotency key.

Tests pin the delay with `localStorage['mock-latency']` (milliseconds) and the Axios timeout with `mock-client-timeout`. Leave the latency key unset to use the scenario's own timing. Set `mock-retry-delay` to `0` to skip the backoff between retries.

## Tests

```bash
npm run test:e2e
```

Each test gets a fresh browser context. Combat tests drive the real keyboard or touch controls and then `window.__pirate.advance(seconds)`, which steps the same simulation the ticker uses. The clock does not run on its own when the URL contains `testClock=1`. Pass `seed` the same way (`/?testClock=1&seed=1`).

Visual baselines live next to the specs (`tests/*-snapshots`) and were taken on Windows 10 with desktop Chromium and Pixel 7. Update them with `npm run test:e2e:update` if you intentionally change pixels.

Open `playwright-report/index.html` after a run. Failed tests keep a trace under `test-results/`.

## Deploy

The published site is a static Vite build. MSW's service worker is copied from `public/`. Ranking and history work on a hard refresh of the deployed URL; they do not call a private server.

Build output is `dist/`. Any static host that serves `index.html` for `/` and does not rewrite `mockServiceWorker.js` is enough (Vercel, Netlify, Cloudflare Pages).
