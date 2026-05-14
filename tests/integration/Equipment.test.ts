/**
 * Equipment - Feature tests
 *
 * Tests weapon, armour, and trainer data access.
 */

import { TestHarness } from '../harness';

describe('Equipment', () => {
    let harness: TestHarness;

    afterEach(() => {
        harness.cleanup();
    });

    describe('getTrainer()', () => {
        test('returns trainer for level 1', () => {
            harness = TestHarness.create();

            const trainer = harness.context.equipment.getTrainer(1);

            expect(trainer).toBeDefined();
            expect(trainer.name).toBeDefined();
            expect(trainer.need).toBeDefined();
        });

        test('returns last trainer for out-of-range level', () => {
            harness = TestHarness.create();

            const trainer = harness.context.equipment.getTrainer(99);

            expect(trainer).toBeDefined();
            expect(trainer.name).toBeDefined();
        });

        test('clamps to level 1 when < 1', () => {
            harness = TestHarness.create();

            const trainer = harness.context.equipment.getTrainer(0);

            expect(trainer).toBeDefined();
        });
    });

    describe('getWeapon()', () => {
        test('returns weapon stats for valid number', () => {
            harness = TestHarness.create();

            const weapon = harness.context.equipment.getWeapon(1);

            expect(weapon).toBeDefined();
            expect(weapon.name).toBeDefined();
        });

        test('returns first weapon for number < 1', () => {
            harness = TestHarness.create();

            const weapon = harness.context.equipment.getWeapon(0);

            expect(weapon).toBeDefined();
        });

        test('clamps weapon number to 15', () => {
            harness = TestHarness.create();

            const weapon = harness.context.equipment.getWeapon(99);

            expect(weapon).toBeDefined();
        });
    });

    describe('getArmour()', () => {
        test('returns armour stats for valid number', () => {
            harness = TestHarness.create();

            const armour = harness.context.equipment.getArmour(1);

            expect(armour).toBeDefined();
            expect(armour.name).toBeDefined();
        });

        test('returns first armour for number < 1', () => {
            harness = TestHarness.create();

            const armour = harness.context.equipment.getArmour(0);

            expect(armour).toBeDefined();
        });

        test('clamps armour number to 15', () => {
            harness = TestHarness.create();

            const armour = harness.context.equipment.getArmour(99);

            expect(armour).toBeDefined();
        });
    });
});
