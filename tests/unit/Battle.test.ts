import Battle from '@lordts/core/Battle';
import { Lazy } from '@lordts/util/Lazy';

describe('Battle', () => {
    let mockContext: any;
    let battle: any;

    beforeEach(() => {
        mockContext = {
            io: {
                print: jest.fn(),
                println: jest.fn(),
                getkey: jest.fn(),
                getstr: jest.fn(),
                clear: jest.fn(),
                center: jest.fn(),
                gotoxy: jest.fn(),
                cleareol: jest.fn(),
                waitkey: jest.fn(),
                inkey: jest.fn(),
                puts: jest.fn(),
                write: jest.fn()
            },
            fileUtils: {},
            settings: {
                beef_up: true
            },
            rankings: {},
            rip: { enabled: false, lastScreen: '', uiMode: false },
            console: {},
            dragon: {},
            player: {
                hp_max: 100,
                str: 100,
                def: 100,
                drag_kills: 0
            },
            state: {},
            log: {},
            mail: {},
            equipment: {},
            dailyMaint: {},
            igm: {},
            onlineBattle: {},
            battle: null
        };

        battle = new Battle(
            mockContext.io,
            mockContext.fileUtils,
            mockContext.settings,
            mockContext.rankings,
            mockContext.rip,
            mockContext.dragon,
            new Lazy(() => battle),
            new Lazy(() => mockContext.player),
            new Lazy(() => mockContext.state),
            new Lazy(() => mockContext.log),
            new Lazy(() => mockContext.mail),
            new Lazy(() => mockContext.equipment),
            new Lazy(() => mockContext.dailyMaint),
            new Lazy(() => mockContext.igm),
            new Lazy(() => mockContext.onlineBattle),
            new Lazy(() => ({} as any)),     // storage
            new Lazy(() => ({} as any)),     // battleCoordinator
            [],
        );
    });

    describe('addHp', () => {
        test('should add hp to player', () => {
            battle.addHp(50);
            expect(mockContext.player.hp_max).toBe(150);
        });

        test('should cap hp at 32000', () => {
            battle.addHp(35000);
            expect(mockContext.player.hp_max).toBe(32000);
        });
    });

    describe('addStr', () => {
        test('should add str to player', () => {
            battle.addStr(50);
            expect(mockContext.player.str).toBe(150);
        });

        test('should cap str at 32000', () => {
            battle.addStr(35000);
            expect(mockContext.player.str).toBe(32000);
        });
    });

    describe('addDef', () => {
        test('should add def to player', () => {
            battle.addDef(50);
            expect(mockContext.player.def).toBe(150);
        });

        test('should cap def at 32000', () => {
            battle.addDef(35000);
            expect(mockContext.player.def).toBe(32000);
        });
    });

    describe('beefUp', () => {
        test('should not beef up if beefUp setting is false', () => {
            mockContext.settings.beef_up = false;
            mockContext.player.drag_kills = 5;
            const monster: any = { hp: 100, str: 100 };

            battle.beefUp(monster);

            expect(monster.hp).toBe(100);
            expect(monster.str).toBe(100);
        });

        test('should not beef up if player has 0 drag_kills', () => {
            mockContext.settings.beef_up = true;
            mockContext.player.drag_kills = 0;
            const monster: any = { hp: 100, str: 100 };

            battle.beefUp(monster);

            expect(monster.hp).toBe(100);
            expect(monster.str).toBe(100);
        });
    });

    describe('scaleDeathKnightAttack', () => {
        test('uses the configured Death Knight multiplier', () => {
            mockContext.settings.death_knight_damage_multiplier = 3.3;

            expect(battle['scaleDeathKnightAttack'](10)).toBe(33);
        });

        test('falls back to the legacy dk_boost alias', () => {
            delete mockContext.settings.death_knight_damage_multiplier;
            mockContext.settings.dk_boost = true;

            expect(battle['scaleDeathKnightAttack'](10)).toBe(33);
        });

        test('uses stock damage when boost is disabled', () => {
            delete mockContext.settings.death_knight_damage_multiplier;
            mockContext.settings.dk_boost = false;

            expect(battle['scaleDeathKnightAttack'](10)).toBe(30);
        });
    });

    describe('battlePromptLines', () => {
        test('returns 8 for basic player', () => {
            mockContext.player.fairy_lore = false;
            mockContext.player.levelw = 0;
            mockContext.player.levelm = 0;
            mockContext.player.levelt = 0;

            const lines = battle.battlePromptLines();
            expect(lines).toBe(8);
        });

        test('returns 9 when player has fairy_lore', () => {
            mockContext.player.fairy_lore = true;
            mockContext.player.levelw = 0;
            mockContext.player.levelm = 0;
            mockContext.player.levelt = 0;

            const lines = battle.battlePromptLines();
            expect(lines).toBe(9);
        });

        test('returns 10 when player has levelw only', () => {
            mockContext.player.fairy_lore = false;
            mockContext.player.levelw = 5;
            mockContext.player.levelm = 0;
            mockContext.player.levelt = 0;

            const lines = battle.battlePromptLines();
            expect(lines).toBe(10); // 8 + 1 (any level) + 1 (levelw)
        });

        test('returns 10 when player has levelm only', () => {
            mockContext.player.fairy_lore = false;
            mockContext.player.levelw = 0;
            mockContext.player.levelm = 3;
            mockContext.player.levelt = 0;

            const lines = battle.battlePromptLines();
            expect(lines).toBe(10); // 8 + 1 (any level) + 1 (levelm)
        });

        test('returns 10 when player has levelt only', () => {
            mockContext.player.fairy_lore = false;
            mockContext.player.levelw = 0;
            mockContext.player.levelm = 0;
            mockContext.player.levelt = 2;

            const lines = battle.battlePromptLines();
            expect(lines).toBe(10); // 8 + 1 (any level) + 1 (levelt)
        });

        test('returns 13 when player has all levels and fairy_lore', () => {
            mockContext.player.fairy_lore = true;
            mockContext.player.levelw = 5;
            mockContext.player.levelm = 3;
            mockContext.player.levelt = 2;

            const lines = battle.battlePromptLines();
            expect(lines).toBe(13); // 8 + 1 (fairy) + 1 (any level) + 1 (w) + 1 (m) + 1 (t)
        });
    });
});
