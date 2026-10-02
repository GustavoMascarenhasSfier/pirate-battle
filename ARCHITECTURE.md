# Architecture

Pirate Battle keeps the match authoritative in a small TypeScript simulation. React owns menus, forms and dialogs. PixiJS only draws the latest snapshot.

## Runtime split

| Piece                    | Responsibility                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/game/sim.ts`        | Rules: movement, weapons, collisions, enemy AI, spawns, score, end of match. No Pixi or React imports.                               |
| `src/game/config.ts`     | Every balance number. Options supply `sessionSec` and `spawnSec`; `makeConfig` fills the rest. A match stores and plays that object. |
| `src/game/controller.ts` | Pixi application, texture reuse, fit-to-screen, effects, sound, input listeners, disposal.                                           |
| `src/game/audio.ts`      | WAV playback with a synthesized fallback.                                                                                            |
| `src/ui`                 | Menu, options, HUD text, pause dialog, result.                                                                                       |
| `src/api`                | Contracts, fixtures, Axios, TanStack Query, MSW handlers.                                                                            |

The HUD is pushed from the controller about every 150 ms, plus immediately on pause and on `advance()` in tests. React does not render on each animation frame.

## Simulation clock

`GameController` accumulates real frame time and consumes it in fixed 1/60 s steps, capped so a stalled tab cannot fast-forward more than a quarter second per frame. Pause (button, Esc, P, window blur, or a hidden document) clears the accumulator and the input snapshot. Resume is an explicit player action and drops keys that were held across the pause, so a held fire button cannot unload a burst that was buffered while time was stopped.

Spawns, cooldowns, bullets and the match clock only move inside `Sim.step`. After `ended` is set, further steps return immediately.

## Movement, weapons and collisions

The ship moves forward along its heading and rotates in place. The arena clamps every position to the ship radius. Islands are circles. A move that would overlap an island is pushed back out to the rim and clamped again. Bullets die on the same circles, on the arena border, when their lifetime expires, or on the first target they touch. One bullet never damages two ships.

The front gun and the broadsides have separate cooldowns. A broadside fires three parallel shots spaced along the hull. Left and right can both fire on the same step; they still share the broadside cooldown.

Chasers always steer toward the player. If an island blocks the step, they try a few heading offsets and take the one that ends closer to the player. Contact sets the chaser's hull to zero, damages the player and does not add a point. Shooters close until `shooter.range`, then hold and fire on their own cooldown.

`spawn.chaserRatio` is a deterministic mix, not a coin flip. A running total starts at 0 and adds the ratio on every successful spawn. When the total reaches 1, that spawn is a Chaser and the total drops by 1. At 0.5 the sequence is shooter, chaser, shooter, chaser. At 0 every spawn is a shooter. At 1 every spawn is a chaser. Positions still come from a seeded hash so the same seed reproduces the same layout. A candidate point is rejected when it overlaps an island or sits inside `spawn.minPlayerDist` of the player.

## Rendering and resources

Images are loaded with Pixi's `Assets` before the match starts. The UI shows the load fraction. A failure stays on the error overlay; Retry calls `Assets.reset()` and loads again. The match does not start until that load resolves.

Sprites are kept in a map keyed by entity id and destroyed when the entity disappears. Explosion and muzzle sprites are short-lived and destroyed with the stage. Health bars are redrawn above the ship (past the scaled sprite) and moved to the front of the scene graph every frame. Low hulls are tinted and, past half damage, carry a fire sprite.

The world is scaled with `min(screenWidth / arenaWidth, screenHeight / arenaHeight)` and letterboxed. `resolution` follows the device pixel ratio, capped at 2, with `autoDensity` so pointer buttons and the arena stay aligned. Keyboard listeners, the ticker, the audio context and the WebGL view are removed in `dispose()`. A `cancelled` flag plus a `disposed` guard covers React Strict Mode double-mounting: a start that loses the race destroys the half-built application instead of attaching a second canvas.

## Test clock

`?testClock=1&seed=` builds the simulation with that seed and does not advance it from the ticker. `window.__pirate.advance(seconds)` runs the same `step` the ticker would, using the keys or touch buttons currently held. `state()` returns positions, hull, score, enemies and bullets. The production match does not read these flags.

## Local persistence

| Key                                                     | Contents                                                                                                                                  |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `options`                                               | Session length and spawn interval. Survives refresh.                                                                                      |
| `last-result`                                           | Last finished match.                                                                                                                      |
| `pb-screen` in `sessionStorage`                         | Restores the result screen after refresh. Entering a match clears it, so a refresh during play abandons the match and does not record it. |
| `pending-matches`                                       | Finished matches whose POST has not succeeded.                                                                                            |
| `mock-db`, `mock-scenario`, `mock-latency`, `mock-seed` | MSW database, selected failure mode, and test controls.                                                                                   |

A match in progress is not written. Only `onEnd` enqueues a record.

## Ranking and history

Axios calls `/api/ranking`, `/api/history` and `POST /api/matches` with a 4 second timeout (`mock-client-timeout` overrides it in tests). TanStack Query keys ranking by scenario, configuration and page, and history by scenario and page. `placeholderData: keepPreviousData` keeps the previous page on screen while the next loads. The Axios abort signal is the query signal, so a slow response for page 1 is dropped when the user is already on page 2. Queries retry twice. The menu shows loading, a non-blocking error with Retry, an empty state, and "Updating…" while a refetch is in flight. Changing the network scenario changes the query key, so both tabs refetch. Leaving and reopening the menu mounts the tabs again (`staleTime` is 0).

The comparable configuration is `configKey`, the JSON of the full `GameConfig` snapshot taken when the match started. Later edits in Options do not rewrite it. Ranking filters to that key, then sorts by score descending, duration ascending, date ascending, id ascending. History is the local player's rows, newest first. Page size is 5. Fixtures supply other captains plus 12 of the player's own matches so both tabs have more than one page before anyone plays.

`POST /api/matches` inserts by match id. A repeat returns the existing row and does not insert again. The client keeps the record in `pending-matches` until `onSuccess`. A timeout after the server has saved (`post-timeout-after-save`) leaves the row in the database and in the pending queue; the next attempt hits the same id and still yields one row. `post-down` fails before insert. The pending queue is flushed in order on load, after a match, and from Retry. A failure stops the queue so a later record is not skipped; the player can start another match while a save is still pending. API errors never unmount the Play or Options actions.

MSW runs in the browser for `npm run dev`, `npm run preview` and the published build. The service worker is `public/mockServiceWorker.js`. Latency is pinned with `localStorage['mock-latency']` (tests set `0`). Without that pin, `slow` waits 1.6 s, `variable` waits a seeded 40–320 ms (`mock-seed`), and `out-of-order` alternates 1.4 s and 40 ms. `get-timeout` never responds, `connection-error` drops the socket, `ranking-4xx` returns 400, `ranking-error` returns 503, `history-error` returns 500. Reset mock state clears the database, the scenario, the pending queue and the latency pin, then reloads. Confirmed rows live in `mock-db` and show up in both tabs.

## Balance

Default session 90 s, spawn every 3 s, player hull 100, cannon damage 2, Chaser hull 2, Shooter hull 3. A Chaser ram costs 20 hull and no points. Shooters deal 3 every 2.8 s, so a single gunner cannot sink you before a one-minute match ends, and a longer fight still can. The mix above is why a normal match contains both crews within two spawn intervals. These numbers are all in `makeConfig`. Changing them does not require edits in `Sim` beyond the formulas that already read the config.

## Limitations

- Phone orientation is landscape (`manifest.webmanifest`). Portrait still letterboxes the same arena and shows a hint. Rules do not change.
- Pixel ratio is capped at 2.
- The Kenney tile sheets and UI atlas were not in this workspace. Water is a generated tiling texture; islands are vector shapes whose circles are the collision volumes. Ships, shots, fire and explosions use the supplied PNGs. Menu chrome uses the supplied title and background.
- The original WAV pack was not in the workspace. `scripts/make-sounds.mjs` writes short original cannon, hit, explosion and water-loop files. `Sfx` uses those, and a tone if a file is missing.
- `preserveDrawingBuffer` is on only for the test clock, so screenshots can read the canvas.
- No account system. The local player id is `me`.
