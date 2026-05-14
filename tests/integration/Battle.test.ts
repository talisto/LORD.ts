/**
 * Battle - Combat system feature tests
 *
 * Tests the core battle loop: attacking, running, special skills,
 * enemy attacks, fairy save, power moves, beefUp, and utility methods.
 */

import { TestHarness, makeDefaultPlayerRecord } from '../harness';
import { BankTransferAmountPolicy } from '@lordts/core/BankTransferAmountPolicy';
import { PlayerIpHistoryPolicy } from '@lordts/core/PlayerIpHistoryPolicy';
import { PvpLootPolicy } from '@lordts/core/PvpLootPolicy';
import { PlayerRelationPolicy } from '@lordts/core/PlayerRelationPolicy';
import type { LoadedPlayerRecord } from '@lordts/core/types';
import { Player_Def } from '@lordts/storage/RecordDefs';

describe('Battle', () => {
    let harness: TestHarness;

    afterEach(() => {
        harness.cleanup();
    });

    // Helper to create a weak enemy for easy testing
    function weakEnemy() {
        return {
            name: '`2Weak Rat',
            str: 1,
            gold: 50,
            weapon: 'Tiny Claw',
            exp: 10,
            hp: 1,
            death: 'The rat squeaks its last.',
        };
    }

    function strongEnemy() {
        return {
            name: '`4Mega Dragon',
            str: 32000,
            gold: 10000,
            weapon: 'Flaming Breath',
            exp: 100000,
            hp: 100000,
            death: 'The dragon falls!',
        };
    }

    describe('fight() - basic combat', () => {
        test('player kills weak enemy with attack', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    hp: 1000,
                    hp_max: 1000,
                    str: 32000,
                    def: 10000,
                    level: 5,
                },
            });

            const enemy = weakEnemy();
            // Queue A for attack
            harness.queueKeys('A');
            await harness.context.battle.fight(enemy, false, false);

            expect(enemy.hp).toBeLessThan(1);
            expect(harness.player!.dead).toBe(false);
        });

        test('player dies to strong enemy', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    hp: 1,
                    hp_max: 1,
                    str: 1,
                    def: 0,
                    level: 1,
                },
            });

            const enemy = strongEnemy();
            // Queue attacks - player will die on first enemy counter
            const keys: string[] = [];
            for (let i = 0; i < 10; i++) keys.push('A');
            harness.queueKeys(...keys);
            await harness.context.battle.fight(enemy, false, false);

            expect(harness.player!.dead).toBe(true);
        });

        test('Enter defaults to Attack', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    hp: 1000,
                    hp_max: 1000,
                    str: 32000,
                    def: 10000,
                },
            });

            const enemy = weakEnemy();
            harness.queueKeys('\r');
            await harness.context.battle.fight(enemy, false, false);

            expect(enemy.hp).toBeLessThan(1);
        });

        test('S shows stats during fight', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    hp: 1000,
                    hp_max: 1000,
                    str: 32000,
                    def: 10000,
                },
            });

            const enemy = weakEnemy();
            harness.queueKeys('S', 'A');
            await harness.context.battle.fight(enemy, false, false);

            expect(harness.context.io.showStats).toHaveBeenCalled();
        });

        test('R allows running from combat', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    hp: 1000,
                    hp_max: 1000,
                    str: 100,
                    def: 100,
                    level: 1,
                },
            });

            // Seed random to succeed at running
            harness.rng.queueRandomValues([
                // fight() initial surprise check: random(99)+1
                0.5,
                // do nothing (first prompt A or R)
                // tryRunning: random(4)
                0.0,  // value 0 → successful run
            ]);

            const enemy = { ...strongEnemy(), hp: 1000 };
            harness.queueKeys('R');
            await harness.context.battle.fight(enemy, false, false);

            // Player should have run away (not dead, enemy still alive)
            expect(harness.player!.dead).toBe(false);
        });

        test('Q in combat says "try running"', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    hp: 1000,
                    hp_max: 1000,
                    str: 32000,
                    def: 10000,
                },
            });

            const enemy = weakEnemy();
            harness.queueKeys('Q', 'A');
            await harness.context.battle.fight(enemy, false, false);

            expect(harness.outputContains('Try running')).toBe(true);
        });
    });

    describe('enemyAttack()', () => {
        test('enemy miss when attack < player defense', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    hp: 1000,
                    hp_max: 1000,
                    str: 100,
                    def: 50000,
                },
            });

            const weakAttacker = {
                name: 'Weakling',
                str: 1,
                gold: 0,
                weapon: 'Twig',
                exp: 0,
                hp: 100,
                death: 'dies',
            };

            await harness.context.battle.enemyAttack(weakAttacker);

            // With str=1 and player def=50000, attack should miss
            expect(harness.outputContains('misses')).toBe(true);
        });

        test('fairy prevents death', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    hp: 1,
                    hp_max: 100,
                    str: 1,
                    def: 0,
                    has_fairy: true,
                },
            });

            const killer = {
                name: 'Assassin',
                str: 1000,
                gold: 0,
                weapon: 'Dagger',
                exp: 0,
                hp: 100,
                death: 'dies',
            };

            // Seed to avoid power move
            harness.rng.queueRandomValues([0.5]);  // random(30) ≠ 1

            await harness.context.battle.enemyAttack(killer);

            expect(harness.player!.dead).toBe(false);
            expect(harness.player!.has_fairy).toBe(false);
            expect(harness.player!.hp).toBe(harness.player!.hp_max);
            expect(harness.outputContains('BUZZING')).toBe(true);
        });

        test('forest enemies do not use power moves when the setting is disabled', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    hp: 100,
                    hp_max: 100,
                    str: 1,
                    def: 0,
                    horse: false,
                    kids: 0,
                },
            });
            harness.context.settings.forest_monster_power_moves = false;

            harness.rng.queueRandomValues([0, 1]);

            const forestEnemy = {
                name: 'Wolf',
                str: 10,
                gold: 0,
                weapon: 'Fangs',
                exp: 0,
                hp: 100,
                death: 'dies',
                is_forest: true,
            };

            await harness.context.battle.enemyAttack(forestEnemy);

            expect(harness.outputContains('Executes A Power Move')).toBe(false);
            expect(harness.player!.hp).toBe(95);
        });

        test('non-forest enemies still use power moves when the setting is disabled', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    hp: 100,
                    hp_max: 100,
                    str: 1,
                    def: 0,
                    horse: false,
                    kids: 0,
                },
            });
            harness.context.settings.forest_monster_power_moves = false;

            harness.rng.queueRandomValues([0, 1]);

            const enemy = {
                name: 'Gladiator',
                str: 10,
                gold: 0,
                weapon: 'Blade',
                exp: 0,
                hp: 100,
                death: 'dies',
            };

            await harness.context.battle.enemyAttack(enemy);

            expect(harness.outputContains('Executes A Power Move')).toBe(true);
            expect(harness.player!.hp).toBe(93);
        });
    });

    describe('beefUp()', () => {
        test('does not beef up when setting is off', () => {
            harness = TestHarness.create({
                playerOverrides: { drag_kills: 5 },
            });
            harness.context.settings.beef_up = false;

            const enemy = weakEnemy();
            const origHp = enemy.hp;
            harness.context.battle.beefUp(enemy);

            expect(enemy.hp).toBe(origHp);
        });

        test('does not beef up when no dragon kills', () => {
            harness = TestHarness.create({
                playerOverrides: { drag_kills: 0 },
            });
            harness.context.settings.beef_up = true;

            const enemy = weakEnemy();
            const origHp = enemy.hp;
            harness.context.battle.beefUp(enemy);

            expect(enemy.hp).toBe(origHp);
        });
    });

    describe('battlePromptLines()', () => {
        test('returns base of 8 lines', () => {
            harness = TestHarness.create({
                playerOverrides: { levelw: 0, levelm: 0, levelt: 0 },
            });

            expect(harness.context.battle.battlePromptLines()).toBe(8);
        });

        test('adds lines for skills', () => {
            harness = TestHarness.create({
                playerOverrides: { levelw: 3, levelm: 2, levelt: 1 },
            });

            // 8 base + 1 (spacer) + 3 (skill lines) = 12
            expect(harness.context.battle.battlePromptLines()).toBe(12);
        });

        test('adds line for fairy lore', () => {
            harness = TestHarness.create({
                playerOverrides: { fairy_lore: true, levelw: 0, levelm: 0, levelt: 0 },
            });

            expect(harness.context.battle.battlePromptLines()).toBe(9);
        });
    });

    describe('attackPlayer() - battle lock cleanup', () => {
        test('second local attacker is blocked when the in-battle target setting is enabled', () => {
            harness = TestHarness.create({
                playerOverrides: {
                    Record: 0,
                },
            });

            const ctx = harness.context;
            ctx.settings.prevent_pvp_target_if_already_in_battle = true;

            expect(ctx.battleCoordinator.startBattle(0, 1, true)).toEqual({ kind: 'ok' });
            expect(ctx.battleCoordinator.startBattle(2, 1, true)).toEqual({
                kind: 'in-battle',
                attackerRecord: 0,
            });
        });

        test('cannot attack a player who has blocked you', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    Record: 0,
                    hp: 1000,
                    hp_max: 1000,
                    str: 32000,
                    def: 10000,
                    pvp_fights: 3,
                    level: 5,
                },
            });

            const ctx = harness.context;
            ctx.settings.player_blocking = true;
            const opponent = makeDefaultPlayerRecord({
                name: 'Bebum',
                Record: 1,
                on_now: false,
                hp: 500,
                hp_max: 500,
                str: 5,
                def: 0,
                level: 1,
            });
            PlayerRelationPolicy.setPlayerBlocked(ctx.storage, 1, 0, true);

            harness.queueKeys('\r');
            await ctx.battle.attackPlayer(opponent, false);

            expect(harness.outputContains('wants nothing to do with you')).toBe(true);
            expect(ctx.storage.hasBattleLock(1)).toBe(false);
            expect(harness.player!.pvp_fights).toBe(3);
        });

        test('denies PvP against players who recently shared an IP when configured', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    Record: 10,
                    hp: 1000,
                    hp_max: 1000,
                    str: 32000,
                    def: 10000,
                    pvp_fights: 3,
                    level: 5,
                    time: 42,
                },
            });

            const ctx = harness.context;
            ctx.settings.shared_ip_restriction_days = 7;
            ctx.settings.shared_ip_block_pvp = true;

            const opponent = makeDefaultPlayerRecord({
                name: 'Bebum',
                Record: 1,
                on_now: false,
                hp: 500,
                hp_max: 500,
                str: 5,
                def: 0,
                level: 1,
            });
            ctx.player!.playerGet = jest.fn().mockImplementation((rec: number) => {
                if (rec === 10) return ctx.player!.player;
                if (rec === 1) return opponent;
                return null;
            });
            PlayerIpHistoryPolicy.recordPlayerIp(ctx.storage, 42, 10, '203.0.113.10', ctx.settings);
            PlayerIpHistoryPolicy.recordPlayerIp(ctx.storage, 42, 1, '203.0.113.10', ctx.settings);

            harness.queueKeys('\r');
            await ctx.battle.attackPlayer(opponent, false);

            expect(harness.outputContains('recently shared your address')).toBe(true);
            expect(ctx.storage.hasBattleLock(1)).toBe(false);
            expect(harness.player!.pvp_fights).toBe(3);
        });

        test('clears battle lock on target when attacker runs away (local game)', async () => {
            // Regression: when psock==null and the attacker runs away from an
            // offline PvP fight, clearBattleLock was never called, leaving the
            // target trapped in the login wait loop indefinitely.
            harness = TestHarness.create({
                playerOverrides: {
                    Record: 0,
                    hp: 1000,
                    hp_max: 1000,
                    str: 32000,
                    def: 10000,
                    pvp_fights: 3,
                    level: 5,
                },
            });

            const ctx = harness.context;

            // Offline opponent (on_now=false so we don't branch into online battle)
            const opponent = makeDefaultPlayerRecord({
                name: 'Bebum',
                Record: 1,
                on_now: false,
                hp: 500,
                hp_max: 500,
                str: 5,
                def: 0,
                level: 1,
            });
            ctx.player!.playerGet = jest.fn().mockImplementation((rec: number) => {
                if (rec === 0) return ctx.player!.player;
                if (rec === 1) return opponent;
                return null;
            });

            // Seed: suppress enemy surprise + ensure run succeeds
            harness.rng.queueRandomValues([
                0.5,  // random(99)+1 → 50, not >90 → no surprise
                0.0,  // random(9) in tryRunning → 0 ≠ 1 → run succeeds
            ]);

            // Player presses R to run away
            harness.queueKeys('R');

            // attackPlayer() sets the lock itself, then fight() runs, then the fix clears it
            await ctx.battle.attackPlayer(opponent, false);

            // After running away the battle lock on the opponent must be cleared
            expect(ctx.storage.hasBattleLock(1)).toBe(false);
        });

        test('clears battle lock on target when attacker wins (local game)', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    Record: 0,
                    hp: 1000,
                    hp_max: 1000,
                    str: 32000,
                    def: 10000,
                    pvp_fights: 3,
                    level: 5,
                },
            });

            const ctx = harness.context;
            const opponent = makeDefaultPlayerRecord({
                name: 'Bebum',
                Record: 1,
                on_now: false,
                hp: 1,
                hp_max: 1,
                str: 1,
                def: 0,
                level: 1,
            });
            ctx.player!.playerGet = jest.fn().mockImplementation((rec: number) => {
                if (rec === 0) return ctx.player!.player;
                if (rec === 1) return opponent;
                return null;
            });

            // Seed: suppress surprise so fight is predictable
            harness.rng.queueRandomValues([0.5]);

            // Player presses A to attack - one hit kills the hp=1 opponent
            harness.queueKeys('A');

            await ctx.battle.attackPlayer(opponent, false);

            // After killing the opponent the lock must also be gone
            expect(ctx.storage.hasBattleLock(1)).toBe(false);
        });

        test('caps attacker gold reward while the victim still loses all gold', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    Record: 10,
                    gold: 100,
                    hp: 1000,
                    hp_max: 1000,
                    str: 100,
                    def: 10000,
                    pvp_fights: 3,
                    level: 3,
                },
            });

            const ctx = harness.context;
            ctx.settings.pvp_gold_loot_cap_factor = 1;

            const playerFile = ctx.storage.create('players', Player_Def);
            const opponentRecord = playerFile.new();
            if (!opponentRecord) {
                throw new Error('Failed to create offline PvP opponent record');
            }

            opponentRecord.name = 'Bebum';
            opponentRecord.real_name = 'Bebum';
            opponentRecord.on_now = false;
            opponentRecord.hp = 1;
            opponentRecord.hp_max = 1;
            opponentRecord.str = 1;
            opponentRecord.def = 0;
            opponentRecord.gold = 100000;
            opponentRecord.exp = 100;
            opponentRecord.level = 1;
            opponentRecord.sex = 'M';
            opponentRecord.put();

            const opponent = playerFile.get(opponentRecord.Record) as unknown as LoadedPlayerRecord;

            ctx.player!.playerGet = jest.fn().mockImplementation((rec: number) => {
                if (rec === ctx.player!.Record) {
                    return ctx.player!.player;
                }
                if (rec === opponent.Record) {
                    return playerFile.get(opponent.Record);
                }
                return null;
            });

            const expectedReward = PvpLootPolicy.resolveGoldReward(
                opponent.gold,
                harness.player!.level,
                ctx.monsterStats,
                ctx.settings,
            );

            harness.rng.queueRandomValues([0, 0, 0]);
            harness.queueKeys('A');

            await ctx.battle.attackPlayer(opponent, false);

            const storedOpponent = playerFile.get(opponent.Record) as unknown as LoadedPlayerRecord | null;

            expect(harness.player!.gold).toBe(100 + expectedReward);
            expect(storedOpponent?.gold).toBe(0);
            expect(storedOpponent?.dead).toBe(true);
        });

        test('caps attacker gem reward while the victim still loses half gems', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    Record: 10,
                    hp: 1000,
                    hp_max: 1000,
                    str: 100,
                    def: 10000,
                    gem: 0,
                    pvp_fights: 3,
                    level: 3,
                },
            });

            const ctx = harness.context;
            ctx.settings.pvp_gem_loot_cap = 3;

            const playerFile = ctx.storage.create('players', Player_Def);
            const opponentRecord = playerFile.new();
            if (!opponentRecord) {
                throw new Error('Failed to create offline PvP gem opponent record');
            }

            opponentRecord.name = 'Gemlord';
            opponentRecord.real_name = 'Gemlord';
            opponentRecord.on_now = false;
            opponentRecord.hp = 1;
            opponentRecord.hp_max = 1;
            opponentRecord.str = 1;
            opponentRecord.def = 0;
            opponentRecord.gold = 500;
            opponentRecord.gem = 10;
            opponentRecord.exp = 100;
            opponentRecord.level = 1;
            opponentRecord.sex = 'M';
            opponentRecord.put();

            const opponent = playerFile.get(opponentRecord.Record) as unknown as LoadedPlayerRecord;

            ctx.player!.playerGet = jest.fn().mockImplementation((rec: number) => {
                if (rec === ctx.player!.Record) {
                    return ctx.player!.player;
                }
                if (rec === opponent.Record) {
                    return playerFile.get(opponent.Record) as unknown as LoadedPlayerRecord | null;
                }
                return null;
            });

            const expectedReward = PvpLootPolicy.resolveGemReward(opponent.gem, ctx.settings);

            harness.rng.queueRandomValues([0, 0, 0]);
            harness.queueKeys('A');

            await ctx.battle.attackPlayer(opponent, false);

            const storedOpponent = playerFile.get(opponent.Record) as unknown as LoadedPlayerRecord | null;

            expect(harness.player!.gem).toBe(expectedReward);
            expect(storedOpponent?.gem).toBe(5);
            expect(storedOpponent?.dead).toBe(true);
        });
    });

    describe('special skills in combat', () => {
        test('D with no death knight skill says "don\'t know any"', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    hp: 1000,
                    hp_max: 1000,
                    str: 32000,
                    def: 10000,
                    levelw: 0,
                    skillw: 0,
                },
            });

            const enemy = weakEnemy();
            harness.queueKeys('D', 'A');
            await harness.context.battle.fight(enemy, false, false);

            expect(harness.outputContains("don't know")).toBe(true);
        });

        test('T with no thief skill says "don\'t know any"', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    hp: 1000,
                    hp_max: 1000,
                    str: 32000,
                    def: 10000,
                    levelt: 0,
                    skillt: 0,
                },
            });

            const enemy = weakEnemy();
            harness.queueKeys('T', 'A');
            await harness.context.battle.fight(enemy, false, false);

            expect(harness.outputContains("don't know")).toBe(true);
        });

        test('M with no mystical skill says "don\'t know any"', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    hp: 1000,
                    hp_max: 1000,
                    str: 32000,
                    def: 10000,
                    levelm: 0,
                    skillm: 0,
                },
            });

            const enemy = weakEnemy();
            harness.queueKeys('M', 'A');
            await harness.context.battle.fight(enemy, false, false);

            expect(harness.outputContains("don't know")).toBe(true);
        });

        test('D with used skill says "need rest"', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    hp: 1000,
                    hp_max: 1000,
                    str: 32000,
                    def: 10000,
                    levelw: 0,
                    skillw: 5,
                },
            });

            const enemy = weakEnemy();
            harness.queueKeys('D', 'A');
            await harness.context.battle.fight(enemy, false, false);

            expect(harness.outputContains('rest')).toBe(true);
        });

        test('H without fairy lore says "don\'t make house calls"', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    hp: 1000,
                    hp_max: 1000,
                    str: 32000,
                    def: 10000,
                },
            });

            const enemy = weakEnemy();
            harness.queueKeys('H', 'A');
            await harness.context.battle.fight(enemy, false, false);

            expect(harness.outputContains('house calls')).toBe(true);
        });

        test('H with fairy lore heals player', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    hp: 10,
                    hp_max: 1000,
                    str: 32000,
                    def: 10000,
                    fairy_lore: true,
                },
            });

            const enemy = weakEnemy();
            harness.queueKeys('H', 'Y', 'A');
            await harness.context.battle.fight(enemy, false, false);

            expect(harness.player!.hp).toBe(1000);
            expect(harness.player!.fairy_lore).toBe(false);
        });
    });

    describe('slaughterOthers', () => {
        test('writing in the dirt succeeds when the player is the latest hero', async () => {
            harness = TestHarness.create({ username: 'Master Turgon' });

            harness.queueKeys('W', '', 'Q');

            await expect(harness.context.battle.slaughterOthers()).resolves.toBeUndefined();

            const dirtContent = harness.context.storage.getConversation('dirt');
            expect(dirtContent.length).toBeGreaterThan(0);
        });
    });

    describe('addHp / addStr / addDef', () => {
        test('addHp increases hp_max', () => {
            harness = TestHarness.create({ playerOverrides: { hp_max: 100 } });
            harness.context.battle.addHp(50);
            expect(harness.player!.hp_max).toBe(150);
        });

        test('addHp caps at 32000', () => {
            harness = TestHarness.create({ playerOverrides: { hp_max: 31990 } });
            harness.context.battle.addHp(100);
            expect(harness.player!.hp_max).toBe(32000);
        });

        test('addStr increases str', () => {
            harness = TestHarness.create({ playerOverrides: { str: 100 } });
            harness.context.battle.addStr(75);
            expect(harness.player!.str).toBe(175);
        });

        test('addStr caps at 32000', () => {
            harness = TestHarness.create({ playerOverrides: { str: 31999 } });
            harness.context.battle.addStr(500);
            expect(harness.player!.str).toBe(32000);
        });

        test('addDef increases def', () => {
            harness = TestHarness.create({ playerOverrides: { def: 200 } });
            harness.context.battle.addDef(300);
            expect(harness.player!.def).toBe(500);
        });

        test('addDef caps at 32000', () => {
            harness = TestHarness.create({ playerOverrides: { def: 32000 } });
            harness.context.battle.addDef(1);
            expect(harness.player!.def).toBe(32000);
        });
    });

    describe('horse intercepts enemy attack', () => {
        test('horse kills non-dragon enemy when random(25)===10', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    hp: 500,
                    hp_max: 500,
                    str: 1,
                    def: 0,
                    horse: true,
                    kids: 0,
                },
            });

            // queueRandomValues supplies exact return values for Util.random():
            //   random(1) = 0  → atk calc (str=2, str/2=1)
            //   random(30) = 15 → power move check (not 1, no power move)
            //   random(25) = 10 → horse check triggers!
            // Horse non-dragon path then shows 5 moreNoMail prompts.
            harness.rng.queueRandomValues([0, 15, 10]);
            harness.queueKeys('\r', '\r', '\r', '\r', '\r');  // 5 moreNoMail calls

            const enemy = {
                name: 'Bandit',
                str: 2,
                gold: 50,
                weapon: 'Club',
                exp: 10,
                hp: 100,
                death: 'dies',
            };

            await harness.context.battle.enemyAttack(enemy);

            expect(harness.player!.horse).toBe(false);
            expect(enemy.hp).toBe(0);
            expect(harness.outputContains('VAPORIZED')).toBe(true);
        });

        test('horse sacrifice against dragon keeps stock behavior when damage is zero', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    hp: 500,
                    hp_max: 500,
                    str: 1,
                    def: 0,
                    horse: true,
                    kids: 0,
                },
            });
            harness.context.settings.dragon_horse_sacrifice_damage = 0;

            harness.rng.queueRandomValues([0, 0, 15, 10]);
            harness.queueKeys('\r');

            const dragon = {
                name: 'Dragon',
                str: 2,
                gold: 0,
                weapon: 'Claws',
                exp: 1000,
                hp: 20000,
                death: 'The dragon falls!',
                is_dragon: true,
            };

            await harness.context.battle.enemyAttack(dragon);

            expect(harness.player!.horse).toBe(false);
            expect(dragon.hp).toBe(20000);
        });

        test('horse sacrifice against dragon applies configured damage', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    hp: 500,
                    hp_max: 500,
                    str: 1,
                    def: 0,
                    horse: true,
                    kids: 0,
                },
            });
            harness.context.settings.dragon_horse_sacrifice_damage = 7500;

            harness.rng.queueRandomValues([0, 0, 15, 10]);
            harness.queueKeys('\r');

            const dragon = {
                name: 'Dragon',
                str: 2,
                gold: 0,
                weapon: 'Claws',
                exp: 1000,
                hp: 20000,
                death: 'The dragon falls!',
                is_dragon: true,
            };

            await harness.context.battle.enemyAttack(dragon);

            expect(harness.player!.horse).toBe(false);
            expect(dragon.hp).toBe(12500);
        });
    });

    describe('fightDragon()', () => {
        test('dragon kills can reset the daily bank transfer amount when enabled', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    Record: 0,
                    time: 1,
                    level: 12,
                    clss: 1,
                    sex: 'M',
                    drag_kills: 0,
                    kids: 0,
                },
            });

            const ctx = harness.context;
            ctx.settings.daily_bank_transfer_gold_cap_reset_on_dragon_kill = true;
            ctx.settings.win_deeds = 0;
            BankTransferAmountPolicy.recordTransfer(ctx.storage, 1, 0, 900);

            ctx.io.more = jest.fn().mockResolvedValue(undefined);
            ctx.io.moreNoMail = jest.fn().mockResolvedValue(undefined);
            jest.spyOn(ctx.battle, 'fight').mockImplementation(async (op) => {
                op.hp = 0;
                return '';
            });

            await ctx.battle.fightDragon(false);

            expect(BankTransferAmountPolicy.getTransferredAmount(ctx.storage, 1, 0)).toBe(0);
        });
    });

    describe('kids defend player', () => {
        test('child defends when kids > 5 and random triggers', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    hp: 500,
                    hp_max: 500,
                    str: 1,
                    def: 0,
                    kids: 8,
                    horse: false,
                },
            });

            // queueRandomValues supplies exact return values for Util.random():
            //   random(1) = 0  → atk calc (str=2, str/2=1, random(1) always 0)
            //   random(30) = 15 → power move check (not 1)
            //   random(100) = 1 → kids check: 1+1=2 < kids-5=3 ✓ child defends
            //   random(2) = 1  → son (not daughter)
            // Kids block has 4 moreNoMail prompts
            harness.rng.queueRandomValues([0, 15, 1, 1]);
            harness.queueKeys('\r', '\r', '\r', '\r');  // 4 moreNoMail calls

            const enemy = {
                name: 'Goblin',
                str: 2,
                gold: 10,
                weapon: 'Dagger',
                exp: 5,
                hp: 100,
                death: 'dies',
            };

            const kidsBefore = harness.player!.kids;
            await harness.context.battle.enemyAttack(enemy);

            expect(harness.player!.kids).toBe(kidsBefore - 1);
            expect(harness.outputContains('son')).toBe(true);
        });
    });
});
