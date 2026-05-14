/**
 * Town - The Town Square location for LORD
 * Refactored from Game.ts main() and related methods
 */

import { stripBacktickCodes } from '@lordts/util/Backtick';
import { File } from '@lordts/util/FileUtils';
import Lazy from '@lordts/util/Lazy';
import { GameExitError } from '../GameExitError';
import type { PromptOption } from '../GameEvents';
import type FileUtils from '@lordts/util/FileUtils';
import type { IStorage } from '@lordts/storage/IStorage';
import type Battle from '../Battle';
import type Bard from './Bard';
import type Blackjack from './Blackjack';
import type DailyMaint from '../DailyMaint';
import type Forest from './Forest';
import type Healers from './Healers';
import type IGM from '@lordts/igm/IGM';
import type IO from '../io/IO';
import type KingArthurs from './KingArthurs';
import type Log from '../Log';
import type Mail from '../Mail';
import type Marriage from '../Marriage';
import type OnlineBattle from '../OnlineBattle';
import type Rankings from '../Rankings';
import type RedDragonInn from './RedDragonInn';
import type State from '../State';
import type Turgons from './Turgons';
import type AbdulsArmour from './AbdulsArmour';
import type Bank from './Bank';
import type Player from '../Player';
import type { Settings, UiMode, IGMPlace, User } from '../types';

class Town {
    constructor(
        private io: IO,
        private state: State,
        private fileUtils: FileUtils,
        private settings: Settings,
        private _uiMode: UiMode,
        private user: User,
        private _player: Lazy<Player>,
        private _rankings: Lazy<Rankings>,
        private _redDragonInn: Lazy<RedDragonInn>,
        private _kingArthurs: Lazy<KingArthurs>,
        private _battle: Lazy<Battle>,
        private _abdulsArmour: Lazy<AbdulsArmour>,
        private _igm: Lazy<IGM>,
        private _forest: Lazy<Forest>,
        private _healers: Lazy<Healers>,
        private _turgons: Lazy<Turgons>,
        private _blackjack: Lazy<Blackjack>,
        private _onlineBattle: Lazy<OnlineBattle>,
        private _bard: Lazy<Bard>,
        private _bank: Lazy<Bank>,
        private _marriage: Lazy<Marriage>,
        private _mail: Lazy<Mail>,
        private _log: Lazy<Log>,
        private _dailyMaint: Lazy<DailyMaint>,
        private _storage: Lazy<IStorage>,
    ) {}

    get rip(): boolean { return this._uiMode.mode === 'rip'; }
    get modern(): boolean { return this._uiMode.mode === 'modern'; }
    get player(): Player { return this._player.value; }
    get rankings(): Rankings { return this._rankings.value; }
    get redDragonInn(): RedDragonInn { return this._redDragonInn.value; }
    get kingArthurs(): KingArthurs { return this._kingArthurs.value; }
    get battle(): Battle { return this._battle.value; }
    get abdulsArmour(): AbdulsArmour { return this._abdulsArmour.value; }
    get igm(): IGM { return this._igm.value; }
    get forest(): Forest { return this._forest.value; }
    get healers(): Healers { return this._healers.value; }
    get turgons(): Turgons { return this._turgons.value; }
    get blackjack(): Blackjack { return this._blackjack.value; }
    get onlineBattle(): OnlineBattle { return this._onlineBattle.value; }
    get bard(): Bard { return this._bard.value; }
    get bank(): Bank { return this._bank.value; }
    get marriage(): Marriage { return this._marriage.value; }
    get mail(): Mail { return this._mail.value; }
    get log(): Log { return this._log.value; }
    get dailyMaint(): DailyMaint { return this._dailyMaint.value; }
    get storage(): IStorage { return this._storage.value; }

    private async prompt(): Promise<string> {
        if (!this.rip && !this.modern) {
            await this.io.sln();
            this.io.foreground(5);
            await this.io.lln("`%The Town Square  `8(? for menu)");
            await this.io.sln("(F,S,K,A,H,V,I,T,Y,L,W,D,C,O,X,M,P,Q)");
        }
        const menuOptions: PromptOption[] = [
            { key: 'F', label: 'Forest' },
            { key: 'S', label: 'Slaughter Other Players' },
            { key: 'K', label: "King Arthur's Weapons" },
            { key: 'A', label: "Abdul's Armour" },
            { key: 'H', label: 'Healers' },
            { key: 'V', label: 'View Stats' },
            { key: 'I', label: 'Red Dragon Inn' },
            { key: 'T', label: "Turgon's Warrior Training" },
            { key: 'Y', label: 'Ye Olde Bank' },
            { key: 'L', label: 'List Warriors' },
            { key: 'W', label: 'Write Mail' },
            { key: 'D', label: 'Daily News' },
            { key: 'C', label: 'Conjugality List' },
            { key: 'O', label: 'Other Places' },
            ...(!this.modern ? [{ key: 'X', label: 'Expert Mode' }] : []),
            { key: 'M', label: 'Announcements' },
            { key: 'P', label: 'Players Online' },
            { key: 'Q', label: 'Quit' },
        ];
        return this.io.commandPrompt('main_menu', menuOptions);
    }

    private async menu(): Promise<void> {
        if (this.player.bank < 0) {
            this.player.bank = 0;
        }
        if (this.player.gold < 0) {
            this.player.gold = 0;
        }
        if (this.player.exp < 0) {
            this.player.exp = 0;
        }
        if (!this.player.expert) {
            this.io.sclrscr();
            if (this.rip) await this.io.showRip("MAIN");
            else if (!this.modern) await this.io.showTxt("MAIN");
        }
    }

    private async _otherPlacesMenu(oplaces: IGMPlace[]): Promise<void> {
        if (this.fileUtils.fileExists(this.fileUtils.runtimeFilePath("3rdalt.lrd"))) {
            await this.io.displayFilePaged(this.fileUtils.runtimeFilePath("3rdalt.lrd"));
        } else {
            await this.io.lln("`%`r0`c  Other Options", 1);
            await this.io.lln(this.io.divider(0, '`2'), 0);
            if (oplaces.length === 0) {
                await this.io.lln("`0(`2Currently Undeveloped Land`0)");
            } else {
                for (const place of oplaces) {
                    await this.io.lln(place.menu);
                }
            }
        }
    }

    private async _goodbye(): Promise<void> {
        this.io.sclrscr();
        if (this.rip) await this.io.showRip("W1");
        await this.io.sln();
        await this.io.sln();
        await this.io.lln("`%Quitting To The Fields...");
        await this.io.lln(this.io.divider(0, '`0'), 0);
        await this.io.lln("`2You find a comfortable place to sleep under a small tree...");
        await this.io.sln();
        this.player.on_now = false;
        this.player.put();
        this.io.events?.emitSystem('logout', { player: this.player.name });
        if (this.rip) {
            this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
            await this.io.getkey();
            await this.io.showRip("EXIT");
            this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
            await this.io.getkey();
        }
        throw new GameExitError();
    }

    private async _doQuit(): Promise<boolean> {
        await this.io.sln();
        await this.io.sln();
        const ch = await this.io.prompt(
            this.rip ? "  Quitting Game..." : "`2  Quit game?  [`0Y`2] : ",
            [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }],
            'quit_confirm',
            { defaultKey: 'Y', echo: !this.rip, trailingBlank: this.rip, leadingBlank: false, showTextInModern: true }
        );
        return ch === "Y";
    }

    private async _otherPlaces(): Promise<void> {
        this.io.foreground(10);
        this.io.background(0);
        const oplaces = this.igm.createOtherPlaces();
        if (this.player.expert) {
            this.io.sclrscr();
            await this.io.sln();
            await this.io.sln();
        } else {
            if (this.rip) await this.io.showRip("W1");
            await this._otherPlacesMenu(oplaces);
        }
        await this.mail.checkMail();
        const igmsec = new File(this.fileUtils.runtimeFilePath("igmsec.lrd"));
        let ch: string;
        do {
            await this.io.sln();
            await this.io.lw("`2What's your pleasure? [`0Q`2] (`0? for menu`2) : `%", 2);
            const placeOpts = oplaces.map((place, idx) => ({ key: String(idx + 1), label: stripBacktickCodes(place.desc) || `Place ${idx + 1}` }));
            placeOpts.push({ key: 'Q', label: 'Quit' }, { key: '?', label: 'Menu' });
            this.io.emitPrompt('other_places', placeOpts, oplaces.length >= 10 ? 'string' : undefined);
            if (oplaces.length < 10) {
                ch = (await this.io.getkey()).toUpperCase();
            } else {
                ch = (await this.io.getstr({ x: 0, y: 0, len: oplaces.length.toString().length, c: 1, c1: 15, edit: "" })).toUpperCase();
            }
            if (oplaces.length > 9) {
                if (ch[0] === "?") {
                    ch = "?";
                }
                if (ch === "") {
                    ch = "Q";
                }
            } else {
                if (ch === "\r") {
                    ch = "Q";
                }
            }
            if (ch.search(/^[0-9]+$/) !== -1) {
                    if (this.fileUtils.fileExists(igmsec.name)) {
                        if (igmsec.open("r")) {
                            const lineStr = igmsec.readln();
                            const lineNum = lineStr !== null ? parseInt(lineStr, 10) : NaN;
                            if (!isNaN(lineNum)) {
                                if ((this.user.level || 0) < lineNum) {
                                    igmsec.readln();
                                    igmsec.readln();
                                    while (true) {
                                        const moreLine = igmsec.readln();
                                        if (moreLine === null) {
                                            break;
                                        }
                                        await this.io.lln(moreLine);
                                    }
                                    break;
                                }
                            }
                            igmsec.close();
                        }
                    }
                const i = parseInt(ch, 10);
                if (i > 0 && i <= oplaces.length) {
                    if (await this.igm.handleIgm(oplaces[i - 1])) {
                        throw new GameExitError();
                    }
                }
                await this._otherPlacesMenu(oplaces);
                await this.mail.checkMail();
            } else if (ch === "?") {
                await this._otherPlacesMenu(oplaces);
                await this.mail.checkMail();
            }
        } while (ch !== "Q");
        await this.io.sln();
        await this.io.sln();
        if (this.rip) await this.menu();
    }

    async run(): Promise<void> {
        let quit = false;
        let ch: string;

        this.io.foreground(5);
        await this.io.sln();
        this.io.events?.emitNavigation('enter', 'town');

        if (this.player.inn) {
            await this.redDragonInn.run();
            if (this.player.dead) {
                return;
            }
        }


        await this.menu();
        do {
            await this.io.checkRip("MAIN");
            this.io.foreground(5);
            await this.mail.checkMail();
            ch = await this.prompt();
            switch (ch) {
                case "V":
                    await this.io.showStats();
                    await this.menu();
                    break;
                case "D":
                    await this.log.showLog();
                    await this.menu();
                    break;
                case "R":
                    if (this.mail.mailCheck()) {
                        await this.mail.checkMail();
                    } else {
                        await this.io.sln();
                        await this.io.sln("You have no mail.");
                    }
                    await this.io.sln();
                    break;
                case "?":
                    // DIFF: Couldn't see menu in expert mode before...
                    if (this.player.expert) {
                        await this.io.showTxt("MAIN");
                    }
                    await this.menu();
                    break;
                case "K":
                    this.io.events?.emitNavigation('enter', 'king_arthurs');
                    await this.kingArthurs.run();
                    this.io.events?.emitNavigation('leave', 'king_arthurs');
                    this.io.events?.emitNavigation('enter', 'town');
                    await this.menu();
                    break;
                case "S":
                    this.io.events?.emitNavigation('enter', 'slaughter');
                    await this.battle.slaughterOthers();
                    this.io.events?.emitNavigation('leave', 'slaughter');
                    this.io.events?.emitNavigation('enter', 'town');
                    if (this.player.dead) {
                        quit = true;
                    }
                    if (this.rip) await this.menu();
                    await this.io.sln();
                    break;
                case "A":
                    this.io.events?.emitNavigation('enter', 'abduls_armour');
                    await this.abdulsArmour.run();
                    this.io.events?.emitNavigation('leave', 'abduls_armour');
                    this.io.events?.emitNavigation('enter', 'town');
                    await this.menu();
                    await this.io.sln();
                    break;
                case "T":
                    this.io.events?.emitNavigation('enter', 'turgons');
                    await this.turgons.run();
                    this.io.events?.emitNavigation('leave', 'turgons');
                    this.io.events?.emitNavigation('enter', 'town');
                    if (this.rip) await this.menu();
                    await this.io.sln();
                    break;
                case "W":
                    if (this.rip) await this.io.showRip("W3");
                    await this.mail.composeMail();
                    if (this.rip) await this.menu();
                    break;
                case "L":
                    this.io.sclrscr();
                    await this.rankings.listPlayers();
                    if (this.rip) await this.menu();
                    break;
                case "O":
                    await this._otherPlaces();
                    break;
                case "F":
                    this.io.events?.emitNavigation('enter', 'forest');
                    await this.forest.run();
                    this.io.events?.emitNavigation('leave', 'forest');
                    this.io.events?.emitNavigation('enter', 'town');
                    if (this.player.dead) {
                        quit = true;
                        break;
                    }
                    await this.io.sln();
                    await this.menu();
                    break;
                case "H":
                    this.io.events?.emitNavigation('enter', 'healers');
                    await this.healers.run();
                    this.io.events?.emitNavigation('leave', 'healers');
                    this.io.events?.emitNavigation('enter', 'town');
                    await this.io.sln();
                    if (this.rip) await this.menu();
                    break;
                case "I":
                    this.io.events?.emitNavigation('enter', 'red_dragon_inn');
                    await this.redDragonInn.run();
                    this.io.events?.emitNavigation('leave', 'red_dragon_inn');
                    this.io.events?.emitNavigation('enter', 'town');
                    if (this.player.dead || this.player.inn) {
                        quit = true;
                        await this.io.sln();
                        break;
                    }
                    await this.menu();
                    await this.io.sln();
                    break;
                case "2":
                    this._uiMode.mode = !this.rip ? 'rip' : 'ansi';
                    await this.menu();
                    break;
                case "M":
                    await this.io.announce();
                    break;
                case "P":
                    if (this.rip) await this.io.showRip("W1");
                    await this.io.warriorsOnNow(false);
                    if (this.rip) await this.menu();
                    await this.io.sln();
                    break;
                case "1":
                    await this.io.showGameStats();
                    await this.io.sln();
                    if (this.rip) await this.menu();
                    break;
                case "C":
                    await this.marriage.conjugalityList();
                    await this.io.sln();
                    if (this.rip) await this.menu();
                    break;
                case "3": // ANSI-display toggle: never implemented in source; no-op.
                    await this.io.sln();
                    break;
                case "4": // Time-remaining display: never implemented in source; no-op.
                    await this.io.sln();
                    break;
                case "X":
                    if (this.rip) this.player.expert = false;
                    else this.player.expert = !this.player.expert;
                    await this.io.sln();
                    await this.io.sln();
                    if (this.player.expert) {
                        await this.io.sln("EXPERT MODE ON");
                    } else {
                        await this.io.sln("EXPERT MODE OFF");
                    }
                    break;
                case "Q":
                    if (!this.rip) {
                        if (!(await this._doQuit())) {
                            break;
                        }
                    }
                    await this._goodbye();
                    await this.io.sln();
                    break;
                case " ":
                    await this.io.sln();
                    break;
                case "Y":
                    this.io.events?.emitNavigation('enter', 'bank');
                    await this.bank.run();
                    this.io.events?.emitNavigation('leave', 'bank');
                    this.io.events?.emitNavigation('enter', 'town');
                    await this.io.sln();
                    if (this.rip) await this.menu();
                    break;
                default:
                    await this.io.sln();
            }
        } while (!quit);
    }
}

export default Town;
