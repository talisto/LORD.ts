/**
 * FindLostGold - Forest sub-scene: Find Lost Gold event for LORD.
 *
 * Awards the player a share of the shared forest gold pool accumulated
 * from gold dropped by previous combatants who fled or died.
 */
import { prettyInt } from '@lordts/util/Util';
import type IO from '../../io/IO';
import type Player from '../../Player';
import type { IStorage } from '@lordts/storage/IStorage';

class FindLostGold {

    constructor(
        private io: IO,
        private player: Player,
        private storage: IStorage,
    ) {}

    async run(): Promise<void> {
        let found: number;
        // Claim up to 1/15th of player's gold from the shared forest gold pool (min 100)
        let left: number = parseInt(String(this.player.gold / 15), 10);

        if (left < 100) {
            left = 100;
        }
        found = this.storage.claimForestGold(left);
        if (found < 100) {
            found = 100;
        }
        // Signed 32-bit integer cap from original Pascal code
        if (this.player.gold + found > 2000000000) {
            found = 2000000000 - this.player.gold;
        }
        await this.io.lln("`c`%Event In The Forest`0");
        await this.io.lln("`l", 0);
        await this.io.sln();
        await this.io.lln("`2Fortune smiles, and you find `%" + prettyInt(found) + " `2gold!");
        this.player.gold += found;
        await this.io.sln();
        await this.io.more();
        this.io.sclrscr();
    }
}

export default FindLostGold;
