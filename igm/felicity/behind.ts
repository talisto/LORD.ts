/**
 * Felicity's Temple - Behind the Temple
 * Bushes exploration, Arcade with Warriors Revenge, flirting.
 * Original by Lloyd Hannesson (1995-2002), Tech'N Software Group.
 */
import { random } from '@lordts/util/Util';
import type { FelicityBase } from './felicityBase';

/** Behind the temple menu */
export async function behindTemple(ctx: FelicityBase): Promise<void> {
    let done = false;
    do {
        if (ctx.menuRedisplay) {
            await ctx.displayMenu('BEHIND');
            ctx.menuRedisplay = false;
        }
        const ch = await ctx.commandPrompt('Behind the Temple', [
            { key: 'C', label: 'Visit the Arcade' },
            { key: 'E', label: 'Explore the Bushes' },
            { key: 'V', label: 'View Stats' },
            { key: 'L', label: 'Leave' },
            { key: '?', label: 'Menu' },
        ]);
        await ctx.io.sln();
        switch (ch) {
            case 'C':
                ctx.menuRedisplay = true;
                await arcade(ctx);
                break;
            case 'E':
                ctx.menuRedisplay = true;
                await exploreBushes(ctx);
                break;
            case 'V':
                ctx.menuRedisplay = true;
                await ctx.io.showStats();
                break;
            case 'L':
                done = true;
                ctx.menuRedisplay = true;
                break;
            case '?':
                ctx.menuRedisplay = true;
                break;
        }
    } while (!done);
}

/** Explore bushes - once per day, random outcome */
async function exploreBushes(ctx: FelicityBase): Promise<void> {
    if (ctx.rec.explored) {
        ctx.io.sclrscr();
        await ctx.io.sln();
        await ctx.io.lln('`2You search, and search... but find nothing (`8try tomorrow`2)');
        await ctx.io.sln();
        await ctx.pressAKey();
        return;
    }

    ctx.rec.explored = true;
    ctx.rec.put();

    ctx.io.sclrscr();
    await ctx.io.sln();
    await ctx.io.lln('`2You decide to look through the bushes for a bit, cuz hey! Why not?');
    await ctx.io.lln('`2After searching for a while, you see something that catches your eye...');
    await ctx.io.sln();
    await ctx.io.mswait(500);

    const levelStr = Math.min(ctx.player.level, 10);
    const levelDef = Math.min(ctx.player.level * 2, 10);

    const rand = random(6);
    switch (rand) {
        case 0:
            await ctx.io.lln('`2But it turned out to be nothing (unless you count a spider as a treasure)');
            break;
        case 1:
            await ctx.io.lln('`2You find `5Violet\'s`2 Diary! You read all about how she thinks you are the cutest warrior she has seen since the Great `%Pat`2!! You feel good about yourself and get `%5 CHARM!!');
            ctx.charmCheck(5);
            break;
        case 2:
            await ctx.io.lln('`2You find a half eaten apple, not one to waste food you eat it and get...');
            await ctx.io.sln();
            await ctx.io.lln('`%ENERGIZED!! `2You leave Feling like you could take on the world!');
            ctx.player.hp = ctx.player.hp_max * 2;
            if (ctx.player.hp > 32000) ctx.player.hp = 32000;
            break;
        case 3:
            await ctx.io.lln('`2You find a half eaten apple, not one to waste food you eat it and get...');
            await ctx.io.sln();
            await ctx.io.lln('`%STRONGER!!! YOU GAIN ' + levelStr + ' STRENGTH!!!');
            ctx.strCheck(levelStr);
            break;
        case 4:
            await ctx.io.lln('`2You find a half eaten apple, not one to waste food you eat it and get...');
            await ctx.io.sln();
            await ctx.io.lln('`%TOUGHER!!! YOU GAIN ' + levelDef + ' DEFENSE!!!');
            ctx.defCheck(levelDef);
            break;
        case 5:
            await ctx.io.lln('`2You find a cute little rabbit!');
            await ctx.io.lln('`2"`0Aww isn\'t that cute!?`2", you think to yerself, just then the little rabbit jumps up and scratches your face!');
            await ctx.io.lln('`4You LOSE 5 Charm!`2 from the wounds!');
            ctx.charmCheck(-5);
            break;
    }
    ctx.player.put();
    await ctx.io.sln();
    await ctx.pressAKey();
}

/** Arcade menu - gender-specific */
async function arcade(ctx: FelicityBase): Promise<void> {
    const isMale = ctx.player.sex === 'M';
    let done = false;

    do {
        if (ctx.menuRedisplay) {
            await ctx.displayMenu(isMale ? 'ARCADEM' : 'ARCADEF');
            ctx.menuRedisplay = false;
        }
        const ch = await ctx.commandPrompt('In The Arcade', [
            { key: 'P', label: "Play Warrior's Revenge" },
            { key: 'T', label: 'Talk' },
            { key: 'V', label: 'Top Ten List' },
            { key: 'L', label: 'Leave' },
            { key: '?', label: 'Menu' },
        ]);
        await ctx.io.sln();
        switch (ch) {
            case 'P':
                ctx.menuRedisplay = true;
                if (ctx.rec.arcade_played) {
                    await ctx.io.sln();
                    await ctx.io.lln('`2But you\'re all out of Tokens! Try again tomorrow!');
                    await ctx.io.sln();
                    await ctx.pressAKey();
                } else {
                    await warriorsRevenge(ctx);
                }
                break;
            case 'T':
                ctx.menuRedisplay = true;
                if (isMale) {
                    await talkScin(ctx);
                } else {
                    await talkGlibbon(ctx);
                }
                break;
            case 'V':
                ctx.menuRedisplay = true;
                await ctx.showTopTen();
                break;
            case 'L':
                done = true;
                ctx.menuRedisplay = true;
                break;
            case '?':
                ctx.menuRedisplay = true;
                break;
        }
    } while (!done);
}

/** Scin conversation (male players) */
async function talkScin(ctx: FelicityBase): Promise<void> {
    if (ctx.rec.flirted) {
        ctx.io.sclrscr();
        await ctx.io.sln();
        await ctx.io.lln('`2You don\'t feel you should disturb `5Scin `2again. You don\'t want');
        await ctx.io.lln('`2to make her mad at you do you??');
        await ctx.io.sln();
        await ctx.pressAKey();
        return;
    }

    let done = false;
    do {
        if (ctx.menuRedisplay) {
            await ctx.displayMenu('SCIN');
            ctx.menuRedisplay = false;
        }
        const ch = await ctx.commandPrompt('Talking to Scin', [
            { key: 'W', label: "What's the game?" },
            { key: 'R', label: 'Rules of the game' },
            { key: 'I', label: 'The Immortals List' },
            { key: 'O', label: 'Other questions' },
            { key: 'F', label: 'Flirt with Scin' },
            { key: 'L', label: 'Leave' },
            { key: '?', label: 'Menu' },
        ]);
        await ctx.io.sln();
        switch (ch) {
            case 'W':
                ctx.menuRedisplay = true;
                await arcadeInfoWhat(ctx);
                break;
            case 'R':
                ctx.menuRedisplay = true;
                await arcadeInfoRules(ctx);
                break;
            case 'I':
                ctx.menuRedisplay = true;
                await arcadeInfoImmortals(ctx);
                break;
            case 'O':
                ctx.menuRedisplay = true;
                await arcadeInfoOther(ctx);
                break;
            case 'F':
                ctx.menuRedisplay = true;
                await flirtScin(ctx);
                done = true;
                break;
            case 'L':
                done = true;
                ctx.menuRedisplay = true;
                break;
            case '?':
                ctx.menuRedisplay = true;
                break;
        }
    } while (!done);
}

/** Glibbon conversation (female players) */
async function talkGlibbon(ctx: FelicityBase): Promise<void> {
    if (ctx.rec.flirted) {
        ctx.io.sclrscr();
        await ctx.io.sln();
        await ctx.io.lln('`2You don\'t feel you should disturb `5Glibbon `2again. You don\'t want');
        await ctx.io.lln('`2to make him mad at you do you??');
        await ctx.io.sln();
        await ctx.pressAKey();
        return;
    }

    let done = false;
    do {
        if (ctx.menuRedisplay) {
            await ctx.displayMenu('GLIBBON');
            ctx.menuRedisplay = false;
        }
        const ch = await ctx.commandPrompt('Talking to Glibbon', [
            { key: 'W', label: "What's the game?" },
            { key: 'R', label: 'Rules of the game' },
            { key: 'I', label: 'The Immortals List' },
            { key: 'O', label: 'Other questions' },
            { key: 'F', label: 'Flirt with Glibbon' },
            { key: 'L', label: 'Leave' },
            { key: '?', label: 'Menu' },
        ]);
        await ctx.io.sln();
        switch (ch) {
            case 'W':
                ctx.menuRedisplay = true;
                await arcadeInfoWhat(ctx);
                break;
            case 'R':
                ctx.menuRedisplay = true;
                await arcadeInfoRules(ctx);
                break;
            case 'I':
                ctx.menuRedisplay = true;
                await arcadeInfoImmortals(ctx);
                break;
            case 'O':
                ctx.menuRedisplay = true;
                await arcadeInfoOther(ctx);
                break;
            case 'F':
                ctx.menuRedisplay = true;
                await flirtGlibbon(ctx);
                done = true;
                break;
            case 'L':
                done = true;
                ctx.menuRedisplay = true;
                break;
            case '?':
                ctx.menuRedisplay = true;
                break;
        }
    } while (!done);
}

/* ── Arcade info responses (from EXE strings) ── */

async function arcadeInfoWhat(ctx: FelicityBase): Promise<void> {
    ctx.io.sclrscr();
    await ctx.io.sln();
    await ctx.io.lln('`2This my friend is an Arcade! It is filled with all sorts of fun and wonderment, well actually there is only 1 Game. The game is called Warrior\'s Revenge, and it\'s the best thing to happen around these parts since Felicity\'s Storage Room! Basically the story is like this, you want to fight back and hit the Dragon where it hurts the most. What could that be you ask!? Stop the Dragon\'s Control over this land by killing his children! You have twenty shots to slay little baby dragons running in front of the riverbank on their way home to mommy. If you kill one you score 10 points. The 10 players with the most points will be inscribed upon the List of the Immortals!');
    await ctx.io.lln('`2It\'s great, and there is no danger since it\'s all done with a magical illusion. ');
    await ctx.io.sln();
    await ctx.pressAKey();
}

async function arcadeInfoRules(ctx: FelicityBase): Promise<void> {
    ctx.io.sclrscr();
    await ctx.io.sln();
    await ctx.io.lln('`2Playing the game is simple to move left you press `%J`2 to move right you press `%K`2, to fire a shot hit `%SPACE`2, if all this death and mayhem is too much for you just hit `%Q`2 to quit. That is basicly it, so what are you doing standing here!? Go and play!');
    await ctx.io.sln();
    await ctx.pressAKey();
}

async function arcadeInfoImmortals(ctx: FelicityBase): Promise<void> {
    ctx.io.sclrscr();
    await ctx.io.sln();
    await ctx.io.lln('`2The sacred list holds upon it the names of the ten best dragon haters. If you score well you name will be inscribed upon it for all eternity! Or atleast until someone scores better.');
    await ctx.io.sln();
    await ctx.pressAKey();
}

async function arcadeInfoOther(ctx: FelicityBase): Promise<void> {
    ctx.io.sclrscr();
    await ctx.io.sln();
    await ctx.io.lln('`2Are there other games here you say!? Hmmm well all that I can tell you about that is... well that I can\'t tell you! I wouldn\'t want to ruin ALL the fun!');
    await ctx.io.sln();
    await ctx.pressAKey();
}

/* ── Warriors Revenge mini-game ── */

/*
 * Real-time shooting gallery reverse-engineered from FELICITY.EXE.
 *
 * Screen layout (0-based coords):
 *   Left side (cols 0-22):        Right side (cols 24-53):
 *   Row 0: Dragon Attack!!        (empty)
 *   Row 1: -=-=-=-=-=-=-=-        (empty)
 *   Row 2: Keys :                  (empty)
 *   Row 3:  J - Left              Score : 0    Shots : 20
 *   Row 4:  K - Right             ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈  (river)
 *   Row 5:  Space - Shoot!        [dragon moves L→R]
 *   Row 6:  Q - Quit!             [blank blue]
 *   Row 7:                         [blank blue]
 *   Row 8:                         [blank blue]
 *   Row 9:                         ┐                            ┌  (bank top)
 *   Row 10-13:                     │        [play area]         │
 *   Row 14:                        └──-───-─--∙ ·  ∙ --─-───-───┘
 *   Row 16:          You have 20 shots to spear the baby dragon by the river side.
 *   Row 17:                              Go for a Hi-Score!
 *
 *   Dragon (δ) at row 5, cols 24-53, wraps from 54→24.
 *   Crosshair (Ω) at row 13, cols 25-52.
 *   Projectile (°) travels from row 12 up to row 5 (hit) / row 4 (miss).
 *   3 BIOS ticks (165ms) per projectile row, dragon 8 ticks initially.
 *   Score = hit count (1 per hit). Exp = score × 200.
 */

/** Game field constants (0-based coordinates) */
const FIELD_COL = 24;       // leftmost column of game field (decompiled: col 25, 1-based)
const FIELD_WIDTH = 30;     // 30 characters wide

/** Row assignments (0-based) */
const ROW_SCORE = 3;        // score/shots display
const ROW_RIVER = 4;        // river row (≈)
const ROW_DRAGON = 5;       // dragon movement row
const ROW_BANK_TOP = 9;     // ┐...┌ bank top border
const ROW_BANK_BOTTOM = 14; // └──...──┘ bank bottom border
const ROW_CROSSHAIR = 13;   // player crosshair row

/** Entity position bounds (0-based columns) */
const DRAGON_START = 24;    // dragon starts at col 24 (decompiled: 0x19=25 1-based)
const DRAGON_WRAP = 54;     // dragon wraps when reaching col 54 (decompiled: 0x37=55 1-based)
const PLAYER_START = 39;    // player starts at col 39 (decompiled: 0x28=40 1-based)
const PLAYER_MIN = 25;      // leftmost player position (decompiled: 0x1a=26 1-based)
const PLAYER_MAX = 52;      // rightmost player position (decompiled: 0x35=53 1-based)

/** Projectile rows (0-based) */
const PROJ_START_ROW = 12;  // projectile starts here (decompiled: 0x0d=13 1-based)
const PROJ_HIT_ROW = 5;     // hit detection row (= ROW_DRAGON)
const PROJ_MISS_ROW = 4;    // miss row (= ROW_RIVER)

/** Base speed: ms per BIOS tick (18.2 ticks/sec) */
const BIOS_TICK_MS = 55;

/** ANSI color strings matching CGA attributes from decompiled code */
const CLR_FIELD_BG = '\x1b[1;34;44m';     // bright blue on blue (CGA: fg=9,bg=1) - river/blank area
const CLR_BANK = '\x1b[0;36;44m';         // cyan on blue (CGA: fg=3,bg=1) - bank border
const CLR_DRAGON = '\x1b[1;35;44m';       // bright magenta on blue (attr "1D") - dragon
const CLR_CROSSHAIR = '\x1b[1;35;44m';    // bright magenta on blue (attr "1D") - crosshair
const CLR_PROJECTILE = '\x1b[1;36;44m';   // bright cyan on blue (attr "1B") - projectile
const CLR_SCORE = '\x1b[1;32;40m';        // bright green on black (attr "0A") - score/shots labels
const CLR_HIT_BRIGHT = '\x1b[0;37;44m';   // light gray on blue (CGA: fg=7,bg=1) - hit marker flash 1
const CLR_HIT_DIM = '\x1b[1;30;44m';      // dark gray on blue (CGA: fg=8,bg=1) - hit marker flash 2-4
const CLR_MISS = '\x1b[1;34;44m';         // bright blue on blue (CGA: fg=9,bg=1) - miss (river char)
const CLR_ERASE_EDGE = '\x1b[0;30;40m';   // black on black (attr "00") - erase at field edge

/** CP437 characters */
const CHR_RIVER = '\u2248';     // ≈ (CP437 0xF7) - river
const CHR_DRAGON = '\u03B4';    // δ (CP437 0xEB) - baby dragon
const CHR_CROSSHAIR = '\u03A9'; // Ω (CP437 0xEA) - player crosshair
const CHR_PROJECTILE = '\u00B0'; // ° (CP437 0xF8) - projectile

/** Draw the static game field and intro text */
async function drawGameField(ctx: FelicityBase): Promise<void> {
    ctx.io.sclrscr();
    // Explicitly reset background to black. sclrscr() saves/restores session.attr.value,
    // which can carry a blue background from a prior menu screen, causing all backtick-color
    // text to render on blue instead of black.
    ctx.io.background(0);

    // Left side: intro text (printed via lln at cursor position after clear)
    await ctx.io.lln('`%Dragon Attack!!');
    await ctx.io.lln('`2-=-=-=-=-=-=-=-');
    await ctx.io.lln('`$Keys :`2');
    await ctx.io.lln(' `8J `%- `7Left');
    await ctx.io.lln(' `8K `%- `7Right');
    await ctx.io.lln(' `8Space `%- `7Shoot!');
    await ctx.io.lln(' `8Q `%- `7Quit!');

    // Right side: game field drawn with gotoxy

    // River row (row 4, cols 24-53) - bright blue ≈ on blue background
    ctx.io.print(CLR_FIELD_BG);
    ctx.io.gotoxy(FIELD_COL, ROW_RIVER);
    ctx.io.print(CHR_RIVER.repeat(FIELD_WIDTH));

    // Blank rows 5-8 (30 spaces each, blue on blue = invisible)
    for (let row = 5; row <= 8; row++) {
        ctx.io.gotoxy(FIELD_COL, row);
        ctx.io.print(' '.repeat(FIELD_WIDTH));
    }

    // Bank top border (row 9) - cyan on blue
    ctx.io.print(CLR_BANK);
    ctx.io.gotoxy(FIELD_COL, ROW_BANK_TOP);
    ctx.io.print('\u2510' + ' '.repeat(FIELD_WIDTH - 2) + '\u250C');  // ┐...┌

    // Bank sides (rows 10-13) - │ ... │
    for (let row = 10; row <= 13; row++) {
        ctx.io.gotoxy(FIELD_COL, row);
        ctx.io.print('\u2502' + ' '.repeat(FIELD_WIDTH - 2) + '\u2502');  // │...│
    }

    // Bank bottom border (row 14) - decorative
    ctx.io.gotoxy(FIELD_COL, ROW_BANK_BOTTOM);
    ctx.io.print('\u2514\u2500\u2500-\u2500\u2500\u2500-\u2500--\u2219 \u00B7  \u2219 --\u2500-\u2500\u2500\u2500-\u2500\u2500\u2500\u2518');
    // └──-───-─--∙ ·  ∙ --─-───-───┘

    // Description text below field (bright green on BLACK - attr "0A")
    // Explicitly reset to black background since field drawing left blue bg active.
    ctx.io.print('\x1b[0m');              // full SGR reset to default
    ctx.io.background(0);                // sync session.attr to black background
    ctx.io.print(CLR_SCORE);
    ctx.io.gotoxy(0, 15);
    await ctx.io.lln('');  // blank line
    await ctx.io.lln('         You have 20 shots to spear the baby dragon by the river side.');
    await ctx.io.lln('                              Go for a Hi-Score!');

    // Score and Shots labels (row 3, bright green on BLACK - attr "0A")
    ctx.io.gotoxy(PLAYER_MIN, ROW_SCORE);     // col 25
    ctx.io.print(CLR_SCORE + 'Score : ');
    ctx.io.gotoxy(33, ROW_SCORE);             // col 33 for score value
    ctx.io.print('0');
    ctx.io.gotoxy(42, ROW_SCORE);             // col 42 for Shots label
    ctx.io.print('Shots : ');
    ctx.io.gotoxy(51, ROW_SCORE);             // col 51 for shots value
    ctx.io.print('20');
}

/** Update the score value display */
function updateScoreDisplay(ctx: FelicityBase, score: number): void {
    ctx.io.print(CLR_SCORE);
    ctx.io.gotoxy(33, ROW_SCORE);
    ctx.io.print(String(score) + '  ');  // pad to overwrite old digits
}

/** Update the shots value display */
function updateShotsDisplay(ctx: FelicityBase, shots: number): void {
    ctx.io.print(CLR_SCORE);
    ctx.io.gotoxy(51, ROW_SCORE);
    ctx.io.print('  ');  // erase old
    ctx.io.gotoxy(51, ROW_SCORE);
    ctx.io.print(String(shots - 1));  // display shots-1 (original behavior)
}

/** Draw the dragon at a column */
function drawDragon(ctx: FelicityBase, col: number): void {
    ctx.io.gotoxy(col, ROW_DRAGON);
    ctx.io.print(CLR_DRAGON + CHR_DRAGON);
}



async function warriorsRevenge(ctx: FelicityBase): Promise<void> {
    ctx.rec.arcade_played = true;
    ctx.rec.put();

    // Initialize game state
    let gameOver = false;
    let projActive = false;
    let dragonSpeed = 8;       // BIOS ticks between dragon moves (starts at 8 = 440ms)
    let shots = 0x15;          // 21 internally: decompiled original pre-decrements then checks ==0,
                               // so display reads shots-1 and game ends on the 21st shot
    let playerX = PLAYER_START; // col 39 (0-based)
    let score = 0;             // hit count (incremented by 1 per hit)
    let dragonX = DRAGON_START; // col 24 (0-based)

    // Projectile state
    let projX = 0;
    let projY = 0;

    // Draw the game screen (intro text + game field)
    await drawGameField(ctx);

    // Draw initial entities
    drawDragon(ctx, dragonX);
    ctx.io.gotoxy(playerX, ROW_CROSSHAIR);
    ctx.io.print(CLR_CROSSHAIR + CHR_CROSSHAIR);

    // Hide cursor
    ctx.io.print('\x1b[?25l');

    // Timers (using Date.now() to simulate BIOS tick comparisons)
    let dragonTimer = Date.now() + dragonSpeed * BIOS_TICK_MS;
    let projTimer = 0;

    while (!gameOver) {
        // ── Check keyboard (FUN_1000_1713) ──
        if (await ctx.io.waitkey(0)) {
            const ch = (await ctx.io.getkey()).toUpperCase();

            if (ch === 'J') {
                // Move crosshair left
                ctx.io.gotoxy(playerX, ROW_CROSSHAIR);
                ctx.io.print(' ');
                if (playerX > PLAYER_MIN) playerX--;
                ctx.io.gotoxy(playerX, ROW_CROSSHAIR);
                ctx.io.print(CLR_CROSSHAIR + CHR_CROSSHAIR);
            }

            if (ch === 'K') {
                // Move crosshair right
                ctx.io.gotoxy(playerX, ROW_CROSSHAIR);
                ctx.io.print(' ');
                if (playerX < PLAYER_MAX) playerX++;
                ctx.io.gotoxy(playerX, ROW_CROSSHAIR);
                ctx.io.print(CLR_CROSSHAIR + CHR_CROSSHAIR);
            }

            if (ch === ' ' && !projActive) {
                // Fire projectile
                shots--;
                if (shots === 0) {
                    gameOver = true;
                    continue;
                }
                // Set projectile timer: current time + 3 BIOS ticks
                projTimer = Date.now() + 3 * BIOS_TICK_MS;
                projY = PROJ_START_ROW;  // row 12 (0-based)
                projActive = true;

                // Draw projectile at starting position (row 12, col = player col)
                projX = playerX;
                ctx.io.print(CLR_PROJECTILE);
                ctx.io.gotoxy(projX, PROJ_START_ROW);
                ctx.io.print(CLR_PROJECTILE + CHR_PROJECTILE);

                // Update shots display
                updateShotsDisplay(ctx, shots);
                updateScoreDisplay(ctx, score);
            }

            if (ch === 'Q') {
                gameOver = true;
            }
        } else {
            // Small sleep to avoid busy-wait
            await ctx.io.mswait(20);
        }

        // ── Check dragon timer (FUN_1000_1a83) ──
        if (Date.now() >= dragonTimer) {
            // Calculate next dragon timer
            dragonTimer = Date.now() + dragonSpeed * BIOS_TICK_MS;

            // Erase old dragon
            ctx.io.gotoxy(dragonX, ROW_DRAGON);
            ctx.io.print(' ');

            // Move dragon right
            dragonX++;
            if (dragonX === DRAGON_WRAP) {
                // Wrap: new speed, reset position
                dragonSpeed = random(7) + 5;  // 5-11 ticks on wrap
                dragonX = DRAGON_START;
            }

            // Draw dragon at new position
            drawDragon(ctx, dragonX);

            // If just wrapped, clear the edge position
            if (dragonX === DRAGON_START) {
                ctx.io.gotoxy(DRAGON_WRAP, ROW_DRAGON);
                ctx.io.print(CLR_ERASE_EDGE + ' ');
                ctx.io.print(CLR_DRAGON);  // restore dragon color
            }
        }

        // ── Check projectile timer (FUN_1000_1892) ──
        if (projActive && Date.now() >= projTimer) {
            // First tick: capture projectile X from player position
            if (projY === PROJ_START_ROW) {
                projX = playerX;
                ctx.io.gotoxy(projX, PROJ_START_ROW);
                ctx.io.print(CLR_PROJECTILE + CHR_PROJECTILE);
            }

            // Set next timer
            projTimer = Date.now() + 3 * BIOS_TICK_MS;

            // Erase projectile at current position
            ctx.io.gotoxy(projX, projY);
            ctx.io.print(' ');

            // Move projectile up
            projY--;

            // Draw projectile at new position
            ctx.io.gotoxy(projX, projY);
            ctx.io.print(CLR_PROJECTILE + CHR_PROJECTILE);

            // Hit detection: projectile at dragon row and same column
            if (projY === PROJ_HIT_ROW && dragonX === projX) {
                // HIT! Flash animation sequence: *, *, ∙, · with delays
                // Flash 1: * in light gray on blue
                ctx.io.print(CLR_HIT_BRIGHT);
                ctx.io.gotoxy(projX, projY);
                ctx.io.print('*');
                await ctx.io.mswait(200);

                // Flash 2: * in dark gray on blue
                ctx.io.gotoxy(projX, projY);
                ctx.io.print(CLR_HIT_DIM + '*');
                await ctx.io.mswait(200);

                // Flash 3: ∙ in dark gray on blue
                ctx.io.gotoxy(projX, projY);
                ctx.io.print(CLR_HIT_DIM + '\u2219');
                await ctx.io.mswait(200);

                // Flash 4: · in dark gray on blue
                ctx.io.gotoxy(projX, projY);
                ctx.io.print(CLR_HIT_DIM + '\u00B7');
                await ctx.io.mswait(100);

                // Clear hit position
                ctx.io.gotoxy(projX, projY);

                // Increment score and update display
                score++;
                updateScoreDisplay(ctx, score);

                // Check keyboard during animation (original does this)
                if (await ctx.io.waitkey(0)) {
                    const hitCh = (await ctx.io.getkey()).toUpperCase();
                    if (hitCh === 'Q') gameOver = true;
                }

                // After a hit, dragon resets to start and speeds up: 2-4 ticks (110-220ms)
                // vs initial 8 (440ms). On next wrap, re-randomizes to 5-11 (temporary spike).
                dragonSpeed = random(3) + 2;
                dragonX = DRAGON_START;  // reset dragon to start position
            }

            // Miss detection: projectile reached river row
            if (projY === PROJ_MISS_ROW) {
                projActive = false;
                // Draw river char at miss position (≈ in bright blue on blue)
                ctx.io.gotoxy(projX, PROJ_MISS_ROW);
                ctx.io.print(CLR_MISS + CHR_RIVER);
                if (shots === 1) {
                    gameOver = true;
                }
            }
        }
    }

    // Show cursor again
    ctx.io.print('\x1b[?25h');

    // Game over screen (FUN_1000_1c9e)
    ctx.io.sclrscr();
    await ctx.io.lln('`%At Game End...');
    await ctx.io.lln('`2-=-=-=-=-=-=-=-=-=-=-=-=-=-');
    await ctx.io.lln(' ');

    if (score > 0) {
        const rank = ctx.insertScore(ctx.player.name, score);

        await ctx.io.lw('`2Congratulations! You got a total score of: `%');
        await ctx.io.lw(String(score));
        await ctx.io.lln(' `2!!!');

        const expGain = score * 200;
        await ctx.io.lw('`2You get a total of `%');
        await ctx.io.lw(String(expGain));
        await ctx.io.lln(' `2Experience!');

        if (rank > 0) {
            await ctx.io.lln(' ');
            await ctx.io.lw('`2You Ranked at position #`$');
            await ctx.io.lw(String(rank));
            await ctx.io.lln(' `2!!! Congrats!`2');
            await ctx.io.lln('Checkout the `$Top Ten Immortals List`2 to see your name in lights!!');
        }

        await ctx.io.lln(' ');
        await ctx.io.lln('Try again tomorrow for an even higher score!');

        ctx.expCheck(expGain);
    } else {
        await ctx.io.lln('`2Sorry!! You didn\'t hit anything! Better luck tomorrow!');
    }

    ctx.player.put();
    await ctx.io.sln();
    await ctx.pressAKey();
}

/* ── Flirting ── */

/** Flirt with Scin (male players) */
async function flirtScin(ctx: FelicityBase): Promise<void> {
    ctx.rec.flirted = true;
    ctx.rec.put();

    ctx.io.sclrscr();
    await ctx.io.sln();
    await ctx.io.lln('`2 Flirting with Scin.');
    await ctx.io.lln('`2  (`0W`2)ink.');
    await ctx.io.lln('`2  (`0K`2)iss her hand.');
    await ctx.io.lln('`2  (`0S`2)mooch her wetly.');
    await ctx.io.lln('`2  (`0G`2)rab her ass.');
    await ctx.io.lln('`2  (`0F`2)eel her Up.');
    await ctx.io.lln('`2  (`0T`2)ake her into the Backroom.');
    await ctx.io.lw('`2 What do you want to do to impress Scin!? `0: `2');

    ctx.io.emitPrompt('felicity_flirt_scin', [
        { key: 'W', label: 'Wink at her' },
        { key: 'K', label: 'Kiss her hand' },
        { key: 'S', label: 'Smooch her' },
        { key: 'G', label: 'Grab her ass' },
        { key: 'F', label: 'Feel her up' },
        { key: 'T', label: 'Take her to the backroom' },
    ]);
    const menuKeys = ['W', 'K', 'S', 'G', 'F', 'T'];
    let ch: string;
    do {
        ch = (await ctx.io.getkey()).toUpperCase();
    } while (menuKeys.indexOf(ch) === -1);

    await ctx.io.sln();
    await ctx.io.sln();

    // Flirt escalation: each action requires higher charm (1/10/20/30/40/80)
    // and awards proportionally more exp. Failing loses the same amount.
    // The final option also has a 20% random failure even with enough charm.
    switch (ch) {
        case 'W':
            if (ctx.player.cha >= 1) {
                await ctx.io.lln('`2 You wink shyly at the Scin. She smiles and winks back!');
                await ctx.io.lln('`2 Now you\'re getting somewhere!!');
                await ctx.io.lln('`%GAIN 100 EXPERIENCE!');
                ctx.expCheck(100);
            } else {
                await ctx.io.lln('`2 As you wink, Scin does nothing but laugh at you. I guess you\' aren\'t as good looking as you thought!');
                await ctx.io.lln('`@LOSE 100 EXPERIENCE!');
                ctx.expCheck(-100);
            }
            break;
        case 'K':
            if (ctx.player.cha >= 10) {
                await ctx.io.lln('`2 You gently grab Scin\'s hand and bring it to your lips. Then you slowly start to kiss her delicate hand. She blushes and gibbles!');
                await ctx.io.lln('`2 Way to go Tiger!');
                await ctx.io.lln('`%GAIN 300 EXPERIENCE!');
                ctx.expCheck(300);
            } else {
                await ctx.io.lln('`2 As you make the grab for Scin\'s, she just pulls away and tells you to get out. You must really stink or something');
                await ctx.io.lln('`@LOSE 300 EXPERIENCE!');
                ctx.expCheck(-300);
            }
            break;
        case 'S':
            if (ctx.player.cha >= 20) {
                await ctx.io.lln('`2 You genlty grab Scin\'s head and bring her closer. You kiss her soundly on the Lips. She looks elated!! When you are walking away you notice Scin almost faint!');
                await ctx.io.lln('`%GAIN 500 EXPERIENCE!');
                ctx.expCheck(500);
            } else {
                await ctx.io.lln('`2You scream, `0"KISS ME YOU FOOL!!!!". `2And close your eyes. Seconds later you feel Scin\'s wet lips on yours. You notice a wierd smell, but you pay it no attention. You open your eyes and see that Scin is holding a large `0FROG`2!');
                await ctx.io.lln('`@LOSE 500 EXPERIENCE!');
                ctx.expCheck(-500);
            }
            break;
        case 'G':
            if (ctx.player.cha >= 30) {
                await ctx.io.lln('`2 You wait a few seconds for Scin to bend over. You firmly grab her soft bottom. Scin whips around smileing ear to ear!');
                await ctx.io.lln('`%GAIN 700 EXPERIENCE!');
                ctx.expCheck(700);
            } else {
                await ctx.io.lln('`2 You make a grab for Scin\'s ass, but she stops your hand just before you get to her ass. She slaps you and tells you to get out!');
                await ctx.io.lln('`@LOSE 700 EXPERIENCE!');
                ctx.expCheck(-700);
            }
            break;
        case 'F':
            await _flirtScinFeel(ctx);
            break;
        case 'T':
            await _flirtScinBackroom(ctx);
            break;
    }

    ctx.player.put();
    await ctx.io.sln();
    await ctx.pressAKey();
}

async function _flirtScinFeel(ctx: FelicityBase): Promise<void> {
    if (ctx.player.cha >= 40) {
        await ctx.io.lln('`2You pull her Scin closer and begin to fondle her all over!');
        await ctx.io.lln('`2She doesn\'t object!!!');
        await ctx.io.lln('`%GAIN 1200 EXPERIENCE!');
        ctx.expCheck(1200);
    } else {
        await ctx.io.lln('`2You pull Scin closer to you and begin to hug and fondle her.');
        await ctx.io.lw('`2  She seems to enjoy `%');
        await ctx.io.mswait(500);
        await ctx.io.lw('.');
        await ctx.io.mswait(500);
        await ctx.io.lw('.');
        await ctx.io.mswait(500);
        await ctx.io.lw('.');
        await ctx.io.lln('`2 bringing her knee up to meet your crotch!!');
        await ctx.io.lln('`2 You are in too much pain to stand up.');
        await ctx.io.lln('`@LOSE 1200 EXPERIENCE!');
        ctx.expCheck(-1200);
    }
}

async function _flirtScinBackroom(ctx: FelicityBase): Promise<void> {
    if (ctx.player.cha >= 80 && random(100) >= 20) {
        await ctx.io.lln('`2You grab Scin and drag her into the back room. She smiles knowingly.');
        await ctx.io.lln('`2After 20 minutes of banging and hollering you emerge satisfied!');
        await ctx.io.lln('`2Scin just lays there unable to move...');
        await ctx.io.lln('`%GAIN 5000 EXPERIENCE! YOU GOT LAID BY SCIN!!');
        ctx.expCheck(5000);
        ctx.player.laid += 1;
        await ctx.log.logLine('`0* `2' + ctx.player.name + ' `2got laid by `5Scin `2behind the temple!');
    } else {
        await ctx.io.lln('`2 You ask Scin if she\'d like to step into the backroom for a');
        await ctx.io.lln('`2 little fun. She says she has a headache. Oh well maybe next time');
        await ctx.io.lln('`@LOSE 5000 EXPERIENCE!');
        ctx.expCheck(-5000);
    }
}

/** Flirt with Glibbon (female players) */
async function flirtGlibbon(ctx: FelicityBase): Promise<void> {
    ctx.rec.flirted = true;
    ctx.rec.put();

    ctx.io.sclrscr();
    await ctx.io.sln();
    await ctx.io.lln('`2 Flirting with the Glibbon in the Arcade.');
    await ctx.io.lln('`2  (`0W`2)ink.');
    await ctx.io.lln('`2  (`0D`2)rop your hanky.');
    await ctx.io.lln('`2  (`0K`2)iss Glibbon.');
    await ctx.io.lln('`2  (`0M`2)ove his hands to your chest.');
    await ctx.io.lln('`2  (`0F`2)eel him Up.');
    await ctx.io.lln('`2  (`0S`2)educe the Glibbon.');
    await ctx.io.lw('`2 What do you want to do to impress Glibbon? `0: `2');

    ctx.io.emitPrompt('felicity_flirt_glibbon', [
        { key: 'W', label: 'Wink at him' },
        { key: 'D', label: 'Drop your hanky' },
        { key: 'K', label: 'Kiss him' },
        { key: 'M', label: 'Move his hands to your chest' },
        { key: 'F', label: 'Feel him up' },
        { key: 'S', label: 'Seduce him' },
    ]);
    const menuKeys = ['W', 'D', 'K', 'M', 'F', 'S'];
    let ch: string;
    do {
        ch = (await ctx.io.getkey()).toUpperCase();
    } while (menuKeys.indexOf(ch) === -1);

    await ctx.io.sln();
    await ctx.io.sln();

    switch (ch) {
        case 'W':
            if (ctx.player.cha >= 1) {
                await ctx.io.lln('`2 You wink shyly at Glibbon. He smiles back at you. You feel better about yourself now!');
                await ctx.io.lln('`%GAIN 100 EXPERIENCE!');
                ctx.expCheck(100);
            } else {
                await ctx.io.lln('`2 As you wink, Glibbon just shakes his head and laughs!');
                await ctx.io.lln('`2 I guess you have a litte to learn about being Sexy.');
                await ctx.io.lln('`@LOSE 100 EXPERIENCE!');
                ctx.expCheck(-100);
            }
            break;
        case 'D':
            if (ctx.player.cha >= 10) {
                await ctx.io.lln('`2 You remove your Hanky and drop it with an `0"Oops!"`2. Glibbon comes over and picks it up for you. `0"I\'d pick up your hanky anywhere!"`2, he says with a smile.');
                await ctx.io.lln('`%GAIN 300 EXPERIENCE!');
                ctx.expCheck(300);
            } else {
                await ctx.io.lln('`2 You remove your hanky and drop it with an `0"Oops!"`2. Glibbon just looks over and tells you that you dropped your hanky');
                await ctx.io.lln('`@LOSE 300 EXPERIENCE!');
                ctx.expCheck(-300);
            }
            break;
        case 'K':
            if (ctx.player.cha >= 20) {
                await ctx.io.lln('`2 You tell Glibbon to kiss you. He doesn\'t object. After a few minutes the kiss is over. You wonder how such a dirty grungy man can kiss so well.');
                await ctx.io.lln('`%GAIN 500 EXPERIENCE!');
                ctx.expCheck(500);
            } else {
                await ctx.io.lln('`2 You scream, `0"KISS ME YOU FOOL!!!!!"`2. And close your eyes. Seconds later you hear Glibbon rolling around in the dirt laughing himself to death. `0"Geeze! You really know how to make a guy laugh!"');
                await ctx.io.lln('`2 he exclaims.');
                await ctx.io.lln('`@LOSE 500 EXPERIENCE!');
                ctx.expCheck(-500);
            }
            break;
        case 'M':
            if (ctx.player.cha >= 30) {
                await ctx.io.lln('`2 You grab Glibbon by the hands, and bring them up to your chest.');
                await ctx.io.lln('`2 He is unsure at first but then you feel his hands softly squeezing, he is smiling. When you feel like you\'ve had enough you tell him to stop. He doesn\'t seem too happy about stopping!');
                await ctx.io.lln('`%GAIN 700 EXPERIENCE!');
                ctx.expCheck(700);
            } else {
                await ctx.io.lln('`2 You grab Glibbon\'s hands and bring them up to your chest.');
                await ctx.io.lln('`2 He looks at you in disgust and pushes you away!');
                await ctx.io.lln('`@LOSE 700 EXPERIENCE!');
                ctx.expCheck(-700);
            }
            break;
        case 'F':
            if (ctx.player.cha >= 40) {
                await ctx.io.lln('`2 You lower your hand and cup Glibbon\'s warm bulge. He just smiles.');
                await ctx.io.lln('`2 You think that there could be good things to come from this');
                await ctx.io.lln('`%GAIN 1200 EXPERIENCE!');
                ctx.expCheck(1200);
            } else {
                await ctx.io.lln('`2 You lower your hand and begin try to cup Glibbon\'s bulge. He just pushes you away. What could you of been thinking!?');
                await ctx.io.lln('`@LOSE 1200 EXPERIENCE!');
                ctx.expCheck(-1200);
            }
            break;
        case 'S':
            await _flirtGlibbonSeduce(ctx);
            break;
    }

    ctx.player.put();
    await ctx.io.sln();
    await ctx.pressAKey();
}

async function _flirtGlibbonSeduce(ctx: FelicityBase): Promise<void> {
    if (ctx.player.cha >= 80 && random(100) >= 20) {
        await ctx.io.lln('`2 You grab Glibbon and drag him to the ground. He smiles and lets you finish. After 20 minutes of banging and hollering you are finally satisfied. You get up dust off your clothes and leave the ground staring at the sky, smiling ear to ear!');
        await ctx.io.lln('`%GAIN 5000 EXPERIENCE! YOU GOT LAID BY GLIBBON!!');
        ctx.expCheck(5000);
        ctx.player.laid += 1;
        await ctx.log.logLine('`0. `2' + ctx.player.name + ' `2got laid by `0Glibbon `2behind the Temple!!');
    } else {
        await ctx.io.lln('`2 You ask Glibbon if he\'d like to have a little fun he just looks at you and laughs. Ouch!! Bye-bye ego!');
        await ctx.io.lln('`@LOSE 5000 EXPERIENCE!');
        ctx.expCheck(-5000);
    }
}
