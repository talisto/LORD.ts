/**
 * FlowerGarden - Forest sub-scene: Flower Garden event for LORD.
 *
 * A peaceful clearing in the forest where players can leave flowers and
 * short messages for other adventurers to discover.
 */
import { cleanStr, dispLen, spacePad } from '@lordts/util/Util';
import { stripBacktickBackgroundColors } from '@lordts/util/Backtick';
import type IO from '../../io/IO';
import type Player from '../../Player';
import type { FileUtils } from '@lordts/util/FileUtils';
import type { Settings } from '../../types';
import type { IStorage } from '@lordts/storage/IStorage';

class FlowerGarden {

    constructor(
        private io: IO,
        private player: Player,
        private settings: Settings,
        private fileUtils: FileUtils,
        private storage: IStorage,
    ) {}

    async run(): Promise<void> {
        let ich: string;
        let message: string;
        let pname: string;

        await this.io.sln();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.sln("Event In The Forest");
        await this.io.lln(this.io.divider(0, '`0'), 0);
        this.io.foreground(2);
        await this.io.sln("You find a beautiful Garden, and decide to take a little rest...");
        await this.io.sln("You drink from the brook, and smell the flowers.");
        await this.io.sln();
        this.io.foreground(15);
        await this.io.sln("YOU ARE REFRESHED, AND GET ONE MORE FOREST FIGHT FOR TODAY!");
        await this.io.sln();
        this.player.forest_fights += 1;
        if (this.player.forest_fights > 32000) {
            this.player.forest_fights = 32000;
        }
        if (this.player.hp < this.player.hp_max) {
            this.player.hp = this.player.hp_max;
        }
        await this.io.more();
        await this.io.lln("`0You notice the flowers seem to be arranged.");
        // DIFF: This wasn't done originally...
        ich = await this.io.prompt(
            "  Study them? [`%Y`2] : `%",
            [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }],
            'study_flowers',
            { defaultKey: 'Y', leadingBlank: false, trailingBlank: false }
        );
        if (ich === "Y") {
            this.io.sclrscr();
            await this.io.sln();
            await this.io.sln();
            await this.io.lln("`%Understanding Pedals & Dew`2");
            await this.io.sln(this.io.divider());
            if (!this.storage.hasConversation('garden')) {
                this.storage.initConversation('garden', this.fileUtils.runtimeOrData("GARDEN.TXT"));
                if (!this.storage.hasConversation('garden')) {
                    this.storage.setConversation('garden', '  `0Fairy Tisha         `%-"`0Oooh!  I love flowers!  And I love to kiss.`%"');
                }
            }
            const content = this.storage.getConversation('garden');
            if (!this.settings.funky_flowers) {
                await this.io.showBuffer(cleanStr(content), false, false);
            } else if (this.settings.flower_garden_allow_background_colors === false) {
                await this.io.showBuffer(stripBacktickBackgroundColors(content), false, false);
            } else {
                await this.io.showBuffer(content, false, false);
            }
            ich = await this.io.prompt(
                "  `0Arrange them yourself? [`%N`2] : `%",
                [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }],
                'arrange_flowers',
                { defaultKey: 'N', leadingBlank: true, trailingBlank: false }
            );
            if (ich === "Y") {
                await this.io.lln("`2What would you like them to symbolize?");
                this.io.sw("  ");
                message = await this.io.getstr({ x: 0, y: 0, len: 53, c: 1, c1: 15, edit: "" });
                if (this.settings.funky_flowers) {
                    message = message.replace(/``/g, "");
                    if (this.settings.flower_garden_allow_background_colors === false) {
                        message = stripBacktickBackgroundColors(message);
                    }
                } else {
                    message = cleanStr(message);
                }
                await this.io.sln();
                await this.io.sln();
                // DIFF: This was after the length check...
                message = message.replace(/\u0020+$/, "");
                if (dispLen(message) < 3) {
                    await this.io.sln("You decide to arrange later.");
                    await this.io.sln();
                    await this.io.more();
                } else {
                    pname = spacePad(this.player.name, 20);
                    const suffix = this.settings.flower_garden_allow_background_colors === false ? '`%"' : '`r0`%"';
                    // Keep only the 20 most recent flower messages (FIFO)
                    this.storage.appendConversation('garden', [
                        "  `0" + pname + '`%- "`0' + message + suffix,
                    ], 20);
                    await this.io.sln();
                    await this.io.sln();
                }
            }
        }
    }
}

export default FlowerGarden;
