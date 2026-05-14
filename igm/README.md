# LORD-TS IGM Package

Build **In-Game Modules (IGMs)** for LORD-TS that run as independent child processes, just like the original DOS LORD system.

## Quick Start

### 1. Create your IGM directory

```
igm/myigm/
  myigm.ts    # Your IGM class
    main.ts     # Entry point
```

### 2. Write the IGM class

```typescript
// igm/myigm/myigm.ts
import type { IgmDeps } from '@lordts/igm';

class MyIgm {
    static desc = '`2My `%Awesome `2IGM';

    constructor(private readonly deps: IgmDeps) {}

    async run(): Promise<void> {
        await this.deps.io.lln('`%Welcome to My Awesome IGM!');
        await this.deps.io.lln('`2You have `%' + this.deps.player.gold + '`2 gold.');
        await this.deps.io.more();
    }
}

export default MyIgm;
```

### 3. Write the entry point

```typescript
// igm/myigm/main.ts
import { IgmRunner } from '@lordts/igm';
import MyIgm from './myigm';

IgmRunner.run(MyIgm);
```

### 4. Register in 3rdparty.dat

Add two lines to `runtime/3rdparty.dat` (auto-generated on first startup):

```
igm/myigm/myigm
`2My `%Awesome `2IGM
```

The first line is the extension-free path to your module. The second line is the display name shown in the "Other Places" menu (supports LORD backtick color codes). Comment out both lines with `;` to disable.

Newly discovered IGMs are auto-appended to `3rdparty.dat` on startup. Maintenance-only modules (with `static maintenanceOnly = true`) are listed in a separate section and excluded from the player menu.

## How It Works

When a player selects your IGM from the "Other Places" menu, LORD-TS:

1. Saves the player's current state to the active storage backend
2. Writes an `INFO.<node#>` drop file to `runtime/`
3. Spawns your IGM entry point as a child process
4. Bridges the user's terminal I/O to your process (stdin/stdout)
5. When your process exits, reloads the player from the database

In development, LORD-TS runs `main.ts` through `tsx`; compiled builds run `main.js`. The child receives `<node#> <runtimeDir> [projectRoot]`.

Your IGM runs in its own process with full access to the game storage backend. Player stat changes are persisted automatically on exit.

## Architecture

```
┌──────────────┐     stdin/stdout     ┌──────────────┐
│   LORD-TS    │◄────────────────────►│   Your IGM   │
│  (parent)    │                      │  (child)     │
│              │                      │              │
│ ChildProcess │   INFO.<node#>       │  IgmRunner   │
│   Bridge     │ ──────────────────►  │  IgmContext  │
│              │   runtime dir        │  StdioSession│
└──────────────┘ ◄──────────────────► └──────────────┘
                  Storage backend
```

## IgmDeps Reference

Your IGM constructor receives an `IgmDeps` object with these services:

| Property | Type | Description |
|----------|------|-------------|
| `io` | `IO` | Input/output: `lln()`, `sln()`, `getkey()`, `getstr()`, etc. |
| `player` | `Player` | Current player record: read/write stats, equipment, etc. |
| `state` | `State` | Global game state: current day, dragon HP, etc. |
| `storage` | `IStorage` | Storage backend: custom tables, config, IGM data, mail, log |
| `equipment` | `Equipment` | Weapon/armor lookup and equipping |
| `log` | `Log` | Game log: add entries visible to all players |
| `fileUtils` | `FileUtils` | File reading utilities |
| `settings` | `Settings` | Game configuration (clean mode, etc.) |
| `srcDir` | `string` | Your IGM's own directory: use for IGM-specific data files |
| `dataDir` | `string` | Project read-only data directory (e.g., `monsters.json`, weapon/armor data) |
| `runtimeDir` | `string` | Writable runtime directory for game state |
| `morechk` | `boolean` | Whether "more" prompts are enabled |

## Accessing Data Files

Use `srcDir` for IGM-specific data, and `dataDir` for shared project assets:

```typescript
import * as fs from 'fs';
import * as path from 'path';

// IGM-specific data file (e.g., npc config, quest state)
const configPath = path.join(this.deps.srcDir, 'myigm-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Shared project asset (e.g., monsters.json, weapons.json)
const monstersPath = path.join(this.deps.dataDir, 'monsters.json');
const monsters = JSON.parse(fs.readFileSync(monstersPath, 'utf8'));
```

Both work identically in **development** (source code) and **production** (compiled build). The build system automatically copies IGM assets to `dist/igm/` when you run `npm run build`.

## IO Patterns

### Display text

```typescript
await io.lln('`%Bold white text');     // Line with newline (auto-indented 2 chars)
await io.lw('`2Inline text');           // Inline (no newline)
await io.sln();                         // Blank line
```

### Get input

For player-facing input in the web UI, emit a prompt before `getstr()` or use `prompt()` for menu-style choices:

```typescript
io.emitPrompt('myigm_name', [], 'line');
const name = await io.getstr({ len: 20 });

const choice = await io.prompt(null, [
    { key: 'Y', label: 'Yes' },
    { key: 'N', label: 'No' },
], 'myigm_confirm');
```

### Pause

```typescript
await io.more();
```

## Color Codes

LORD uses backtick color codes:

| Code | Color |
|------|-------|
| `` `0 `` | White |
| `` `1 `` | Bright blue |
| `` `2 `` | Bright cyan |
| `` `3 `` | Bright red |
| `` `4 `` | Red |
| `` `5 `` | Bright white (bold) |
| `` `% `` | Yellow (highlight) |
| `` `) `` | Dark gray |
| `` `! `` | Dark green |
| `` `c `` | Dark cyan |

### Formatting Codes

| Code | Effect |
|------|--------|
| `` `> `` | Center the line on the terminal (must be at start of string) |
| `` `l `` | Full-width divider line |
| `` `c `` | Clear screen + 2 newlines |
| `` `C `` | Clear screen (no newlines) |
| `` `n `` | Newline within text |

## Custom Data Storage

Use `storage` to store IGM-specific data:

```typescript
// Store config
this.deps.storage.setConfig('myigm_config', { maxVisits: 3, reward: 100 });

// Read config
const cfg = this.deps.storage.getConfig('myigm_config') as MyConfig | null;

// Store per-player data using igm_data table
this.deps.storage.setIgmData('myigm', this.deps.player.Record, {
    visits: 1,
    lastDay: this.deps.state.days,
});
const data = this.deps.storage.getIgmData('myigm', this.deps.player.Record) as MyData | null;
```

## Daily Maintenance

If your IGM needs to reset daily data, add a static `runMaint` method:

```typescript
class MyIgm {
    static async runMaint(deps: IgmDeps): Promise<void> {
        // Reset all player visit counts for the new day
        deps.storage.clearIgmData('myigm');
    }

    async run(): Promise<void> { /* ... */ }
}
```

Maintenance runs automatically during LORD-TS's daily reset.

## CLI Commands (lordctl)

IGMs can expose administrative commands to `lordctl`: the sysop CLI tool. Commands are discovered automatically from enabled IGMs in `3rdparty.dat`.

### Defining Commands

Add a static `commands` array and optional `commandGroup` to your IGM class:

```typescript
import type { IgmCommand, IgmCommandContext } from '@lordts/igm';

class MyIgm {
    static desc = '`2My `%IGM';

    // Command group name: used as the top-level command in lordctl.
    // If omitted, defaults to the IGM's directory name.
    static commandGroup = 'myigm';

    // Commands available via: lordctl myigm <command> [args...]
    static commands: IgmCommand[] = [
        {
            name: 'status',
            description: 'Show current status',
            handler: MyIgm.cmdStatus,
        },
        {
            name: 'reset',
            description: 'Reset all data',
            usage: '[--confirm]',
            handler: MyIgm.cmdReset,
        },
    ];

    private static cmdStatus({ storage }: IgmCommandContext): void {
        const data = storage.getConfig('myigm') as Record<string, unknown> | null;
        process.stdout.write('Status: ' + JSON.stringify(data) + '\n');
    }

    private static cmdReset({ storage, args }: IgmCommandContext): void {
        if (args[0] !== '--confirm') {
            process.stderr.write('Pass --confirm to reset.\n');
            process.exit(1);
        }
        storage.deleteConfig('myigm');
        process.stdout.write('Reset complete.\n');
    }

    async run(): Promise<void> { /* ... */ }
}
```

### IgmCommand Interface

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Command name (e.g. `'list'`, `'create'`) |
| `description` | `string` | One-line help text |
| `usage` | `string?` | Argument hint (e.g. `'<name>'`, `'[M\|F]'`) |
| `handler` | `(ctx: IgmCommandContext) => void \| Promise<void>` | The handler function |

### IgmCommandContext

| Property | Type | Description |
|----------|------|-------------|
| `basePath` | `string` | LORD-TS project root directory |
| `storage` | `IStorage` | Open database connection |
| `args` | `string[]` | Remaining CLI arguments after the command name |

### Running Commands

```bash
# List available commands for an IGM
npm run lordctl -- myigm help

# Run a specific command
npm run lordctl -- myigm status
npm run lordctl -- myigm reset --confirm

# See all available commands (built-in + IGM)
npm run lordctl -- help
```

Commands are only available when their IGM is enabled in `3rdparty.dat`.

## INFO Drop File Format

The `INFO.<node#>` file uses the original LORD 4.08 14-line format, followed by an optional LORDTS extension line:

```
Line 1:  Account number (0-based record index)
Line 2:  Graphics setting (3 = ANSI)
Line 3:  RIP graphics (`RIP YES` / `RIP NO`)
Line 4:  Has fairy (`FAIRY YES` / `FAIRY NO`)
Line 5:  Time left in minutes
Line 6:  Player handle
Line 7:  Real first name
Line 8:  Real last name
Line 9:  COM port (0 = local)
Line 10: Caller baud (0 = local)
Line 11: Port baud (0 = local)
Line 12: I/O driver (INTERNAL)
Line 13: Registration status (REGISTERED)
Line 14: Clean mode (CLEAN MODE ON / CLEAN MODE OFF)
Line 15: LORDTS protocol marker and version (`LORDTS 1`)  [optional extension]
```

## Building

IGMs are compiled alongside LORD-TS:

```bash
npm run typecheck         # Type-check
npx eslint igm/myigm/     # Lint
npm test                  # Run tests
```