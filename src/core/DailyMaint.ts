/**
 * DailyMaint - Daily maintenance routines for LORD.
 *
 * Run once per game day: resets forest and PvP fight counts, processes NPC
 * and player marriages, applies bank inflation, promotes/demotes players by
 * rank, resurrects inactive dead characters, and rotates the event log.
 */
'use strict';

import { random } from '@lordts/util/Util';
import Lazy from '@lordts/util/Lazy';
import type FileUtils from '@lordts/util/FileUtils';
import type IO from './io/IO';
import type Mail from './Mail';
import type Marriage from './Marriage';
import type { Settings, LoadedPlayerRecord, UiMode } from './types';
import type State from './State';
import type Player from './Player';
import { GameExitError } from './GameExitError';
import { HiddenPlayerPolicy } from './HiddenPlayerPolicy';
import { InactiveResurrectionPolicy } from './InactiveResurrectionPolicy';
import { recordWinner } from './WinnerHistory';
import type { IStorage } from '@lordts/storage/IStorage';
import type { IBattleCoordinator } from '@lordts/storage/IBattleCoordinator';


// ─────────────────────────────────────────────────────────────────────

class DailyMaint {
    constructor(
        private io: IO,
        private state: State,
        private fileUtils: FileUtils,
        private settings: Settings,
        private _dailyMaint: Lazy<DailyMaint>,
        private _mail: Lazy<Mail>,
        private _player: Lazy<Player>,
        private _marriage: Lazy<Marriage>,
        private _uiMode: UiMode,
        private _storage: Lazy<IStorage>,
        private _battleCoordinator: Lazy<IBattleCoordinator>,
    ) {}

    // ── Lazy-resolved dependencies ───────────────────────────────────────

    get rip(): boolean { return this._uiMode.mode === 'rip'; }
    get dailyMaint(): DailyMaint { return this._dailyMaint.value; }

    get mail(): Mail { return this._mail.value; }

    get player(): Player { return this._player.value; }

    get marriage(): Marriage { return this._marriage.value; }

    get storage(): IStorage { return this._storage.value; }
    get battleCoordinator(): IBattleCoordinator { return this._battleCoordinator.value; }

    /** Registered by GameContext after IGM is constructed; called at end of runDailyMaint(). */
    private _igmMaintHook: (() => Promise<void>) | null = null;

    setIgmMaintHook(hook: () => Promise<void>): void {
        this._igmMaintHook = hook;
    }

    private resolveBarNpcChatterProbability(): number {
        const probability = this.settings.bar_npc_chatter_probability;

        // Invalid or missing config falls back to the historical 50% chance,
        // then any explicit numeric value is clamped into the valid 0..1 range.
        if (typeof probability !== 'number' || isNaN(probability)) {
            return 0.5;
        }

        if (probability < 0) {
            return 0;
        }

        if (probability > 1) {
            return 1;
        }

        return probability;
    }

    private async tournamentOver(): Promise<void> {
        const a: LoadedPlayerRecord[] = [];
        const winstats = ['exp', 'drag_kills', 'pvp', 'level', 'laid'];

        this.player.allPlayers().forEach(function (p) {
            if (p.name !== 'X') {
                a.push(p);
            }
        });

        const sk = winstats[this.settings.tournament_winstat ?? 0];

        // Tournament winners are ordered by the selected headline stat, then a
        // fixed cascade of classic LORD tiebreakers so the result is stable.
        a.sort(function (a, b) {
            if (b[sk] !== a[sk]) {
                return (b[sk] as number) - (a[sk] as number);
            }
            if (b.exp !== a.exp) {
                return b.exp - a.exp;
            }
            if (b.drag_kills !== a.drag_kills) {
                return b.drag_kills - a.drag_kills;
            }
            if (b.pvp !== a.pvp) {
                return b.pvp - a.pvp;
            }
            if (b.level !== a.level) {
                return b.level - a.level;
            }
            if (b.laid !== a.laid) {
                return b.laid - a.laid;
            }
            if (b.gem !== (a['gen' as keyof typeof a] as number)) {
                return b.gem - a.gem;
            }
            return 0;
        });

        this.io.sclrscr();
        await this.io.sln();
        await this.io.sln();
        this.io.foreground(10);
        await this.io.lln('The tournament is now over! The winner is: ' + a[0].name);
        await this.io.sln();
        await this.io.sln('Now taking you back to the BBS..');
        await this.io.sln();
        if (this.rip)
            await this.io.lw('<CLICK>');
        else
            await this.io.lln('`2<`0MORE`2>');
        this.io.emitPrompt('tournament_winner', [{ key: '\r', label: 'Continue' }]);
        await this.io.getkey();
        this.storage.setLatestHero(a[0].name);
        this.state.won_by = a[0].Record;
        recordWinner(this.storage, a[0], {
            winType: 'tournament_time',
            winStat: sk,
            roundDays: this.state.days,
        });
        this.state.latesthero = a[0].name;
        this.state.putState();
        if ((this.player as unknown as Record<string, unknown>)['player'] != null) {
            this.player.on_now = false;
            this.player.put();
        }
        throw new GameExitError();
    }

    private _generateNpcChatter(pl: LoadedPlayerRecord): void {
        const newLines: string[] = [];

        if (this.settings.nochat) {
            return;
        }
        const chatterProbability = this.resolveBarNpcChatterProbability();
        if (chatterProbability <= 0) {
            return;
        }
        if (chatterProbability < 1 && random(1000) >= Math.round(chatterProbability * 1000)) {
            return;
        }
        if (pl.name === 'X') {
            return;
        }
        const n = random(12);
        switch (n) {
            case 0:
                newLines.push(pl.sex === 'F' ? '  `%Seth Able:' : '  `%Violet:');
                if (pl.cha < 3) {
                    newLines.push('  `0' + pl.name + '`0..  Have you showered recently?');
                }
                else if (pl.cha < 21) {
                    newLines.push('  `0Greetings, ' + pl.name + '`0.. Don\'t let them get you down.');
                }
                else {
                    newLines.push('  `0Hey ' + pl.name + '`0, come closer to me..');
                }
                break;
            case 1:
                newLines.push('  `%Bartender:');
                newLines.push('  `0You jabber too much, ' + pl.name + '.');
                break;
            case 2:
                newLines.push('  `%Barak:');
                if (pl.level > 2) {
                    newLines.push('  `0You think you\'re tough, ' + pl.name + ' `0\'cuz you got a ' + pl.weapon + '?');
                }
                else {
                    newLines.push('  `0You really got a big mouth, ' + pl.name + '`0.  Ugly one too.');
                }
                break;
            case 3:
                newLines.push('  `%Turgon:');
                if (pl.level < 6) {
                    newLines.push('  `0Are you saying what I think you\'re saying ' + pl.name + '`0?');
                }
                else if (pl.sex === 'M') {
                    newLines.push('  `0Man I need to get wasted...');
                }
                else {
                    newLines.push('  `0Heed the words of ' + pl.name + ', `0For she is a great warrior.');
                }
                break;
            case 4:
                newLines.push('  `%Aragorn:');
                newLines.push('  `0Hey, ' + pl.name + '`0, whats the deal with Jennie Garth?');
                break;
            case 5:
                newLines.push('  `%Seth Able:');
                newLines.push('  `0Damn, I need a drink.');
                break;
            case 6:
                newLines.push('  `%Grizelda:');
                if (pl.sex === 'M') {
                    newLines.push('  `0' + pl.name + '`0! You\'re a cute one!  Come to mama!');
                }
                else if (this.settings.clean_mode) {
                    newLines.push('  `0' + pl.name + '`0..Stay away from my man, wench!');
                }
                else {
                    newLines.push('  `0' + pl.name + '`0..Stay away from my man, slut.');
                }
                break;
            case 7:
                newLines.push('  `%Old Women From The Corner:');
                newLines.push('  `0There is no `4Dragon`0...The children all just ran away.');
                break;
            case 8:
                newLines.push('  `%Violet:');
                newLines.push('  `0I\'m so tired.  Will you escort me to my room,' + pl.name + '`0?');
                break;
            case 9:
                    newLines.push('  `%Hooded Warrior:');
                    newLines.push('  `0Watch you\'re back, ' + pl.name + '`0.');
                    break;
                case 10:
                newLines.push('  `%Old Man:');
                if (pl.cha > 3) {
                    newLines.push('  `0Well met, ' + pl.name + '`0!');
                }
                else {
                    newLines.push('  `0' + pl.name + '`0!  Why did you kick my ass the other day?!');
                }
                break;
            case 11:
                newLines.push('  `%Barak:');
                if (pl.sex === 'M') {
                    newLines.push('  `0' + pl.name + '`0.  Interesting name...');
                }
                else if (pl.cha < 4) {
                    newLines.push('  `0' + pl.name + '`0!  You have no breasts!  Are you a man!?  Har!');
                }
                else if (pl.cha < 8) {
                    newLines.push('  `0Finally!  A woman with some sense!');
                }
                else {
                    newLines.push('  `0' + pl.name + '`0!  I think I\'m in love!  Marry me honey!  Har!');
                }
                break;
        }
        this.storage.appendConversation('bar', newLines, 18);
    }

    private async _processOfflinePlayer(
        pl: LoadedPlayerRecord,
        i: number,
        scheduledResurrectionRecords: number[],
        spreadInactiveResurrections: boolean,
    ): Promise<void> {
        if (pl.name === 'X') {
            HiddenPlayerPolicy.unhidePlayer(this.storage, pl.Record);
            if (this.state.married_to_seth === i) {
                this.state.married_to_seth = -1;
                this.storage.releaseNpcMarriage('seth');
            }
            if (this.state.married_to_violet === i) {
                this.state.married_to_violet = -1;
                this.storage.releaseNpcMarriage('violet');
            }
        }
        else if (!pl.is_npc && this.settings.del_1xp && pl.exp === 1 && pl.drag_kills === 0) {
            HiddenPlayerPolicy.unhidePlayer(this.storage, pl.Record);
            pl.name = 'X';
            pl.real_name = 'X';
            pl.put();
            this.mail.killmail(pl.Record);
            if (this.state.married_to_seth === i) {
                this.state.married_to_seth = -1;
                this.storage.releaseNpcMarriage('seth');
            }
            if (this.state.married_to_violet === i) {
                this.state.married_to_violet = -1;
                this.storage.releaseNpcMarriage('violet');
            }
        }
        else if (!pl.is_npc && this.settings.delete_days > 0 && pl.time < (this.state.days - this.settings.delete_days)) {
            if (this.settings.inactive_player_policy === 'hide') {
                HiddenPlayerPolicy.hidePlayer(this.storage, pl.Record, this.state.days, 'inactive');
            } else {
                HiddenPlayerPolicy.unhidePlayer(this.storage, pl.Record);
                pl.name = 'X';
                pl.real_name = 'X';
                pl.put();
                this.mail.killmail(pl.Record);
                if (this.state.married_to_seth === i) {
                    this.state.married_to_seth = -1;
                    this.storage.releaseNpcMarriage('seth');
                }
                if (this.state.married_to_violet === i) {
                    this.state.married_to_violet = -1;
                    this.storage.releaseNpcMarriage('violet');
                }
            }
        }
        else if (this.state.days > 3) {
            if (InactiveResurrectionPolicy.isEligibleInactiveDeadPlayer(pl, this.state.days, this.settings.res_days)) {
                if (spreadInactiveResurrections) {
                    scheduledResurrectionRecords.push(pl.Record);
                } else if (InactiveResurrectionPolicy.resurrectImmediately(pl, this.state.days, this.settings.res_days)) {
                    await this.io.lln('`2(`0' + pl.name + ' `2is raised from the dead)');
                }
            }
        }
    }

    async runDailyMaint(): Promise<void> {
        let i: number;
        let pl: LoadedPlayerRecord;
        let plen: number;
        // When delayed resurrection spreading is enabled, collect all eligible
        // records first so the scheduler can assign staggered wake-up times in
        // one pass after the player sweep finishes.
        const scheduledResurrectionRecords: number[] = [];
        const spreadInactiveResurrections = typeof this.settings.inactive_resurrection_spread_minutes === 'number'
            && this.settings.inactive_resurrection_spread_minutes > 0;

        this.io.events?.emitSystem('daily_maintenance');

        // We have the state lock here, and state will be written after we return.
        // The maintenance phases below intentionally follow the DOS flow:
        // advance the day, resolve round-end checks, sweep player records, then
        // run relationship and IGM maintenance against the updated state.
        await this.io.sln();
        this.io.foreground(10);
        switch (random(4)) {
            case 0:
                this.io.sw('You stop to notice a bird singing this bright morning.', 2);
                break;
            case 1:
                this.io.sw('You take the time to clean your weapon this morning.', 2);
                break;
            case 2:
                this.io.sw('Time seems to stand still as you contemplate life.', 2);
                break;
            case 3:
                this.io.sw('Waking up is slow this morning.  You blame lastnights ale.', 2);
                break;
        }
        this.io.sw('.');
        this.state.days += 1;
        this.io.sw('.');
        const tournamentDays = this.settings.tournament_days ?? 0;
        if (this.settings.tournament_enabled === true && tournamentDays > 0 && tournamentDays <= this.state.days) {
            await this.tournamentOver();
        }
        this.io.sw('.');
        // NPC talks to last person who chatted in the bar...
        if (this.state.last_bar !== -1) {
            const barPlayer = this.player.playerGet(this.state.last_bar);
            if (barPlayer && barPlayer.Yours) {
                this._generateNpcChatter(barPlayer);
                this.state.last_bar = -1;
            }
        }

        await this.io.sln('.', 0);
        // this is the start of the actual player maintenance
        plen = this.player.playerLength();
        // Stale on_now sweep - clear any player whose on_now flag was set by a
        // session that died without cleaning up (server crash, OOM-kill, etc.).
        // last_on_unix is 0 for legacy records (pre-dates the field) or for
        // players whose session never refreshed the timestamp; either way,
        // treat them as offline since no legitimately active session would be
        // older than STALE_THRESHOLD_SECS at the time maintenance runs.
        const STALE_THRESHOLD_SECS = 30 * 60; // 30 minutes
        const nowSecs = Math.floor(Date.now() / 1000);
        for (let si = 0; si < plen; si++) {
            const staleRec = this.player.playerGet(si);
            if (!staleRec || !staleRec.Yours || !staleRec.on_now) continue;
            const lastOn = (staleRec.last_on_unix) ?? 0;
            if (lastOn === 0 || nowSecs - lastOn >= STALE_THRESHOLD_SECS) {
                staleRec.on_now = false;
                staleRec.last_on_unix = 0;
                staleRec.put();
            }
        }
        for (i = 0; i < plen; i += 1) {
            const plRecord = this.player.playerGet(i);
            if (!plRecord) continue;
            pl = plRecord;
            if (pl.Yours) {
                if (!pl.on_now) {
                    this.battleCoordinator.clearWarMessage(pl.Record);
                    this.battleCoordinator.clearBattleMessage(pl.Record);
                }
                if (!pl.on_now) {
                    await this._processOfflinePlayer(pl, i, scheduledResurrectionRecords, spreadInactiveResurrections);
                }
            }
        }

        if (spreadInactiveResurrections) {
            // Spread mode persists future wake-up times in config, then applies
            // any entries whose scheduled time has already arrived.
            InactiveResurrectionPolicy.scheduleResurrections(
                this.storage,
                scheduledResurrectionRecords,
                this.state.days,
                this.settings,
            );
            const resurrectedPlayers = InactiveResurrectionPolicy.applyDueResurrections(
                this.storage,
                this.settings,
                new Date(),
                undefined,
                this.state.days,
            );
            for (const resurrectedPlayer of resurrectedPlayers) {
                await this.io.lln('`2(`0' + resurrectedPlayer + ' `2is raised from the dead)');
            }
        } else {
            InactiveResurrectionPolicy.clearScheduledResurrections(this.storage);
        }

        await this.io.sln();
        plen = this.player.playerLength();
        if (this.state.married_to_seth > -1) {
            if (this.state.married_to_seth > plen) {
                this.marriage.divorceSeth();
            }
            else {
                const sethPlayer = this.player.playerGet(this.state.married_to_seth);
                if (sethPlayer && sethPlayer.Yours) {
                    if (sethPlayer.name === 'X') {
                        this.marriage.divorceSeth();
                    }
                    else {
                        await this.marriage.sethMarriage();
                    }
                }
            }
        }
        if (this.state.married_to_violet > -1) {
            if (this.state.married_to_violet > plen) {
                this.marriage.divorceViolet();
            }
            else {
                const violetPlayer = this.player.playerGet(this.state.married_to_violet);
                if (violetPlayer && violetPlayer.Yours) {
                    if (violetPlayer.name === 'X') {
                        this.marriage.divorceViolet();
                    }
                    else {
                        await this.marriage.violetMarriage();
                    }
                }
            }
        }
        // Run per-IGM daily maintenance so IGM data is always reset at the start of a new
        // day, even when no player visits a particular IGM on that day.
        if (this._igmMaintHook !== null) {
            await this._igmMaintHook();
        }
        await this.io.more();
    }

    async tournamentCheck(): Promise<void> {
        if (this.settings.tournament_enabled !== true) {
            return;
        }
        if ((this.settings.tournament_days ?? 0) > 0) {
            return;
        }
        if (this.player.exp < (this.settings.tournament_xp ?? 0)) {
            return;
        }
        if (this.player.drag_kills < (this.settings.tournament_dkills ?? 0)) {
            return;
        }
        if (this.player.pvp < (this.settings.tournament_pkills ?? 0)) {
            return;
        }
        if (this.player.level < (this.settings.tournament_level ?? 0)) {
            return;
        }
        if (this.player.laid < (this.settings.tournament_lays ?? 0)) {
            return;
        }

        await this.state.getState(true);
        if (this.state.won_by < 0) {
            this.state.won_by = this.player.Record;
            this.storage.setLatestHero(this.player.name);
            recordWinner(this.storage, this.player, {
                winType: 'tournament_stat',
                winStat: 'thresholds',
                winStatValue: 1,
                roundDays: this.state.days,
            });
            this.state.latesthero = this.player.name;
            this.state.putState();
            this.io.sclrscr();
            await this.io.sln();
            await this.io.sln();
            this.io.foreground(10);
            await this.io.sln('Congratulations! You have won the tournament!');
            await this.io.sln();
            if (this.rip)
                await this.io.lw('<CLICK>');
            else
                await this.io.lln('`2<`0MORE`2>');
            this.io.emitPrompt('tournament_won', [{ key: '\r', label: 'Continue' }]);
            await this.io.getkey();
            this.player.on_now = false;
            this.player.put();
        }
        else {
            this.state.putState();
            const wonByPlayer = this.player.playerGet(this.state.won_by);
            this.io.sclrscr();
            await this.io.sln();
            await this.io.sln();
            this.io.foreground(10);
            await this.io.lln('You have completed the tournament, but ' + (wonByPlayer ? wonByPlayer.name : 'someone') + ' got there first.');
            await this.io.sln();
            if (this.rip)
                await this.io.lw('<CLICK>');
            else
                await this.io.lln('`2<`0MORE`2>');
            this.io.emitPrompt('tournament_lost', [{ key: '\r', label: 'Continue' }]);
            await this.io.getkey();
            this.player.on_now = false;
            this.player.put();
        }
        throw new GameExitError();
    }
}

export default DailyMaint;
