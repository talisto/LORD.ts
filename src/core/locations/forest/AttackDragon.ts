/**
 * AttackDragon - Forest sub-scene: Enter the Dragon's Lair for LORD.
 *
 * Manages the encounter when a player walks to the dragon's lair from the
 * forest: trembling deterrent for players who have already seen the dragon,
 * and the lead-in sequence that hands off to Battle for the dragon fight.
 */
import type Battle from '../../Battle';
import type IO from '../../io/IO';
import type Player from '../../Player';
import type { UiMode } from '../../types';

class AttackDragon {

    constructor(
        private io: IO,
        private _uiMode: UiMode,
        private player: Player,
        private battle: Battle
    ) {}

    get rip(): boolean { return this._uiMode.mode === 'rip'; }

    // ── Dragon combat ──────────────────────────────────────────────────

    async run(): Promise<void> {
        let ch: string;
        const dragonScreen = async (): Promise<void> => {
            if (this.rip) await this.io.showRip("2DRAGON");
            else await this.io.showTxt("LAIRANS");
        }

        if (this.player.seen_dragon) {
            await this.io.sln();
            await this.io.sln();
            this.io.foreground(2);
            await this.io.lln("You are shaking so badly from your previous encounter, you deem it wise to wait and gather your strength!");
            await this.io.sln();
            await this.io.more();
            return;
        }
        await dragonScreen();
        do {
            do {
                ch = await this.io.commandPrompt('dragon_menu', [
                    { key: 'A', label: 'Attack' },
                    { key: 'R', label: 'Run' },
                    { key: '?', label: 'Menu' },
                ], false);
                this.io.sw(ch);
            } while ("?AR".indexOf(ch) === -1);
            if (!this.rip) await this.io.sln(ch, 0);
            switch (ch) {
                case "?":
                    await dragonScreen();
                    break;
                case "A":
                    await this.battle.fightDragon(false);
                    break;
                case "R":
                    if (this.rip) await this.io.showRip("W1");
                    await this.io.sln();
                    this.io.foreground(2);
                    await this.io.sln("You decide it would be wise to depart from this wicked place.");
                    await this.io.sln();
                    await this.io.more();
                    return;
            }
        } while (!this.player.seen_dragon);
    }
}

export { AttackDragon };
export default AttackDragon;
