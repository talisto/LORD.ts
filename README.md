# Legend of the Red Dragon (Node.js/TypeScript port)

A multi-platform port of **Legend of the Red Dragon (LORD)**, the classic BBS door game originally created by Seth Able Robinson. The original game ran on Bulletin Board Systems in the early 1990s using ANSI terminal graphics.

This version is ported from the [Synchronet BBS](https://github.com/SynchronetBBS/sbbs/tree/master/xtrn/lord) version (GPL-licensed), but heavily modified. The Synchronet version was one monolithic procedural JavaScript file; this version is fully refactored into TypeScript with a modular object-oriented architecture.

It is playable from a CLI, telnet (with RIPscrip graphics in supported clients), or a web browser (with full RIPscrip graphics support, and some additional modern flourishes). It also includes a "door kit" supporting various drop files to allow it to be used with some modern BBSs.

The original DOS version's LDY scripting language for random events has been incorporated with the actual LDY files from the original DOS game (Synchronet's version does not). It also supports ported In-Game Modules (IGMs), including maintenance utilities such as NPCLord and LordEvent.

---

**Disclaimer:** This project was built out of genuine love for the BBS era, and a desire for this piece of gaming history to be accessible to more players. It is an unofficial port, created without permission from the original author of LORD (Seth Able Robinson / Metropolis Gameware) or from Synchronet BBS. The Synchronet port of LORD is released under the GPL, which permits derivative works to be distributed under the same license. This project is therefore believed to be freely distributable. Several included IGMs were reverse-engineered from original DOS binaries; these are 20+ year old abandonware titles and no claim of ownership is made over the originals. If you are an original author and have concerns, please open an issue.

If you are an IGM author and would like to have your IGM added to this project, please reach out!

## Quick Start

### Requirements

- Node.js 22+

### Clone and Initialize Submodules

If you cloned this repository, initialize the submodules before starting the web client:

```bash
git submodule update --init --recursive
```

This populates the vendored frontend dependencies under `webclient/vendor/`, including [RiptermJS](https://github.com/cgorringe/RIPtermJS) for RIP rendering.

### CLI Mode

```bash
./play.sh [username]
```

Runs directly in your terminal using stdin/stdout. If no username is provided, you'll be prompted.

To run against an instance-specific env file:

```bash
./play.sh --env-file .env.game2 [username]
```

For local debugging and content testing, enable the CLI god console:

```bash
./play.sh --god [username]
```

Press `/` at any in-game key prompt to open the console. The god console is only available in local CLI mode, not in live BBS door sessions.

Useful commands:

- `set <field> <value>`: change any saved player field, plus key transient flags such as `has_fairy`, `fairy_lore`, etc.
- `fields [extra|all]`: list editable fields
- `random queue <v1> <v2> ...`: force exact future `random(n)` results for hard-to-reach branches
- `event forest <name>`: trigger hard-coded forest events or external LDY forest events such as `gem`, `oldman`, or `bagogold`
- `event inn <bartender|violet|bard|bard_song|leave_inn>`: jump into inn-related random flows
- `event darkhorse <tavern|blackjack>`: enter the DarkCloak Tavern or blackjack directly
- `event ldy <file> [SECTION]`: run an LDY event directly by file name; if `SECTION` is omitted the event's main entrypoint is used automatically

Inside the god console, use the up and down arrow keys to cycle through commands entered during the current session so you can quickly repeat or edit earlier commands.

### Web Mode (Browser)

The included webclient is a minimal static HTML/CSS/JS terminal that connects to the game server via WebSocket. It supports ANSI text mode and RIPscrip graphics. Docker required to start the server:

#### Docker Compose (Development)

```bash
docker compose -f docker-compose.dev.yml up --build
```

Open [http://localhost:8080](http://localhost:8080). Server code hot-reloads via `tsx watch`; webclient changes require a browser refresh.

#### Docker Compose (Production)

```bash
docker compose up --build
```

Open [http://localhost:80](http://localhost:80) in your browser.

Starts two services:

- **Caddy**: serves the browser client and reverse-proxies WebSocket connections
- **Server**: node.js runs the game logic and handles WebSocket sessions

Game state persists in the bind-mounted `runtime/` directory.

### Telnet Mode

A built-in Telnet server lets classic terminal/BBS clients connect directly.

- Default port: `2323` (configurable via `TELNET_PORT` env var)
- Connect: `telnet 127.0.0.1 2323`
- Recommended clients: SyncTERM (full RIP mode!), NetRunner, PuTTY

### BBS Door Mode

LORD can run as an external door game on modern BBS systems. The BBS writes a drop file with user info, then launches LORD which communicates via stdin/stdout (or an inherited socket handle).

**Supported drop file formats:** DOOR32.SYS (preferred), DOOR.SYS, DORINFOx.DEF

```bash
# Install dependencies
npm install

# Auto-detect drop file in current directory
npx tsx door.ts

# Explicit drop file path
npx tsx door.ts -d /bbs/node1/door32.sys

# Override node number
npx tsx door.ts -d /bbs/node1/door32.sys --node 1

# Local mode for testing (no BBS required)
npx tsx door.ts --local MyPlayer

# Local mode with an instance-specific env file
npx tsx door.ts --env-file .env.game2 --local MyPlayer

# Local mode with the god console enabled
npx tsx door.ts --local --god MyPlayer

# Or use the convenience script
./play-door.sh -d /bbs/node1/door32.sys
```

For unattended BBS launches, point the BBS at `play-door.sh` (Unix-like systems) or invoke your local `tsx` binary with `door.ts`. The legacy `node dist/door.js` path is no longer the supported runtime entry.

**BBS configuration example (Mystic BBS):**
```
Door Name:      LORD
Door Path:      /path/to/lord-ts/
Command Line:   /path/to/lord-ts/play-door.sh -d %d
Drop File Type: DOOR32.SYS
```

**BBS configuration example (Enigma½):**
```json
{
    "name": "LORD",
    "cmd": "/path/to/lord-ts/play-door.sh",
    "args": ["-d", "{dropFile}"],
    "dropFileType": "DOOR32.SYS"
}
```

| Variable | Default | Description |
|----------|---------|-------------|
| `LORD_DOOR_USE_ALIAS` | `true` | Use the user's BBS alias (handle) as player name |
| `LORD_DOOR_TIME_WARN` | `5,2,1` | Time warning intervals in minutes |
| `LORD_DOOR_DROP_DIR` | _(cwd)_ | Directory to search for drop files |

### Disabling Servers

Individual servers can be disabled by setting their port to an empty value, `false`, `null`, or `0`:

```bash
# Disable WebSocket/HTTP server (useful if only running Telnet)
HTTP_PORT=false

# Disable Telnet server
TELNET_PORT=false
```

---

## Configuration

Game settings are defined in `data/settings.json` (read-only defaults; never edit this file). Override any setting using environment variables or a `.env` file at the project root.

For CLI entrypoints (`play.sh`, `play-door.sh`, `door.ts`, `lordctl.ts`), you can select a different env file with `--env-file <path>`. Relative paths are resolved against the project root. For Docker and other process managers, inject environment variables directly with `env_file:` or `environment`.

```bash
cp .env.example .env
# then edit .env

# or keep separate instance files
cp .env.example .env.game1
cp .env.example .env.game2

./play.sh --env-file .env.game2
npm run lordctl -- --env-file .env.game2 state
```

All game settings use the `LORD_` prefix in SCREAMING_SNAKE_CASE. Server-level settings such as `HTTP_PORT`, `TELNET_PORT`, `SENTRY_DSN`, and `SMTP_*` have no prefix.

### Server Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `HTTP_PORT` | `80` | HTTP/WebSocket listener for `/api/*` and `/ws` (set to empty/false/null to disable) |
| `TELNET_PORT` | `2323` | Telnet server port (set to empty/false/null to disable) |
| `SENTRY_DSN` | _(none)_ | Sentry error reporting DSN |
| `SMTP_HOST` | _(none)_ | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP server port |
| `SMTP_SECURE` | `false` | Use TLS for SMTP connection |
| `SMTP_USER` | _(none)_ | SMTP authentication username |
| `SMTP_PASS` | _(none)_ | SMTP authentication password |
| `SMTP_FROM` | _(none)_ | Sender email address for notifications |
| `SMTP_TO` | _(none)_ | Recipient email address for notifications |

**Note:** SMTP settings are currently used only to send a notification to the operator when the game ends. Configure these settings if you want to receive automated email alerts for game-end events.

### Game Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `LORD_ANN_MAX_CHARS_LINE` | `75` | Maximum characters accepted per announcement line |
| `LORD_ANN_MAX_PER_PLAYER_DAY` | `0` | Maximum announcements a single player can make per day; `0` disables the cap |
| `LORD_ANN_MAX_TOTAL_DAY` | `0` | Maximum announcements the realm can accept per day; `0` disables the cap |
| `LORD_ANNOUNCEMENT_MAX_LINES` | `0` | Maximum number of lines per announcement; `0` keeps the stock blank-line loop |
| `LORD_AUTH_REQUIRE_EMAIL` | `false` | Require an email address on auth accounts; new registrations must provide one and older accounts are prompted before play continues |
| `LORD_AUTH_RUNTIME_DIR` | _(same as `LORD_RUNTIME_DIR`)_ | Separate local runtime directory for auth users/sessions |
| `LORD_AUTO_RESET_WON_ROUND` | `false` | Reset a completed round automatically when scheduled maintenance runs, or when `lordctl maint` runs the same headless maintenance path |
| `LORD_BANK_INTEREST` | `10` | Daily bank interest percentage |
| `LORD_BANK_XFER_GOLD_CAP` | `0` | Maximum total gold a player may send by bank transfer in one day; `0` disables the cap |
| `LORD_BANK_XFER_GOLD_RESET_KILL` | `false` | Reset the daily bank-transfer gold cap when a player kills the dragon |
| `LORD_BAR_NPC_CHATTER_PROB` | `0.5` | Probability that the daily NPC bar responder posts chatter |
| `LORD_BEEF_UP` | `false` | After you have dragon kills, some monsters can gain extra HP and strength based on your dragon-kill count |
| `LORD_BLANK_MAIL_DEFAULT_MSG` | `true` | Send the stock canned line when the first entered mail line is blank |
| `LORD_BLOCK_LOGIN_PEND_BATTLE` | `false` | Refuse login while a player is still tied to an unresolved offline PvP battle |
| `LORD_BLOCK_PVP_IF_IN_BATTLE` | `false` | Block offline PvP targeting when the victim is already in battle |
| `LORD_CLEAN_MODE` | `false` | Filter profanity from chat |
| `LORD_DEF_FOR_PK` | `false` | Award `+3` defense after killing another player |
| `LORD_DEL_1XP` | `true` | Delete players with only 1 XP during cleanup |
| `LORD_DELETE_DAYS` | `15` | Days before inactive accounts are deleted (0 = never) |
| `LORD_DK_BOOST` | `false` | Legacy alias for a `3.3x` Death Knight damage multiplier when the explicit multiplier is left at stock |
| `LORD_DK_DAMAGE_MULTIPLIER` | `3.0` | Multiplier applied to Death Knight power-attack damage |
| `LORD_DK_USE_POINT_DIVISOR` | `4` | Skill lessons required per extra daily Death Knight use |
| `LORD_DRAGON_HORSE_SAC_DAMAGE` | `0` | Damage dealt to the dragon when a horse dies intercepting its attack |
| `LORD_FLOWER_BG_COLORS` | `true` | Allow flower garden background color codes |
| `LORD_FOREST_FIGHTS` | `15` | Forest fights per day |
| `LORD_FOREST_L1_ABOVE_L1` | `true` | Keep level 1 monsters in higher-level mixed forest pools |
| `LORD_FOREST_POWER_MOVES` | `true` | Allow generic forest monsters to use enemy power moves |
| `LORD_FUNKY_FLOWERS` | `true` | Enable funky garden flowers |
| `LORD_INACT_RES_SPREAD_MINS` | `0` | Spread inactive-player resurrections across this many minutes after day rollover; `0` keeps the immediate behavior |
| `LORD_INACTIVE_PLAYER_POLICY` | `delete` | What to do with inactive accounts after `delete_days`: `delete` or `hide` |
| `LORD_MAINT_FORCE_DISCONNECT` | `false` | Disconnect active web/telnet sessions during the maintenance window so scheduled maintenance can run |
| `LORD_MAINT_WINDOW_SECONDS` | `0` | Midnight maintenance window length in seconds for the web/telnet server scheduler; `0` disables scheduled maintenance mode |
| `LORD_NO_IGMS_ALLOWED` | `false` | Disable all In-Game Modules |
| `LORD_NOCHAT` | `false` | Disable chat system entirely |
| `LORD_OLD_SKILL_POINTS` | `false` | Use the legacy 5-skill-point rule for Death Knight and thief daily uses, unless the explicit divisor settings override it |
| `LORD_OLD_STEAL` | `true` | Use the old thief fairy bank-steal payout formula; `true` uses `level^3`, `false` uses linear level scaling |
| `LORD_OLIVIA` | `true` | Enable Olivia encounters |
| `LORD_PLAYER_BLOCKING` | `false` | Allow players to block direct mail, PvP targeting, and bank transfers from specific players |
| `LORD_PVP_FIGHTS_PER_DAY` | `3` | PvP fights per day |
| `LORD_PVP_GEM_LOOT_CAP` | `0` | Cap PvP gem rewards after the stock half-gem calculation; `0` keeps the full stock reward |
| `LORD_PVP_GOLD_LOOT_CAP_FACTOR` | `0` | Cap PvP gold rewards to `floor(attacker forest-gold average * factor)`; `0` keeps the stock full-loot reward |
| `LORD_RES_DAYS` | `3` | Days before resurrection is allowed |
| `LORD_SAFE_NODE` | `true` | When a login reuses a node slot, mark any stale previous occupant on that node offline before claiming it |
| `LORD_SHARED_IP_BLOCK_BANK_XFER` | `false` | Block bank transfers between players who recently shared an IP |
| `LORD_SHARED_IP_BLOCK_PVP` | `false` | Block PvP between players who recently shared an IP |
| `LORD_SHARED_IP_BLOCK_ROMANCE` | `false` | Block only the romantic-mail branch between players who recently shared an IP |
| `LORD_SHARED_IP_IGNORE_PRIVATE` | `true` | Ignore RFC1918, loopback, and link-local addresses when recording shared-IP history |
| `LORD_SHARED_IP_WINDOW_DAYS` | `0` | Number of recent game days to consider when checking whether two players shared an IP; `0` disables the restriction |
| `LORD_SHOP_BUYBACK_ENABLED` | `false` | Allow buying back a just-sold shop item during the same shop visit |
| `LORD_SHOP_LIMIT` | `true` | Require the usual strength and defense thresholds when buying weapons and armour; `false` removes those stat gates |
| `LORD_SHOP_RESTORE_ITEM_ON_FAIL` | `false` | Restore the just-sold shop item when an upgrade purchase fails |
| `LORD_SLEEP_DRAGON` | `false` | Anti-camping dragon wake-up: eligible high-level sleepers can be dragged into an immediate Red Dragon fight |
| `LORD_STR_FOR_PK` | `false` | Award `+2` strength after killing another player |
| `LORD_SYSTEM_NAME` | `The Realm` | BBS/realm name shown to players |
| `LORD_THIEF_USE_POINT_DIVISOR` | `4` | Skill lessons required per extra daily thief use |
| `LORD_TIMEOUT` | `900` | Inactivity timeout in seconds (0 = no timeout) |
| `LORD_TIMEZONE` | `UTC` | IANA timezone for day boundaries |
| `LORD_TOURNAMENT_DAYS` | `0` | End the tournament after this many game-days; `0` switches to stat-based mode |
| `LORD_TOURNAMENT_DKILLS` | `0` | Minimum dragon kills required for a stat-based tournament win |
| `LORD_TOURNAMENT_ENABLED` | `false` | Enable tournament mode |
| `LORD_TOURNAMENT_LAYS` | `0` | Minimum lays required for a stat-based tournament win |
| `LORD_TOURNAMENT_LEVEL` | `0` | Minimum level required for a stat-based tournament win |
| `LORD_TOURNAMENT_PKILLS` | `0` | Minimum PvP kills required for a stat-based tournament win |
| `LORD_TOURNAMENT_WINSTAT` | `0` | Ranking stat for time-based tournaments: `0=exp`, `1=drag_kills`, `2=pvp_kills`, `3=level`, `4=lays` |
| `LORD_TOURNAMENT_XP` | `0` | Minimum EXP required for a stat-based tournament win |
| `LORD_TRANSFER_AMOUNT` | `2000000` | Max gold per transfer |
| `LORD_TRANSFERS_ON` | `true` | Allow gold transfers between players |
| `LORD_TRANSFERS_PER_DAY` | `2` | Gold transfers allowed per day |
| `LORD_USE_FANCY_MORE` | `true` | Erase the ANSI `MORE` prompt in place after Continue; `false` leaves a blank line instead |
| `LORD_WIN_DEEDS` | `3` | Dragon kills required to win |

---

## Synchronet BBS Backend

LORD.ts can (in theory, currently untested!) operate as a client node connected to a Synchronet BBS running the `lordsrv` data server. In this mode, player records, state, mail, logs, conversations, and online battle coordination are all handled by the central lordsrv process, enabling true multi-node play across multiple LORD.ts instances and Synchronet BBS instances.

### How It Works

LORD.ts connects to lordsrv over TLS on port 57038 and authenticates with the BBS credentials. All storage operations are forwarded over the TCP connection using lordsrv's text protocol. Each LORD.ts node opens its own persistent connection.

A Worker thread manages the TCP socket (async/event-driven). The main thread uses `SharedArrayBuffer` + `Atomics.wait` to call lordsrv synchronously, matching the synchronous `IStorage` interface. IGM data, config, and auth remain in a local SQLite file per node.

### Configuration

| Setting | Env var | Default | Description |
|---------|---------|---------|-------------|
| `storage_backend` | `LORD_STORAGE_BACKEND` | `sqlite` | Set to `synchronet` to enable this backend |
| `remote_game` | `LORD_REMOTE_GAME` | _(none)_ | lordsrv host, optionally `host:port` (default port 57038) |
| `game_user` | `LORD_GAME_USER` | _(none)_ | BBS username for lordsrv auth |
| `game_pass` | `LORD_GAME_PASS` | _(none)_ | BBS password for lordsrv auth |

Example `.env`:
```bash
LORD_STORAGE_BACKEND=synchronet
LORD_REMOTE_GAME=mybbs.example.com
LORD_GAME_USER=lord
LORD_GAME_PASS=s3cr3t
```

### Limitations (First Release)

- Online battle wait (`WaitBattleResponse`) is a blocking call; the Node.js event loop pauses until the opponent responds. Other sessions on the same process are unresponsive during this window. For production multi-node deployments, run each session in its own Worker thread.
- `state.putState()` is a no-op; generic state writes are not supported by the lordsrv protocol. State changes go through the dedicated IStorage methods (`setLatestHero`, `addForestGold`, etc.) which map to specific lordsrv commands.
- Admin/reporting queries (`listAllMail`, `getPlayerNames`, etc.) fetch data from lordsrv via multiple round-trips; they are slow relative to the local SQLite backend.
- Daily maintenance (`rotateLogs`, updating the days counter) is not synced to lordsrv.

---

## Architecture

### Entry Points

| File | Purpose |
|------|---------|
| `door.ts` | CLI mode (via `--cli` flag) and BBS door mode entry point (DOOR32.SYS / DOOR.SYS / DORINFOx.DEF) |
| `server.ts` | Web/Telnet server entry point |
| `lordctl.ts` | Admin CLI utility (maintenance, player management, NPC management) |

### GameContext (Composition Root)

`src/core/GameContext.ts` is the central bootstrap class. It instantiates all feature classes and wires their dependencies. Classes receive only the specific dependencies they need, with the exception of the IGM subsystem.

### Source Modules (`src/`)

Source files are organized into subdirectories by concern. The project uses **npm workspaces** to make each logically-independent subdirectory its own package under the `@lordts` scope, eliminating fragile relative imports across package boundaries:

| Package | Directory | Purpose |
|---------|-----------|----------|
| `@lordts/core` | `src/core/` | Core game engine: game loop, player records, combat, in-game locations, terminal I/O, networking (WebSocket/Telnet), LDY scripting, and event system |
| `@lordts/util` | `src/util/` | Standalone utilities: ANSI formatting, CP437 encoding, settings, file operations |
| `@lordts/storage` | `src/storage/` | Storage abstraction: SQLite backend, battle coordination, record file formats, multinode support |
| `@lordts/door` | `src/door/` | BBS door mode support: drop file parsing and session handling |
| `@lordts/igm` | `src/igm/` | IGM engine: module loading, execution context, child process bridging, plugin toolkit |

**Dependency graph:**
```
@lordts/util     ←  (zero dependencies)
@lordts/storage  ←  @lordts/util
@lordts/core     ←  @lordts/util, @lordts/storage, @lordts/igm
@lordts/door     ←  @lordts/core (type-only)
@lordts/igm      ←  @lordts/core, @lordts/storage, @lordts/util
```

### Game Event System

`src/core/GameEvents.ts` provides a typed event emitter that game classes use to broadcast what is happening in real time. Every significant game action (navigation, combat, prompts, economy transactions, social interactions) emits a structured event.

**How it works:**
- `GameContext` creates a `GameEvents` instance and wires it to `io.events`.
- Game classes emit events via `this.io.events?.emitXxx(...)` (optional chaining, safe for CLI).
- WebSocket clients receive events as JSON messages via `SessionManager` wiring.
- CLI and Telnet sessions ignore events (no listeners registered).

**Event categories:**

| Category | Events | Description |
|----------|--------|-------------|
| `navigation` | `enter`, `leave` | Player enters/leaves a location |
| `combat` | `encounter`, `player_attack`, `enemy_attack`, `victory`, `defeat`, `flee` | Combat lifecycle |
| `prompt` | `menu` | Game is waiting for input with specific valid options |
| `player` | `level_up`, `death`, `revive`, `equip`, `stat_change`, `class_change`, `healed` | Player stat/status changes |
| `social` | `mail_received`, `flirt`, `marriage`, `divorce` | Social interactions |
| `economy` | `purchase`, `sell`, `deposit`, `withdraw`, `transfer`, `gold_gained`, `gold_lost`, `gem_gained` | Transactions |
| `system` | `login`, `logout`, `daily_maintenance`, `game_over` | System-level events |
| `forest` | `enter`, `search`, `find_gold`, `find_gem`, `fairy`, `event` | Forest-specific events |

**Prompt events** include an array of `PromptOption` objects (`{ key, label }`) describing the valid input choices, enabling GUI clients to render interactive buttons instead of relying on keyboard input.

---

## Directory Structure

```
lord-ts/
├── door.ts                    # CLI and BBS door mode entry point
├── server.ts                  # Web/Telnet server entry point
├── lordctl.ts                 # Admin CLI utility
├── play.sh                    # Shell script to launch CLI
├── src/                       # Workspace packages (core, storage, util, door, igm)
├── data/                      # Read-only game assets (ANSI art, RIP graphics, settings, etc.)
├── runtime/                   # Writable state (gitignored)
│   ├── lord.db                # SQLite database
│   └── lord.ldy               # Event dispatcher (customizable copy)
├── ldy/                       # LDY scripting: official events and community contributions
├── igm/                       # Bundled IGMs and maintenance utilities
├── webclient/                 # Browser client (HTML/CSS/JS terminal with RIP graphics support)
├── docker/                    # Docker deployment config
└── tests/                     # Jest test suites (unit and integration)
```

---

## Database

Default storage backend: SQLite at `runtime/lord.db` (WAL mode). Alternative backends are documented below.

### Tables

| Table | Purpose |
|-------|---------|
| `players` | Player records (JSON, indexed by player number) |
| `state` | Global game state (single record) |
| `game_log` | Daily event log (`day` = `'today'` or `'yesterday'`) |
| `mail` | Inter-player mail (one row per line) |
| `conversations` | Bar chat, garden messages, dirt fighting text |
| `igm_data` | Per-IGM key-value record store |
| `config` | DB-level config overrides (takes precedence over `data/` files) |
| `users` | Web authentication: username, password hash, optional email |
| `sessions` | Web authentication: session tokens |
| `winner_history` | Info/stats on players who have won the game (game reset) |

---

## Lady (LDY) Scripting System

The Lady scripting language enables custom random forest events. LDY files are organized into `ldy/official/` (events from LORD 4.08) and `ldy/3rdparty/` (community contributions). On first startup, `lord.ldy` is copied to `runtime/` where operators can customize the event dispatcher. The executor searches `runtime/` first, then `ldy/official/`, then `ldy/3rdparty/`.

Browse `ldy/official/` and `ldy/3rdparty/` to see all available events.

---

## In-Game Modules (IGMs)

IGMs live in `igm/`. Each is a subdirectory with an `index.ts` that compiles to `dist/igm/<name>/<name>.js`. IGMs can run either **in-process** (loaded as JS modules) or as **external child processes** (spawned via `node main.js`), matching the original DOS LORD architecture.

| IGM | Description |
|-----|-------------|
| `aratime`    | Aragorn's Timer: timed number-guessing game; wager gold and guess a number 1–1000 in 20 seconds |
| `barak`      | Barak's House: humorous NPC encounters, arcade mini-games, and stat powerups |
| `felicity`   | Felicity's Temple: temple exploration with praying, statue room class events, fountain, arcade, secret rooms, and NPC interactions |
| `freeworld2` | The FreeWorld II: once-a-day adventure with Wishing Well, Chancellor guessing game, and random walk events |
| `gravyard`   | The Warrior's Graveyard: grave robbing, hidden ghost challenges, potions, and NPC interactions |
| `lordcave`   | The L.O.R.D. Cavern: cave exploration with 14 random events, RHP scripting |
| `lotto`      | Seth's Lotto: one ticket per day, 4-digit code matching, prizes scale with level |
| `oorphans`   | Olodrin's Orphanage: adopt, sell, and trade children for horses; each with a unique backstory |
| `outhouse`   | The Outhouse: trade forest fights for a chance at stat boosts (charm, defense, or strength) |
| `sandbar`    | Sandtiger's Bar: BarCoin exchange, black market upgrades, Old Witch curses, blackjack & card games |
| `teamlord`   | Team Lord: create/join teams, team battles, doorguard dragons, house invasions, party system, treasury |
| `violet`     | Violet's Cottage: gender-branched cottage exploration with NPC encounters, combat, gossip system, and Archon the Bard |

### External Process IGMs (IGM Kit)

IGMs with a `main.ts` entry point can run as independent child processes. When a player selects an external IGM, LORD.ts:

1. Saves player state to the database
2. Writes an `INFO.<node#>` drop file (original LORD 4.08 format)
3. Spawns the IGM child-process entry point
4. Bridges session I/O via stdin/stdout
5. Reloads player state from the database when the child exits

This provides crash isolation and a simpler development model for third-party IGM authors. See [`igm/README.md`](igm/README.md) for the full developer guide.

### Maintenance-Only IGMs

Some IGMs in `igm/` are maintenance-only; they run during daily maintenance but have no player-facing UI. They set `static maintenanceOnly = true` and are automatically excluded from the "Other Places" menu.

| IGM | Description |
|-----|-------------|
| `lrdevent` | LORD Event: fires scheduled scripted events (stat rewards, seasonal announcements) based on configurable day intervals |
| `npclord`  | NPC Lord: simulates NPC bot player activity: monster fights, levelling, equipment upgrades, bar chat, flirting, and AI mail |

NPC players are created with `lordctl npc create` (or by setting `is_npc = true` on a player record). They are exempt from the `del_1xp` and `delete_days` deletion sweeps.

### Enabling / Disabling IGMs

All IGMs are controlled by `runtime/3rdparty.dat`. This file is **auto-generated** on first startup with all discovered IGMs enabled by default. Newly added modules are automatically appended on subsequent runs.

To disable an IGM, comment out its two-line entry in `3rdparty.dat` by prefixing both lines with `;`:

```
; lines starting with ; are ignored
;igm/barak/barak
;`0T`2ravel `0T`2o `0B`2arak's `0H`2ouse`2
```

Maintenance-only IGMs appear in a separate section at the bottom of `3rdparty.dat`:

```
;--- Maintenance-only IGMs (no player UI, run during daily maintenance) ---
igm/lrdevent/lrdevent
`2Lord Event
igm/npclord/npclord
`2NPC Lord
```

Daily maintenance only runs `runMaint()` for modules that are both listed in `3rdparty.dat` and not commented out.

To disable **all** IGMs without editing the file, set `LORD_NO_IGMS_ALLOWED=true` in `.env`.

IGM state (records) is stored in the `igm_data` table in `lord.db`, not on the filesystem.

---

## RIP Graphics

The telnet server and web client both support **RIPscrip** graphics, replicating LORD's original graphical mode. RIP mode is optional; the game works fully in text-only (ANSI) mode.

- RIP section data is loaded from `data/LORDRIP.DAT` (same `@#SECTIONNAME` format as `LORDTXT.DAT`)
- The server sends RIP sections to the browser as JSON over WebSocket
- The browser client renders graphics on an HTML Canvas (640×350 EGA) alongside an xterm.js text layer
- Clicking RIP buttons sends the associated hotkey back to the server

RIP mode is enabled per-session via the `rip=1` WebSocket query parameter.

---

## Game Mechanics

### Class System

| Class | Special Ability |
|-------|-----------------|
| Death Knight | Power attack (damage + self-heal) |
| Mystic | Magic spells |
| Thief | Steal gold, dodge attacks |

### Level Progression

- Players level 1–12
- Each level requires defeating a master at Turgon's training grounds
- Level 12 unlocks the Red Dragon fight

### Daily Reset (Maintenance)

- Forest fights reset to configured value (default 15)
- PvP fights reset to configured value (default 3)
- Daily flags reset (`seen_master`, `seen_bard`, `seen_violet`, etc.)
- Dead players resurrect after configured delay (default 2 days)
- Game log rotates: today → yesterday, old yesterday deleted
- Maintenance utilities run: `npclord` simulates NPC activity, `lrdevent` fires scheduled events

Maintenance runs automatically when the first player logs in on a new calendar day. It can also be triggered manually (without a player session) using the admin CLI:

```bash
npm run lordctl -- maint
```

### Scheduled Maintenance Window

The web/telnet server entrypoint (`server.ts`) also starts a separate midnight scheduler when `LORD_MAINT_WINDOW_SECONDS > 0`.

- The scheduler is **server-only**. It is used by the web/telnet process and does not run in local CLI mode, door mode, or one-off scripts unless you explicitly invoke `lordctl maint`.
- At local midnight in the configured `LORD_TIMEZONE`, the server enters maintenance mode for the configured number of seconds.
- While maintenance mode is active, new sessions are blocked.
- If `LORD_MAINT_FORCE_DISCONNECT=true`, existing web/telnet sessions are disconnected so the headless maintenance runner can execute during the window.
- This scheduled headless maintenance path is what applies `LORD_AUTO_RESET_WON_ROUND` automatically after a realm has been won.

### CLI and Door Behavior

CLI mode (`play.sh`, `door.ts --local`) and ordinary door launches do **not** run the midnight scheduler.

- They are not kicked out at midnight by `LORD_MAINT_WINDOW_SECONDS` or `LORD_MAINT_FORCE_DISCONNECT`.
- Daily maintenance still runs automatically, but only inline when game flow hits the normal log/day-rollover path, most notably at login via `createLog()`.
- If you need the same headless maintenance behavior that the server scheduler uses, including automatic round reset, run `npm run lordctl -- maint`.

### Admin CLI (`lordctl`)

`lordctl` is a command-line utility for sysop tasks that does not require a running game session. It runs directly through `tsx`, so no build step is required.

```bash
npm run lordctl -- <command>
```

| Command | Description |
|---------|-------------|
| `maint` | Run daily maintenance immediately (rotates log, advances day, runs utils) |
| `day` | Show current day number |
| `day advance [N]` | Advance the day counter by N (default 1) |
| `state` | Show game state summary |
| `player list` | List all active players |
| `player reset <name>` | Reset a player's stats to starting values |
| `player delete <name>` | Delete a player (marks record as 'X') |
| `igm list` | List all configured IGMs with enabled/disabled status |
| `igm enable <name>` | Enable an IGM by name |
| `igm disable <name>` | Disable an IGM by name |

Additional commands are contributed by enabled IGMs. For example, when the **npclord** IGM is enabled, `npc list`, `npc create`, and `npc delete` commands become available. Run `npm run lordctl -- help` to see all available commands including IGM-provided ones.

### End Game and Reset

The game can end in two ways:

1. **`win_deeds` (non-tournament)**: When a player kills the Red Dragon at least
   `LORD_WIN_DEEDS` times (default 3), the game is won.  `state.won_by` is set
  to that player's record number and all subsequent logins display the winner
  screen instead of allowing play. A `winner_history` record is also written
  with the account username, character name, timestamp, and a stat snapshot.

2. **Tournament**: When tournament mode is active and the win condition is met
   (time runs out for time-based, or a player meets all stat thresholds for
   stat-based), `state.won_by` is set in the same way.

When the game ends, the operator receives an automated email notification
(if SMTP is configured) and can reset the game with:

```bash
npm run lordctl -- reset-game
```

This reset:

- Clears `state.won_by` (unlocks the game)
- Resets `state.days` to 0 (restarts the tournament timer if active)
- Resets all player records to level-1 starting stats while preserving their
  character name, sex, class, and login credentials
- Preserves the latest champion through the persistent `winner_history` ledger,
  so the last champion and win totals remain available after the reset
- Removes the `runtime/gameover_notified` dedup flag so the next win triggers
  a fresh notification


The `runtime/gameover_notified` flag file prevents duplicate admin emails on
every login after the game ends.  It is created after the first notification
attempt and deleted by `lordctl reset-game`.

The `winner_history` record store is updated when the realm is won and is
backfilled from `state.won_by` during reset if needed. UI builds surface the
latest entry through `/api/server-info`, and `/api/winners` exposes the full
history plus per-account win totals for charts or leaderboards.

### Tournament Mode

Tournament mode uses the `tournament_*` settings in `data/settings.json` and
can be overridden through the normal `LORD_TOURNAMENT_*` environment variables:

| Field | Description |
|-------|-------------|
| `tournament_enabled` | `true` to activate tournament mode |
| `tournament_days` | **Time-based**: end tournament after this many game-days (0 = stat-based) |
| `tournament_winstat` | Stat used to rank players at time-expiry: 0=exp, 1=drag_kills, 2=pvp_kills, 3=level, 4=lays |
| `tournament_xp` | **Stat-based**: minimum EXP to win (0 = no requirement) |
| `tournament_dkills` | **Stat-based**: minimum dragon kills to win |
| `tournament_pkills` | **Stat-based**: minimum PvP kills to win |
| `tournament_level` | **Stat-based**: minimum level to win |
| `tournament_lays` | **Stat-based**: minimum lays to win |

**Two tournament modes:**

- **Time-based** (`tournament_days > 0`): During daily maintenance, once `state.days >=
  tournament_days`, `tournamentOver()` fires.  It sorts all players by `tournament_winstat`, declares
  the top-ranked player the winner, sets `state.won_by`, and records that win
  in `winner_history`.
- **Stat-based** (`tournament_days = 0`): After every significant in-game action
  (`tournamentCheck()` is called after kills, daily maintenance, etc.).  The
  first player to meet *all* non-zero thresholds wins immediately, and that
  milestone is also recorded in `winner_history`.

**Enabling tournament mode with existing players:**

You can flip `tournament_enabled` from `false` to `true` while the game already has active
players.  Their existing stats (exp, dragon kills, level, etc.) count
immediately, so:

- For **stat-based** tournaments, any player who already meets all configured
  thresholds will win the next time they perform a qualifying action.  Set
  thresholds high enough that no current player already qualifies, or accept
  that the tournament may end quickly.
- For **time-based** tournaments, set `tournament_days` to `state.days + N` (where N is the
  desired remaining duration in game-days) so the tournament doesn't expire the
  very first maintenance cycle.

After a tournament ends (or after `lordctl reset-game`), `state.days` is reset to 0
along with `state.won_by`, giving the next tournament a clean timer.

### Monster Selection

```
Level 1:  index = random(10)
Level 2+: index = ((level - 1) * 11) + random(10)
```

---

## Testing

```bash
npm test                           # All tests
npm run test:unit                  # Unit tests only
npm run test:integration           # Integration tests only
npm run test:coverage              # With coverage report
```

Tests use Jest with ts-jest. Unit tests are in `tests/unit/`, integration tests (full GameContext + SQLite) are in `tests/integration/`.

---

## Build and Deployment

### Development Build

```bash
npm run build          # Compile TypeScript to dist/
npm run build:watch    # Watch mode
npm run typecheck      # Type-check without emitting
npx eslint .           # Lint
```

The build process automatically copies all IGM data files (JSON, TXT, ANS, RHP, DAT, etc.) to `dist/igm/` via a post-build hook, enabling compiled deployments.

### Production Deployment

**Compiled runtime** (transpiled JS output):
```bash
npm run build
node dist/server.js
```

All IGM assets are included in the compiled output. This is suitable for containerized deployments or direct Node.js launches.

**Docker** (recommended):
```bash
docker compose up --build
```

Uses Docker's native copy semantics to include IGM files alongside the compiled JS.

---

## Differences from the DOS Original and SBBS Port

This port intentionally diverges from both the DOS original and the Synchronet BBS JavaScript port it was derived from. The list below documents the most significant changes.

### Differences from the SBBS JavaScript Port

| Area | SBBS Port | This Port |
|------|-----------|-----------|
| **Language / Architecture** | Single monolithic JavaScript file | Modular TypeScript split into workspace packages |
| **Type safety** | No types | Fully typed TypeScript; strict compilation (`tsc --noEmit`) |
| **Storage backend** | Binary flat files (`.DAT`) via a custom `RecordFile` class | SQLite database (`runtime/lord.db`, WAL mode); all records persisted as JSON rows via `DbRecordFile` |
| **LDY scripting** | Not supported | Full LDY engine with official LORD 4.08 events plus additional community events in `ldy/3rdparty/` |
| **In-Game Modules (IGMs)** | 6 IGMs bundled | Bundled player-facing and maintenance IGMs; IGM record data stored in SQLite `igm_data` table instead of flat files |
| **Platforms** | Synchronet BBS only (stdin/stdout to Synchronet shell) | CLI, browser (WebSocket), Telnet, and BBS door mode (DOOR32.SYS / DOOR.SYS / DORINFOx.DEF) |
| **Web client** | None | xterm.js terminal in the browser; full RIPscrip v1.54 graphics on HTML Canvas via [RiptermJS](https://github.com/cgorringe/RIPtermJS) |
| **Admin tools** | None (ini file config) | `lordctl` CLI for maintenance, player management, and IGM management, "god mode" for in-game testing/debugging |
| **Session authentication** | None | Named user accounts with hashed passwords and session tokens; supports multiple simultaneous authenticated players |
| **Event system** | None | `GameEvents` typed event emitter; every significant action (navigation, combat, prompts, economy, social) fires a structured event consumed by WebSocket GUI clients |
| **NPC bots** | Not supported | `npclord` IGM: NPC players simulate daily activity (fights, levelling, chat, flirting, AI mail); `is_npc` flag exempts NPCs from deletion sweeps |
| **Testing** | None | Jest test suite with unit and integration tests; `TestHarness` / `TestSession` for full in-memory game simulation |
| **Build system** | None | TypeScript compilation for game/server code, postbuild IGM asset copy, and Docker Compose for deployment |

### Differences from the DOS Original

| Area | DOS Original | This Port |
|------|--------------|-----------|
| **Word wrapping** | Fixed 80-column hard line breaks baked into text data | `lln()` / `sln()` automatically soft-wrap long lines to fit the actual terminal width; hard line breaks in source text were merged to allow this |
| **Dynamic dividers** | Hard-coded 73-character `═` divider strings | Dividers use a `` `l `` backtick code that generates a full-width divider at render time, adapting to the terminal width |
| **Terminal width awareness** | Fixed 80 columns assumed | Terminal width is tracked per session; output, word wrap, and dividers all adapt when the browser window or telnet client is resized |
| **Character encoding** | CP437 binary bytes in `.DAT` files | All `.DAT` / `.TXT` files are decoded via a full CP437 → Unicode mapping (`CP437.ts`) for correct rendering in modern terminals and browsers |
| **Storage** | Binary `.DAT` flat files | SQLite database; multi-session, multi-node safe (WAL mode) |
| **RIP graphics** | Rendered natively by RIPterm/RIPscrip-aware BBS terminals | Rendered in the browser on an HTML Canvas alongside an xterm.js text layer; RIP section data served as JSON over WebSocket; RIP buttons send hotkeys back to the server |
| **Game reset** | LORDCFG DOS executable to reset game | `lordctl reset-game` resets state and all player records to level-1 while preserving names, sex, class, and login credentials |
| **Operator notifications** | None | SMTP email sent to the operator when the game ends (first win); deduplication flag prevents spam on repeated logins |

---

## Reference Sources

1. **LORD v4.08** (PRIMARY): Final official DOS release by Seth Able Robinson / Metropolis, Inc. Defines game flow, screen sequences, and presentation.
2. **Synchronet BBS JavaScript Port** (SECONDARY): JavaScript port by Stephen Hurd (Deuce) for Synchronet BBS. Reference for internal mechanics, odds, and formulas. Source: [github.com/SynchronetBBS/sbbs/tree/master/xtrn/lord](https://github.com/SynchronetBBS/sbbs/tree/master/xtrn/lord)

---

## Credits & Acknowledgements

### LORD.ts

| Name | Role |
|------|------|
| **Matt Lyon** | Game porting, IGM porting, web client, new feature development |

### Libraries/Dependencies used by LORD.ts
(attribution only, no affiliation)

| Library | Author |
|------|-----------|
| **[RIPtermJS](https://github.com/cgorringe/RIPtermJS)** | Carl Gorringe |

### Original DOS Game

| Name | Role |
|------|------|
| **Seth Able Robinson** | Creator of Legend of the Red Dragon |
| **Robinson Technologies** | Original copyright holder (1992–1997) |
| **Metropolis Gameport / Metropolis, Inc.** | Publisher (1998–2006) |
| **Michael Preslar** | LORD v4.x and the LADY scripting language |
| **Brandon Whitten** | Original documentation |
| **Shawn Berry** | Documentation rewrites, LORDCFG additions |

### Synchronet BBS JavaScript Port

| Name | Role |
|------|------|
| **Stephen Hurd (Deuce)** | Ported LORD to JavaScript for Synchronet BBS |
| **Rob Swindell (Digital Man)** | Author of Synchronet BBS |

### Original IGM Authors

| IGM | Author |
|-----|--------|
| **Aragorn's Timer** | Joseph Masters & by Michael Preslar |
| **Barak's House** | Seth A. Robinson |
| **Felicity's Temple** | Lloyd Hannesson (Tech'N Software Group) |
| **The FreeWorld II** | Chris Martino & Mike Preslar |
| **The Warrior's Graveyard** | Lloyd Hannesson (dasme) |
| **The L.O.R.D. Cavern** | Jason Brown & Donald Tidmore |
| **Seth's Tribute Lotto** | Joseph Masters (Sons of Salami Software Group) |
| **Olodrin's Orphanage** | Underminer |
| **The Outhouse** | Lloyd Hannesson (dasme); original concept by Robert Fogt |
| **Sandtiger's Bar** | Joseph Masters (Sons of Salami Software Group) |
| **Team Lord** | Joseph Masters & Michael Preslar (Elysium Software) |
| **Violet's Cottage** | Trevor Herndon / Archon Computing |
| **Other Places Pickles** | The Lizard Master (GPL v3) |

### Original Addon Authors

| Addon | Author |
|-------|--------|
| **LRDEVENT** (LORD Random Events) | Joseph Masters (Sons of Salami Software Group) |
| **NPCLord** (NPC Maintenance) | Joseph Masters (Sons of Salami Software Group) |

### ANSI Artists

| Artist | Sections |
|--------|----------|
| **access denied** | Title screen |
| **enzo** (iCE) | Dark Cloak Tavern, Red Dragon Inn |
| **bym** | Title screen, Bard screen |
| **superbym / plf** | Forest screen |
| **heineken** | Dark Cloak Tavern |
| **Derek Doda** | Most ANSI art in LORD 3.53+ |
| **Neilscott Tozier** | INTRO2 and others |
| **David Nicholson** | INTRO1 |

### RIP Artists

| Artist | Contribution |
|--------|-------------|
| **Borys Smolaga** | Lead RIP artist (Dead RIPpers' Society) |
| **Ina Stricklen** | All v3.15+ new RIP art |
| **Dead RIPpers' Society (dRs)** | v4.00 RIP screens |

### LDY Script Authors

| Author | Scripts |
|--------|---------|
| **Seth Able Robinson** | bagogold, gem, hag, hamstone, merrymen, oldman, ugly |
| **Michael Preslar** | amulet, horse, troll |
