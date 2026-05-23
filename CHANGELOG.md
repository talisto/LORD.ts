# Changelog

All notable changes to Legend of the Red Dragon (LORD) are documented in this file.

This project is a Node.js / TypeScript port of the classic BBS door game LORD v4.08,
originally created by Seth Able Robinson.

## [Unreleased]

## [1.4.6] - 2026-05-23

### Changed

- Felicity's Temple nursery now caps households at 12 children, doubles adoption prices for each child already owned, and keeps child resale at a fixed 250,000 gold so wealthy players cannot use the nursery to stockpile children for daily forest-fight and bank-income abuse
- LordCave's `women.rhp` child-award encounter now respects the cave's 16-child family cap, and the RHP engine clamps all scripted `@KIDS@` rewards to the same limit so custom scripts cannot silently bypass it

## [1.4.5] - 2026-05-23

### Changed

- Olodrin's Orphanage now caps households at 12 children, doubles adoption prices for each child already owned, pays a fixed low resale value, caps the child-for-horse trade at the same limit, and no longer grants extra feral-child gains once the player already has a child

## [1.4.4] - 2026-05-22

### Fixed

- session debug logger now sanitizes filenames derived from account usernames with `filenamify` before creating files under `runtime/logs`, preventing path traversal or unsafe filename issues from crafted usernames

## [1.4.3] - 2026-05-22

### Fixed

- **Sandbar disconnect exploit**: BarCoin balance is now persisted immediately on every spend/earn, preventing players from disconnecting mid-session to keep purchased stats (forest fights, XP, gems) while retaining unspent BarCoins

### Added

- **Session debug logger**: per-player activity logging. Set `DEBUG_LEVEL=debug` and `DEBUG_PLAYERS=*` (or comma-separated names) to log all game events to `runtime/logs/<username>.log`. Levels: `none` (default), `error`, `info`, `debug`
- Forest event instrumentation: rescue success/fail outcomes, Olivia castle hint reveals, and event roll details are now emitted as game events (visible in debug logs and WebSocket clients)
- Sandbar economy events: gold-to-BarCoin exchanges, fight/XP/gem purchases now emit structured economy events

### Changed

- SQLite-backed record stores now log and skip malformed non-JSON record rows instead of silently dropping them or crashing winner-history reads such as `/api/server-info`
- winner-history now rejects invalid winner snapshots before writing incomplete rows, and logs incomplete persisted winner snapshots when it has to apply default values for missing fields

## [1.4.2] - 2026-05-13

### Changed in 1.4.2

- telnet now probes RIP-capable telnet terminals and displays RIP graphics correctly, uploads missing RIP icon assets through compatible RIP cache support

## [1.4.1] - 2026-05-13

### Changed in 1.4.1

- telnet terminal-type negotiation now requests the client terminal name after `WILL TERMINAL_TYPE`, so SyncTERM-style BBS clients switch to CP437 output instead of receiving garbled UTF-8 ANSI art

## [1.4.0] - 2026-05-13

### Changed in 1.4.0

- moved tournament configuration into `data/settings.json` and the normal `LORD_*` env override flow, replacing the separate `tournament_settings.json` loader with `tournament_*` settings
- fixed the `LORD_BEEF_UP` setting path so combat and the status display read the same `beef_up` setting key loaded from config/env

## [1.3.24] - 2026-05-13

### Added

- `LORD_AUTH_REQUIRE_EMAIL`, optional auth-account email storage, and shared account endpoints for updating email and changing passwords

### Changed in 1.3.24

- removed the unused `LORD_NEW_UGLY_STICK` setting from the README and `.env.example`
- removed the legacy `new_ugly_stick` field from the `Settings` interface and matching helper tooling
- extracted Violet's inn interaction into a dedicated `src/core/locations/Violet.ts` class while keeping NPC marriage maintenance in `Marriage.ts`
- web and telnet auth can now stop older accounts at login until a required email address is collected
- completed rounds now append winner snapshots to a `winner_history` ledger

## [1.3.23] - 2026-05-13

### Changed in 1.3.23

- the static webclient now loads `@xterm/xterm` 6.0.0 and `@xterm/addon-fit` 0.11.0 from the CDN instead of the older 5.5.0 / 0.10.0 pair
- the static webclient now waits for the `Web437-IBM-VGA` webfont with `@xterm/addon-web-fonts` before opening xterm, so the terminal measures correctly on first render

## [1.3.22] - 2026-04-25

### Added in 1.3.22

- shared-IP restriction settings and config-backed `player_ip_history` tracking for abuse-prone player interactions

### Changed in 1.3.22

- successful player logins can now record recent public IP history for later abuse checks
- PvP, bank transfers, and the romantic-mail branch can now be blocked between players who recently shared an IP, while ordinary mail remains allowed

## [1.3.21] - 2026-04-25

### Added in 1.3.21

- `LORD_BANK_XFER_GOLD_CAP`, `LORD_BANK_XFER_GOLD_RESET_KILL`, and config-backed `bank_transfer_amount_usage` tracking for daily bank-transfer gold limits

### Changed in 1.3.21

- bank transfers can now enforce a daily total-gold cap alongside the existing per-transfer and per-day-count limits
- waking up now clears tracked bank-transfer gold usage for the new day, and dragon kills can optionally reset the same-day limit

## [1.3.20] - 2026-04-25

### Added in 1.3.20

- `LORD_PVP_GEM_LOOT_CAP` for capping player-kill gem rewards without changing the stock victim-side half-gem loss

### Changed in 1.3.20

- offline and online PvP kills can now cap the attacker's gem payout while still applying the standard victim gem penalty

## [1.3.19] - 2026-04-25

### Added in 1.3.19

- `LORD_PVP_GOLD_LOOT_CAP_FACTOR` for capping player-kill gold rewards against the attacker's eligible forest gold pool

### Changed in 1.3.19

- offline and online PvP kills can now cap the attacker's gold payout while still stripping all carried gold from the victim

## [1.3.18] - 2026-04-25

### Added in 1.3.18

- `LORD_INACTIVE_PLAYER_POLICY=hide` and `hidden_players` support for preserving inactive accounts without exposing them to normal gameplay

### Changed in 1.3.18

- daily maintenance can now hide inactive players instead of deleting their records, and successful login restores hidden accounts automatically
- hidden spouses now use missing-style messaging without forcing an immediate divorce or charm loss

## [1.3.17] - 2026-04-25

### Added in 1.3.17

- `LORD_INACT_RES_SPREAD_MINS` and `scheduled_resurrections` support for delayed inactive-player revivals

### Changed in 1.3.17

- daily maintenance can now spread eligible inactive-player resurrections across a configurable post-midnight window instead of reviving everyone immediately
- scheduled resurrections are applied from maintenance ticks, login flow, and player-record fallback checks so they still complete on lightly used servers

## [1.3.16] - 2026-04-25

### Added in 1.3.16

- `LORD_AUTO_RESET_WON_ROUND` and a shared `GameRoundResetService` for maintenance-driven round resets

### Changed in 1.3.16

- scheduled maintenance can now automatically reset a won round using the same reset logic exposed by `lordctl reset-game`
- game-over messaging now tells players when a won round will reset automatically after midnight maintenance

## [1.3.15] - 2026-04-25

### Added in 1.3.15

- `LORD_MAINT_WINDOW_SECONDS` and `LORD_MAINT_FORCE_DISCONNECT` for scheduled midnight maintenance windows
- reusable `DailyMaintenanceRunner` and `MaintenanceScheduler` services for server-driven maintenance

### Changed in 1.3.15

- `lordctl maint` now uses the shared canonical maintenance runner instead of duplicating the maintenance sequence inline
- `SessionManager` can reject or disconnect sessions while a maintenance window is active so scheduled maintenance has a safe execution window

## [1.3.14] - 2026-04-25

### Added in 1.3.14

- announcement cap settings and config-backed `announcement_usage` tracking for daily per-player and global limits

### Changed in 1.3.14

- `Output.announce()` can now enforce one-line mode, daily per-player caps, and daily global caps without changing the rendered news log format

## [1.3.13] - 2026-04-25

### Added in 1.3.13

- `LORD_PLAYER_BLOCKING` and config-backed `player_blocks` state for player-managed contact blocking

### Changed in 1.3.13

- blocked players can no longer send direct mail, start offline PvP, or transfer bank gold to the blocker
- the mail flow now exposes simple block and unblock actions for the selected player

## [1.3.12] - 2026-04-25

### Added in 1.3.12

- `LORD_BLANK_MAIL_DEFAULT_MSG` to preserve or disable the stock canned fallback line for blank mail

### Changed in 1.3.12

- blank-first-line mail can now cancel cleanly with `Mail cancelled.` instead of always sending filler text

## [1.3.11] - 2026-04-25

### Added in 1.3.11

- `LORD_SHOP_BUYBACK_ENABLED` and `LORD_SHOP_RESTORE_ITEM_ON_FAIL` for same-visit shop buyback and failed-upgrade restoration

### Changed in 1.3.11

- King Arthur's Weapons and Abdul's Armour now keep per-visit pending sale state so a sold item can be bought back immediately or restored after a failed upgrade attempt when configured

## [1.3.10] - 2026-04-25

### Added in 1.3.10

- `LORD_DK_USE_POINT_DIVISOR` and `LORD_THIEF_USE_POINT_DIVISOR` for configurable class use-point gain

### Changed in 1.3.10

- Death Knight and thief wake-up recalculation plus class-raise messaging now resolve through the configured divisors, with `LORD_OLD_SKILL_POINTS` retained as a compatibility alias for divisor `5`

## [1.3.9] - 2026-04-25

### Added in 1.3.9

- `LORD_BAR_NPC_CHATTER_PROB` to control how often the daily NPC bar responder posts chatter

### Changed in 1.3.9

- Daily NPC bar chatter now uses a configurable probability while keeping `LORD_NOCHAT` as the hard off switch

## [1.3.8] - 2026-04-25

### Added in 1.3.8

- `LORD_FOREST_POWER_MOVES` to control whether generic forest monsters can use enemy power moves

### Changed in 1.3.8

- Forest-loaded monsters now carry explicit forest combat context so disabling their power moves does not affect PvP, arena, dragon, or other combat paths

## [1.3.7] - 2026-04-25

### Changed in 1.3.7

- Raised the default gameplay inactivity timeout from 300 seconds to 900 seconds so the shipped in-game timeout matches the existing 15-minute server idle timeout

## [1.3.6] - 2026-04-25

### Added in 1.3.6

- `LORD_DRAGON_HORSE_SAC_DAMAGE` to configure how much damage the dragon takes when a horse dies intercepting its attack

### Changed in 1.3.6

- Dragon horse saves now optionally subtract configured damage from dragon HP while leaving the stock zero-damage behavior unchanged by default

## [1.3.5] - 2026-04-25

### Added in 1.3.5

- `LORD_FOREST_L1_ABOVE_L1` to keep or exclude level 1 encounters from higher-level mixed forest monster rolls

### Changed in 1.3.5

- Higher-level forest mixed-pool encounters can now skip monster bucket 0 while leaving the dedicated level-1 monster path unchanged

## [1.3.4] - 2026-04-25

### Added in 1.3.4

- `LORD_FLOWER_BG_COLORS` to keep funky flower foreground colors while optionally stripping garden background color codes

### Changed in 1.3.4

- Flower garden messages and conversation playback now remove only `r0` through `r7` codes when the new background-color toggle is disabled, instead of forcing the all-or-nothing `funky_flowers` behavior

## [1.3.3] - 2026-04-24

### Added in 1.3.3

- `LORD_BLOCK_LOGIN_PEND_BATTLE` to refuse login when an attacker reconnects before an unresolved offline PvP battle has been cleared

### Changed in 1.3.3

- Offline PvP participant tracking now records both sides of the pending battle so login-time checks and orphaned-lock cleanup stay symmetric in local storage

## [1.3.2] - 2026-04-24

### Added in 1.3.2

- `LORD_BLOCK_PVP_IF_IN_BATTLE` to opt into blocking a second offline PvP attacker from targeting a player who already has a local battle lock

### Fixed in 1.3.2

- The local battle coordinator now returns the existing attacker's record for locked targets instead of silently overwriting the battle lock when the new PvP-target setting is enabled

## [1.3.1] - 2026-04-24

### Added in 1.3.1

- `LORD_DK_DAMAGE_MULTIPLIER` for configurable Death Knight skill damage, with `LORD_DK_BOOST` retained as a compatibility alias for the legacy 3.3x boost

### Changed in 1.3.1

- Death Knight combat damage and the in-game modifier summary now resolve through the normalized multiplier value, and invalid configured multipliers fall back to stock 3.0x damage

## [1.3.0] - 2026-04-20

### Added in 1.3.0

- `LORD_AUTH_RUNTIME_DIR` to separate shared auth users and session storage from per-instance game runtime data

### Changed in 1.3.0

- Web session validation now resolves tokens from shared storage on demand, allowing multiple server instances to honor the same auth session without requiring a restart

## [1.2.0] - 2026-04-19

### Added in 1.2.0

- CLI entrypoints now support `--env-file` so `door.ts`, `play.sh`, `play-door.sh`, and `lordctl.ts` can target instance-specific environment files (for multiple instances of the game)

## [1.1.3] - 2026-04-18

### Fixed in 1.1.3

- Sandtiger's Bar skill changes now grant the extra same-day use point through the correct `levelw`, `levelm`, or `levelt` field, so the purchased bonus is immediately usable
- Olivia encounter progression now uses `olivia_count` consistently, restoring the intended repeat-visit gating
- Class 3 skill training no longer writes to a stray `skillr` field; thief skill gains now correctly update `skillt`

### Changed in 1.1.3

- Player runtime-only fields now follow the original SBBS naming more closely, including `fairy_lore`
- Legacy player records that still use the old Olivia `asshole` key are normalized to `olivia_asshole` on load
- Dead or invented runtime player fields such as `got_dark` and the Sandbar-only `uses*` counters were removed from the active player definition

### Added in 1.1.3

- Regression coverage for Olivia encounter gating, Sandbar skill-change daily-use bonuses, and legacy player-field normalization

## [1.1.2] - 2026-04-18

### Fixed in 1.1.2

- Dark Horse blackjack card rendering no longer emits garbled CP437 border and suit characters after split-hand setup or dealer card reveals
- Blackjack rendering now uses the same Unicode-safe card drawing path for normal deals, split hands, and dealer reveals

### Added in 1.1.2

- Regression coverage for split-hand and dealer-reveal blackjack card rendering

## [1.1.1] - 2026-04-18

### Added in 1.1.1

- Local CLI god mode via `door.ts --local --god` and `./play.sh --god`
- In-game `/` god console for editing player fields, saving records, viewing state, and forcing random values
- Direct event triggers for hard-coded forest events, LDY forest events, inn flows, bank exit events, and DarkCloak Tavern entry points

### Changed in 1.1.1

- Forest event handling now exposes reusable entry points for the god console instead of keeping those paths buried in the main random dispatcher
- Test harness seeded randomness now respects the shared runtime random queue so god-mode tests and live behavior use the same override path

## [1.1.0] - 2026-04-17

### Added in 1.1.0

- Enhanced forest event system with 8 improved events and 2 new unique encounters
  - **Improved events**: Beasts Mirror (mirror reflection duel), Cursed Well (wishing well with gem offerings and duck character), Fey Bargain (fey woman trades with cup game), Guardian Trial (text-input riddle challenge), Hermit Cache (hermit's cabin with search and bluff mechanics), Merchant Gambit (shell game with double-or-nothing), Trickster Sprite (card game with sprite commentary), Twilight Market (magical marketplace with fortune teller and potions)
  - **New events**: Dead Gambler (ghost card shark with backstory and help quest), Chatty Sword (sentient talking sword with personality and pull mechanic)
- Forest event improvements: richer dialog with fantasy flavor, more branching paths, better reward balance, text-input riddles instead of multiple choice
- Updated forest event dispatcher to support 26 random encounters (was 24)

## [1.0.0] - 2026-04-17

### Added in 1.0.0

- Initial public release of LORD.ts as a heavily expanded port, not just a straight carry-over of the SBBS JavaScript version
- Full TypeScript refactor of the original monolithic code into a modular, object-oriented codebase with separate core, storage, door, utility, and IGM packages
- Multiple ways to play and host the game: local CLI play, WebSocket/browser play with RIP support, built-in telnet service, and modern BBS door support for DOOR32.SYS, DOOR.SYS, and DORINFOx.DEF drop files
- New persistence layer centered on SQLite, plus compatibility-oriented DAT storage support and an optional Synchronet lordsrv backend for shared multi-node BBS deployments
- Restored LADY/LDY scripting support using the original LORD 4.08 event files, including a customizable runtime event dispatcher and support for third-party LDY content
- Ported and integrated a large IGM ecosystem with 13 included modules, external-process IGM support, and bundled automation addons such as NPCLord and LrdEvent
- Added modern configuration, deployment, and sysop tooling including environment-based settings, Docker workflows, hot-reload development flow, and the `lordctl` maintenance/admin CLI
- Added an automated Jest-based test suite with unit and integration coverage to support ongoing development and regression protection
