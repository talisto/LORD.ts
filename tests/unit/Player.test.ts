import Player from '@lordts/core/Player';
import { HiddenPlayerPolicy } from '@lordts/core/HiddenPlayerPolicy';
import { Lazy } from '@lordts/util/Lazy';
import type { IStorage } from '@lordts/storage/IStorage';
import type { IBattleCoordinator } from '@lordts/storage/IBattleCoordinator';

describe('Player', () => {
    let mockContext: any;
    let player: any;

    beforeEach(() => {
        mockContext = {
            io: {
                sln: jest.fn(async () => {}),
                lln: jest.fn(async () => {}),
                more: jest.fn(async () => {}),
            },
            console: {},
            user: { name: 'TestUser' },
            fileUtils: {},
            settings: {
                old_skill_points: false,
                death_knight_use_point_divisor: 4,
                thief_use_point_divisor: 4,
            },
            whitelist: [],
            mail: {},
            pfile: null,
            psock: null,
            player: {
                Record: 1,
                name: 'TestUser',
                hp: 100,
                hp_max: 100,
                str: 10,
                def: 10,
                gold: 100,
                bank: 0,
                exp: 0,
                level: 1,
                clss: 1,
                skillw: 0,
                skillm: 0,
                skillt: 0,
                levelw: 0,
                levelm: 0,
                levelt: 0,
                sex: 'M',
                weapon: 'Stick',
                armour: 'Coat',
                dead: false,
                on_now: true
            },
            rip: { enabled: false, lastScreen: '', uiMode: false },
            ver: '5.10 JS',
            state: {},
            game: {},
            storage: {},
        };

        player = new Player(
            mockContext.io,
            mockContext.user,
            mockContext.fileUtils,
            mockContext.settings,
            mockContext.whitelist,
            mockContext.mail,
            mockContext.rip,
            mockContext.ver,
            new Lazy(() => mockContext.state),
            new Lazy(() => mockContext.game),
            new Lazy<IStorage>(() => mockContext.storage),
            new Lazy<IBattleCoordinator>(() => mockContext.coordinator),
        );
        // Set the internal player record so the Proxy can forward property access
        player.player = mockContext.player;
    });

    test('should proxy properties to player record', () => {
        expect(player.name).toBe('TestUser');
        expect(player.hp).toBe(100);
        expect(player.gold).toBe(100);
        expect(player.weapon).toBe('Stick');
    });

    test('should set properties on player record', () => {
        player.hp = 50;
        expect(mockContext.player.hp).toBe(50);

        player.gold = 200;
        expect(mockContext.player.gold).toBe(200);
    });

    test('should access class properties directly', () => {
        expect(player.ver).toBe('5.10 JS');
        expect(player.rip).toBe(false);
        expect(player.user.name).toBe('TestUser');
    });

    test('allPlayers excludes hidden players by default', () => {
        const visiblePlayer = { Record: 0, name: 'Visible' };
        const hiddenPlayer = { Record: 1, name: 'Hidden' };

        mockContext.storage.getPlayerCount = jest.fn().mockReturnValue(2);
        mockContext.storage.getPlayer = jest.fn().mockImplementation((record: number) => {
            if (record === 0) {
                return visiblePlayer;
            }
            return hiddenPlayer;
        });
        mockContext.storage.getConfig = jest.fn().mockReturnValue({
            '1': { hidden_since_day: 10, reason: 'inactive' },
        });

        const visiblePlayers = player.allPlayers();
        const allPlayers = player.allPlayers(true);

        expect(visiblePlayers).toEqual([{ Record: 0, Yours: true, name: 'Visible' }]);
        expect(HiddenPlayerPolicy.isPlayerHidden(mockContext.storage, 1)).toBe(true);
        expect(allPlayers).toEqual([
            { Record: 0, Yours: true, name: 'Visible' },
            { Record: 1, Yours: true, name: 'Hidden' },
        ]);
    });

    describe('checkFields()', () => {
        test('caps hp at 32000', () => {
            player.hp = 50000;
            player.checkFields();
            expect(player.hp).toBe(32000);
        });

        test('sets negative hp to 0', () => {
            player.hp = -100;
            player.checkFields();
            expect(player.hp).toBe(0);
        });

        test('caps hp_max at 32000', () => {
            player.hp_max = 50000;
            player.checkFields();
            expect(player.hp_max).toBe(32000);
        });

        test('sets negative hp_max to 0', () => {
            player.hp_max = -100;
            player.checkFields();
            expect(player.hp_max).toBe(0);
        });

        test('caps gold at 2000000000', () => {
            player.gold = 3000000000;
            player.checkFields();
            expect(player.gold).toBe(2000000000);
        });

        test('sets negative gold to 0', () => {
            player.gold = -500;
            player.checkFields();
            expect(player.gold).toBe(0);
        });

        test('caps bank at 2000000000', () => {
            player.bank = 3000000000;
            player.checkFields();
            expect(player.bank).toBe(2000000000);
        });

        test('sets negative bank to 0', () => {
            player.bank = -1000;
            player.checkFields();
            expect(player.bank).toBe(0);
        });

        test('caps str at 32000', () => {
            player.str = 40000;
            player.checkFields();
            expect(player.str).toBe(32000);
        });

        test('caps def at 32000', () => {
            player.def = 40000;
            player.checkFields();
            expect(player.def).toBe(32000);
        });

        test('caps exp at 2000000000', () => {
            player.exp = 3000000000;
            player.checkFields();
            expect(player.exp).toBe(2000000000);
        });

        test('does nothing when player is null', () => {
            player.player = null;
            expect(() => player.checkFields()).not.toThrow();
        });
    });

    describe('raiseClass()', () => {
        test('uses configured Death Knight divisor for new use points', async () => {
            mockContext.settings.death_knight_use_point_divisor = 6;
            player.skillw = 5;
            player.levelw = 1;
            player.clss = 1;

            await player.raiseClass();

            expect(player.skillw).toBe(6);
            expect(player.levelw).toBe(2);
            expect(mockContext.io.lln.mock.calls.some(([line]: [string]) => line.includes('1`2 uses of Death Knight Skills a day.'))).toBe(true);
        });

        test('legacy old_skill_points alias still gives thief use points every five skills', async () => {
            mockContext.settings.old_skill_points = true;
            player.skillt = 4;
            player.levelt = 1;
            player.clss = 3;

            await player.raiseClass();

            expect(player.skillt).toBe(5);
            expect(player.levelt).toBe(2);
            expect(mockContext.io.lln.mock.calls.some(([line]: [string]) => line.includes('1`2 uses of The Thieving Skills a day.'))).toBe(true);
        });
    });
});
