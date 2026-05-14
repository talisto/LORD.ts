/**
 * Rankings - Player leaderboard display for LORD.
 *
 * Renders the top-player ranking list sorted by experience, presented to
 * players at the Town Square. Also provides the utility used by the sysop
 * admin view and the web leaderboard API.
 */

import { prettyInt, spacePad } from '@lordts/util/Util';
import Lazy from '@lordts/util/Lazy';
import type IO from './io/IO';
import type Player from './Player';
import type { LoadedPlayerRecord, UiMode } from './types';

class Rankings {
    constructor(
        private io: IO,
        private _uiMode: UiMode,
        private ver: string,
        private _player: Lazy<Player>,
    ) {}

    // ── Lazy-resolved dependencies ───────────────────────────────────────

    get rip(): boolean { return this._uiMode.mode === 'rip'; }
    get modern(): boolean { return this._uiMode.mode === 'modern'; }

    get player(): Player {
        return this._player.value;
    }

    // ── Rankings display ─────────────────────────────────────────────

    generateRankings(all: boolean = false, on: boolean = false, inn: boolean = false): string {
        const a: LoadedPlayerRecord[] = [];
        const lines: string[] = [];

        // `all` includes dead and inn players, `inn` limits the list to inn
        // occupants, and the default view shows only active adventurers.
        this.player.allPlayers().forEach(function (p: LoadedPlayerRecord): void {
            if (p.name !== "X") {
                if (all || !p.dead) {
                    if (inn) {
                        if (p.inn) {
                            a.push(p);
                        }
                    } else if (all || !p.inn) {
                        a.push(p);
                    }
                }
            }
        });
        a.sort(function (a: LoadedPlayerRecord, b: LoadedPlayerRecord): number {
            return b.exp - a.exp;
        });
        lines.push("");
        lines.push("");
        lines.push("`>`%Legend Of The Red Dragon " + this.ver + " - Player Rankings");
        lines.push("");
        lines.push("`2    Name                    Experience    Level    Mastered    Status");
        lines.push(this.io.divider(0, '`0'));
        for (let i = 0; i < a.length; i += 1) {
            let l = "";
            if (a[i].sex === "F") {
                l += "`#F ";
            } else {
                l += "  ";
            }
            switch (a[i].clss) {
                case 1:
                    l += "`0D ";
                    break;
                case 2:
                    l += "`#M ";
                    break;
                case 3:
                    l += "`9T ";
                    break;
                default:
                    l += "  ";
            }
            l += "`2" + spacePad(a[i].name, 22) + "`2";
            l += spacePad(prettyInt(a[i].exp), 13, true);
            l += "    ";
            l += "`%";
            l += spacePad(prettyInt(a[i].level), 2);
            l += "        ";
            // Mastery letters appear once a skill reaches 20 and brighten again
            // at 40+ to reflect the classic LORD "mastered" tiers.
            if (a[i].skillw > 39) {
                l += "`%D";
            } else if (a[i].skillw > 19) {
                l += "`0D";
            } else {
                l += " ";
            }
            if (a[i].skillm > 39) {
                l += "`%M";
            } else if (a[i].skillm > 19) {
                l += "`#M";
            } else {
                l += " ";
            }
            if (a[i].skillt > 39) {
                l += "`%T";
            } else if (a[i].skillt > 19) {
                l += "`9T";
            } else {
                l += " ";
            }
            l += "     ";
            if (a[i].dead) {
                l += "`4Dead ";
            } else {
                l += "`%Alive";
            }
            // `on` is an overlay flag for the online-player view, not a sort key.
            if (on && a[i].on_now) {
                l += "  `%On";
            }
            lines.push(l);
        }
        return lines.join('\n');
    }

    async listPlayers(): Promise<void> {
        if (this.rip) await this.io.showRip("W1");
        await this.io.sln();
        const content = this.generateRankings(true, true, false);
        await this.io.showBuffer(content, true, true);
        if (this.rip || this.modern) {
            this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
            await this.io.getkey();
        }
    }
}

export default Rankings;
