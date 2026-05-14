/**
 * Mail - In-game player mail for LORD.
 *
 * Lets players send messages to one another, read their inbox, and delete
 * old mail. Handles new-mail notifications at login and tracks read/unread
 * state across sessions.
 */
import { random, format, prettyInt, formatDate, cleanStr } from '@lordts/util/Util';
import Lazy from '@lordts/util/Lazy';
import type FileUtils from '@lordts/util/FileUtils';
import type { UiMode, LoadedPlayerRecord } from './types';
import type IO from './io/IO';
import type { Settings } from './types';
import type State from './State';
import type Player from './Player';
import type Marriage from './Marriage';
import type Log from './Log';
import type DailyMaint from './DailyMaint';
import { PlayerIpHistoryPolicy } from './PlayerIpHistoryPolicy';
import { PlayerRelationPolicy } from './PlayerRelationPolicy';
import type { IStorage } from '@lordts/storage/IStorage';

class Mail {
    constructor(
        public io: IO,
        public fileUtils: FileUtils,
        public settings: Settings,
        private _uiMode: UiMode,
        private _state: Lazy<State>,
        private _player: Lazy<Player>,
        private _mail: Lazy<Mail>,
        private _marriage: Lazy<Marriage>,
        private _log: Lazy<Log>,
        private _dailyMaint: Lazy<DailyMaint>,
        private _storage: Lazy<IStorage>,
    ) {}

    // ── Lazy-resolved dependencies ───────────────────────────────────────

    // Dynamic access to properties populated after Mail construction
    get rip(): boolean { return this._uiMode.mode === 'rip'; }
    get modern(): boolean { return this._uiMode.mode === 'modern'; }
    get lastrip(): string { return this._uiMode.lastScreen; }

    get state(): State {
        return this._state.value;
    }

    get player(): Player {
        return this._player.value;
    }

    get mail(): Mail {
        return this._mail.value;
    }

    get marriage(): Marriage {
        return this._marriage.value;
    }

    get log(): Log {
        return this._log.value;
    }

    get dailyMaint(): DailyMaint {
        return this._dailyMaint.value;
    }

    get storage(): IStorage {
        return this._storage.value;
    }

    // ── Mail operations ────────────────────────────────────────────────

    private async canSendMailTo(to: number): Promise<boolean> {
        if (this.settings.player_blocking !== true) {
            return true;
        }

        if (!PlayerRelationPolicy.isPlayerBlocked(this.storage, to, this.player.Record)) {
            return true;
        }

        await this.io.sln();
        await this.io.sln('That player is refusing messages from you.');
        if (this.rip || this.modern) {
            await this.io.moreNoMail();
        }
        return false;
    }

    private async promptMailContactAction(to: number, op: LoadedPlayerRecord): Promise<boolean> {
        if (this.settings.player_blocking !== true || to === this.player.Record) {
            return true;
        }

        const isBlockingTarget = PlayerRelationPolicy.isPlayerBlocked(this.storage, this.player.Record, to);
        const toggleKey = isBlockingTarget ? 'U' : 'B';
        const toggleLabel = isBlockingTarget ? 'Unblock ' + op.name : 'Block ' + op.name;
        const choice = (await this.io.prompt(
            '  `2What would you like to do? `0[`2W`0]`2 : ',
            [
                { key: 'W', label: 'Write Mail' },
                { key: toggleKey, label: toggleLabel },
                { key: 'N', label: 'Never Mind' },
            ],
            'mail_contact_action',
            { defaultKey: 'W', leadingBlank: true, trailingBlank: true }
        )).toUpperCase();

        if (choice === toggleKey) {
            PlayerRelationPolicy.setPlayerBlocked(this.storage, this.player.Record, to, !isBlockingTarget);
            await this.io.sln();
            await this.io.sln(isBlockingTarget
                ? 'You are no longer blocking ' + op.name + '.'
                : 'You are now blocking ' + op.name + '.');
            if (this.rip || this.modern) {
                await this.io.moreNoMail();
            }
            return false;
        }

        return choice === 'W';
    }

    // ---------------------------------------------------------------------------
    // Romantic-mail reply handlers (called from Output.lw() when reading mail)
    // ---------------------------------------------------------------------------

    async answerMail(to: number): Promise<void> {
        const op = this._player.value.playerGet(to) as LoadedPlayerRecord;
        let ch: string;

        await this.io.sln();
        this.io.foreground(10);
        this.io.sw('Answer ' + (op.sex === 'M' ? 'him?' : 'her?'), 2);
        await this.io.lw(' `2[`5Y`2] `0: ');
        this.io.emitPrompt('answer_mail_confirm', [
            { key: 'Y', label: 'Yes' },
            { key: 'N', label: 'No' },
        ]);
        ch = (await this.io.getkey()).toUpperCase();
        if (ch !== 'N') {
            ch = 'Y';
        }
        await this.io.sln(ch, 0);
        if (ch === 'N') {
            this.storage.clearQuoteBuffer(this.player.Record);
            return;
        }
        if (to === this.player.Record) {
            await this.io.sln();
            await this.io.sln('** THE MESSENGER REFUSES TO DELIVER THE MESSAGE! **');
            return;
        }
        const he = op.sex === 'M' ? 'he' : 'she';
        await this.io.sln();
        await this.io.sln();
        this.io.foreground(10);
        this.io.sw('Quote what ' + he + ' said? : ', 2);
        await this.io.lw('`2[`5Y`2] `0: ');
        this.io.emitPrompt('quote_confirm', [
            { key: 'Y', label: 'Yes' },
            { key: 'N', label: 'No' },
        ]);
        ch = (await this.io.getkey()).toUpperCase();
        if (ch !== 'N') {
            ch = 'Y';
        }
        await this.io.sln(ch, 0);
        await this.writeMail(to, ch === 'Y');
        this.storage.clearQuoteBuffer(this.player.Record);
    }

    async smileMail(to: number): Promise<void> {
        const op = this._player.value.playerGet(to) as LoadedPlayerRecord;

        await this.io.sln();
        const him = op.sex === 'M' ? 'him' : 'her';
        const he = this.player.sex === 'M' ? 'He' : 'She';
        await this.io.showLooks(op);
        await this.io.lln('`2(`0P`2)ointedly ignore ' + him);
        await this.io.lln('`2(`0S`2)mile hugely');
        const ch = await this.io.prompt(
            '  What do you do about it? `0[`2S`0]`2 : ',
            [{ key: 'P', label: 'Pointedly ignore' }, { key: 'S', label: 'Smile hugely' }],
            'smile_mail_response',
            { defaultKey: 'S', leadingBlank: true, trailingBlank: true }
        );
        await this.io.lln('`%** Please wait, writing ' + him + ' back **');
        // Mail control codes processed by Output.lw() at read-time:
        //   `E<n> = grant n XP    `V<n> = deduct n XP    `{ = increment laid
        //   `- = sender record (enables reply)    `| = "press any key" pause
        if (ch !== 'P') {
            await this.mailTo(to, '`%  ** Romantic Mail Return From ' + this.player.name + '`% **\n' +
                '`l\n' +
                '`0  ' + he + ' smiles back, encouragingly!\n' +
                '`0  \n' +
                '`2  You receive `%' + prettyInt(5 * op.level) + ' `2experience points!\n' +
                '`E' + (5 * op.level) + '\n' +
                '```|');
        } else {
            await this.mailTo(to, '`%  ** Romantic Mail Return From ' + this.player.name + '`% **\n' +
                '`l\n' +
                '`0  ' + he + ' ignores you!  You are snubbed good!\n' +
                '`0  \n' +
                '`2  You `4LOSE `%' + prettyInt(5 * op.level) + ' `2experience points!\n' +
                '`V' + (5 * op.level) + '\n' +
                '```|');
        }
        this.storage.clearQuoteBuffer(this.player.Record);
    }

    async kissMail(to: number): Promise<void> {
        const op = this._player.value.playerGet(to) as LoadedPlayerRecord;

        await this.io.sln();
        const him = op.sex === 'M' ? 'him' : 'her';
        const he = this.player.sex === 'M' ? 'He' : 'She';
        await this.io.showLooks(op);
        await this.io.lln('`2(`0P`2)ointedly ignore ' + him);
        await this.io.lln('`2(`0K`2)iss ' + him + ' soundly');
        const ch = await this.io.prompt(
            '  What do you do about it? `0[`2K`0]`2 : ',
            [{ key: 'P', label: 'Pointedly ignore' }, { key: 'K', label: 'Kiss soundly' }],
            'kiss_mail_response',
            { defaultKey: 'K', leadingBlank: true, trailingBlank: true }
        );
        await this.io.lln('`%** Please wait, writing ' + him + ' back **');
        if (ch !== 'P') {
            await this.mailTo(to, '`%  ** Romantic Mail Return From ' + this.player.name + '`% **\n' +
                '`l\n' +
                '`0  ' + he + ' gives you a big wet kiss!\n' +
                '`2  You receive `%' + prettyInt(10 * op.level) + ' `2experience points!\n' +
                '`E' + (10 * op.level) + '\n' +
                '```|');
        } else {
            await this.mailTo(to, '`%  ** Romantic Mail Return From ' + this.player.name + '`% **\n' +
                '`l\n' +
                '`0  ' + he + ' ignores you!  You are snubbed really good!\n' +
                '`0  \n' +
                '`2  You `4LOSE `%' + prettyInt(10 * op.level) + ' `2experience points!\n' +
                '`V' + (10 * op.level) + '\n' +
                '```|');
        }
        this.storage.clearQuoteBuffer(this.player.Record);
    }

    async dinnerMail(to: number): Promise<void> {
        const op = this._player.value.playerGet(to) as LoadedPlayerRecord;

        await this.io.sln();
        const him = op.sex === 'M' ? 'him' : 'her';
        const he = this.player.sex === 'M' ? 'He' : 'She';
        await this.io.showLooks(op);
        await this.io.lln('`2(`0P`2)ointedly ignore ' + him);
        await this.io.lln('`2(`0G`2)o to dinner with ' + him);
        const ch = await this.io.prompt(
            '  What do you do about it? `0[`2G`0]`2 : ',
            [{ key: 'P', label: 'Pointedly ignore' }, { key: 'G', label: 'Go to dinner' }],
            'dinner_mail_response',
            { defaultKey: 'G', leadingBlank: true, trailingBlank: true }
        );
        await this.io.lln('`%** Please wait, writing ' + him + ' back **');
        if (ch !== 'P') {
            await this.mailTo(to, '`%  ** Romantic Mail Return From ' + this.player.name + '`% **\n' +
                '`l\n' +
                '`0  ' + he + ' agrees to go to dinner with you!\n' +
                '`0  \n' +
                '`0  You both have a wonderful time, and learn a lot from each other.\n' +
                '`0  ' +
                '`2  You receive `%' + prettyInt(20 * op.level) + ' `2experience points!\n' +
                '`E' + (20 * op.level) + '\n' +
                '```|');
            await this.log.logLine('`%' + this.player.name + ' `2agrees to have dinner with `0' + op.name + '`2!');
            this.io.foreground(2);
            await this.io.sln();
            await this.io.lln('You have a wonderful time at dinner, and both learn a lot about each other.  You both vow to do it again sometime.');
            await this.io.sln();
            await this.io.moreNoMail();
        } else {
            await this.mailTo(to, '`%  ** Romantic Mail Return From ' + this.player.name + '`% **\n' +
                '`l\n' +
                '`0  ' + he + ' laughs in your face!  You are snubbed so bad.\n' +
                '`0  \n' +
                '`2  You `4LOSE `%' + prettyInt(20 * op.level) + ' `2experience points!\n' +
                '`V' + (20 * op.level) + '\n' +
                '```|');
            await this.log.logLine('`%' + this.player.name + ' `2refuses to dine with `0' + op.name + '`2!');
        }
        this.storage.clearQuoteBuffer(this.player.Record);
    }

    async sleepMail(to: number): Promise<void> {
        const op = this._player.value.playerGet(to) as LoadedPlayerRecord;

        await this.io.sln();
        const him = op.sex === 'M' ? 'him' : 'her';
        const he = this.player.sex === 'M' ? 'He' : 'She';
        const ohe = op.sex === 'M' ? 'he' : 'she';
        await this.io.showLooks(op);
        await this.io.lln('`2(`0P`2)ointedly tell ' + him + ' absolutely not!');
        await this.io.lln('`2(`0S`2)leep with ' + him);
        const ch = await this.io.prompt(
            '  What do you do about it? `0[`2P`0]`2 : ',
            [{ key: 'P', label: 'Pointedly tell not' }, { key: 'S', label: 'Sleep with' }],
            'sleep_mail_response',
            { defaultKey: 'P', leadingBlank: true, trailingBlank: true }
        );
        await this.io.lln('`%** Please wait, writing ' + him + ' back **');
        // Responder's laid count increments here; initiator's increments
        // via `{ control code when they read the reply mail
        if (ch === 'S') {
            await this._handleSleepAccept(op, to, he, ohe);
        } else {
            await this.mailTo(to, '`%  ** Romantic Mail Return From ' + this.player.name + '`% **\n' +
                '`l\n' +
                '`0  ' + he + ' laughs in your face!  You are snubbed the worst you\n' +
                '  have ever been snubbed before in your life.\n' +
                '  \n' +
                '`2  You `4LOSE `%' + prettyInt(50 * op.level) + ' `2experience points!\n' +
                '`V' + (50 * op.level) + '\n' +
                '```|');
            await this.log.logLine('`%' + op.name + ' `2got seriously snubbed by `0' + this.player.name + '`2!');
            this.io.foreground(15);
            await this.io.sln();
            await this.io.sln('Ouch!');
            await this.io.sln();
        }
        this.storage.clearQuoteBuffer(this.player.Record);
    }

    private async _handleSleepAccept(op: LoadedPlayerRecord, to: number, he: string, ohe: string): Promise<void> {
        this.player.laid += 1;
        await this.mailTo(to, '`%  ** Romantic Mail Return From ' + this.player.name + '`% **\n' +
            '`l\n' +
            '`0  ' + he + ' agrees to sleep with you!\n' +
            '\n' +
            '  You both have a wonderfully sweaty time, and learn very little\n' +
            '  from each other.  (but you had fun!)\n' +
            '\n' +
            '`2  You receive `%' + prettyInt(50 * op.level) + ' `2experience points!\n' +
            '`E' + prettyInt(50 * op.level) + '\n' +
            '`{\n' +
            '```|');
        await this.log.logLine('`%' + this.player.name + ' `2got laid by `0' + op.name + '`2!');
        await this.io.lln('`c`%** UPSTAIRS IN THE INN **');
        await this.io.sln();
        await this.io.lln('`2When you finally arrive at ' + op.name + '`2\'s bedroom at the appointed time, you are nervous as ever!');
        await this.io.sln();
        await this.io.moreNoMail();
        await this.io.lln('Your knocks are unanswered.  Since the door is slightly ajar, you see no harm in letting yourself in.  You push through the beads into a smokey room.  The smell of herbs fills your nostrils, and the sound of soft music fills your ears.');
        await this.io.sln();
        await this.io.moreNoMail();
        await this.io.lln('And then a skimpily clad ' + op.name + '`2 walks into the room!');
        await this.io.sln();
        await this.io.moreNoMail();
        await this.io.lln('Without a word, ' + ohe + ' points at the heart-shaped bed.');
        await this.io.sln();
        await this.io.moreNoMail();
        await this.io.lln('A good while later you are drenched in sweat, tired, but feeling good.  ' + op.name + '`2 holds you close, as if ' + ohe + ' never wanted this moment to end.');
        await this.io.sln();
        if (random(2) === 0) {
            await this.io.moreNoMail();
            if (this.player.sex === 'M') {
                await this.io.lln('`%Seth Able hi-fives you on the way out!');
            } else {
                await this.io.lln('`%Violet gives you a dirty look on the way out!');
            }
        }
        await this.io.sln();
        await this.io.moreNoMail();
        await this.dailyMaint.tournamentCheck();
    }

    mailCheck(): boolean {
        return this.storage.hasMail(this.player.Record);
    }

    async checkMail(): Promise<void> {
        const lr = this.lastrip;

        if (this.storage.hasMail(this.player.Record)) {
            const lines = this.storage.getMail(this.player.Record);
            this.storage.deleteMail(this.player.Record);
            if (this.rip) {
                if (lr != "W1" && lr != "W5" && lr != "W3" && lr != "W4") await this.io.showRip("W4");
            }
            this.io.foreground(15);
            await this.io.sln("** YOU ARE STOPPED BY A MESSENGER WITH THE FOLLOWING NEWS: **");
            await this.io.sln();
            if (this.rip) {
                this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
                await this.io.getkey();
            }
            await this.io.showBuffer(lines.join('\n'), true, true);
            await this.io.sln();
            if (this.rip) {
                if (lr != "W1" && lr != "W5" && lr != "W3" && lr != "W4") await this.io.showRip(lr);
            }
        }
    }

    killmail(to: number): void {
        this.storage.deleteMail(to);
    }

    private async writeMail(to: number, quote?: boolean): Promise<void> {
        let l: string;
        let wrap = "";
        const msgLines: string[] = [];
        let ch: string;
        let t: number;
        let lines = 0;
        const derps: string[] = [
            "`.`%  Greetings.  How fare you, traveler?",
            "`.`%  Well met.  Any news you can share?",
            "`.`%  How goes it, fellow adventurer?",
            "`.`%  Didn't I see you on that table in the Dark Cloak tavern?",
            "`.`%  Sorry - I forgot what I was going to say, old bean.",
        ];
        // 76 backspaces and spaces for erasing wrapped text on the terminal
        const bs =
            "\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08\x08";
        const ws = "                                                                            ";

        if (quote === undefined) {
            quote = false;
        }

        if (!(await this.canSendMailTo(to))) {
            this.storage.clearQuoteBuffer(this.player.Record);
            return;
        }

        await this.io.sln();
        await this.io.sln("Enter message now..Blank line quits!");
        this.io.emitPrompt('write_mail', [], 'text');
        msgLines.push("`. ");
        msgLines.push("`.  `0" + this.player.name + "`2 sent you this on " + formatDate());
        msgLines.push('`l');
        if (quote) {
            const quoteLines = this.storage.getQuoteBuffer(this.player.Record);
            for (const ql of quoteLines) {
                if (ql.substr(0, 3) === "`% ") {
                    l = "`0>" + ql.substr(3);
                    msgLines.push(l);
                    await this.io.lln(l);
                }
            }
        }
        this.storage.clearQuoteBuffer(this.player.Record);
        do {
            l = wrap;
            wrap = "";
            await this.io.sln();
            this.io.foreground(2);
            this.io.sw(" >");
            this.io.foreground(15);
            this.io.sw(l);
            do {
                ch = await this.io.getkey();
                this.io.sw(ch);
                if (ch === "\x08") {
                    l = l.slice(0, -1);
                    this.io.sw(" \x08");
                } else if (ch !== "\x1b") {
                    if (ch !== "\r") {
                        l += ch;
                    }
                    if (l.length > 75) {
                        t = l.lastIndexOf(" ");
                        if (t !== -1) {
                            wrap = l.slice(t + 1);
                            l = l.slice(0, t);
                            this.io.sw(bs.substr(0, wrap.length));
                            this.io.sw(ws.substr(0, wrap.length));
                        }
                        ch = "\r";
                    }
                }
            } while (ch !== "\r");
            if (l.length === 0 && lines === 0) {
                if (this.settings.blank_mail_sends_default_message === false) {
                    await this.io.sln();
                    await this.io.sln('Mail cancelled.');
                    if (this.rip || this.modern) {
                        await this.io.moreNoMail();
                    }
                    return;
                }
                msgLines.push(cleanStr(derps[random(derps.length)]));
                break;
            }
            lines += 1;
            l = cleanStr("`.`%  " + l);
            msgLines.push(l);
        // Blank line ends input: prefix alone is < 5 chars after cleanStr
        } while (l.length >= 5);
        // Append sender record ID so the mail renderer can offer a reply prompt
        msgLines.push("`-" + format("%03d", this.player.Record));
        this.storage.sendMail(to, msgLines.join('\n'));
        await this.io.sln();
        await this.io.sln("Mail sent!");
        if (to === this.player.Record) {
            await this.io.sln();
            await this.io.sln("You are a very stupid individual.");
            await this.io.sln();
            await this.io.moreNoMail();
        } else if (this.rip || this.modern) {
            await this.io.moreNoMail();
        }
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- async required: callers await this
    async mailTo(to: number, mail: string): Promise<void> {
        this.storage.sendMail(to, mail);
    }

    private async _sendRomanticMail(op: LoadedPlayerRecord, to: number): Promise<boolean | null> {
        const pronoun = op.sex === "M" ? "him" : "her";
        const ppronoun = this.player.sex === "M" ? "him" : "her";
        const ppronoun2 = this.player.sex === "M" ? "his" : "her";
        const uppronoun = this.player.sex === "M" ? "He" : "She";
        const upronoun = op.sex === "M" ? "Him" : "Her";
        let sent = false;

        if (
            this.settings.shared_ip_block_romantic_mail === true
            && PlayerIpHistoryPolicy.havePlayersSharedRecentIp(this.storage, this.player.time, this.player.Record, to, this.settings)
        ) {
            await this.io.sln();
            await this.io.sln('The messenger refuses romantic mail between players who recently shared an address.');
            await this.io.sln();
            return null;
        }
        await this.io.lln("`c`%** ROMANTIC MESSAGE **", 21);
        await this.io.lln(this.io.divider(0, '`2'), 0);
        await this.io.lln("`0Your hand trembles as you try to conjure up something to stir your beloved " + op.name + ".");
        await this.io.sln();
        await this.io.showLooks(op);
        await this.io.moreNoMail();
        await this.io.lln("`2(`0N`2)ever mind.");
        await this.io.lln("`2(`0F`2)latter " + upronoun);
        await this.io.lln("`2(`0A`2)sk For A Kiss");
        await this.io.lln("`2(`0B`2)uy " + upronoun + " Dinner");
        if (!this.settings.clean_mode) {
            await this.io.lln("`2(`0I`2)nvite " + upronoun + " To Your Room At The Inn");
        }
        // Proposal requires charm > 99 (effectively max charm;
        // rewards dedicated flirting investment)
        if (this.player.cha > 99) {
            await this.io.lln("`2(`0P`2)ropose To " + upronoun);
        }
        await this.io.sln();
        await this.io.lw("`2Which way would you like to show your love? : ", 2);
        const flirtOpts = [
            { key: 'N', label: 'Never Mind' },
            { key: 'F', label: 'Flatter' },
            { key: 'A', label: 'Ask For A Kiss' },
            { key: 'B', label: 'Buy Dinner' },
        ];
        if (!this.settings.clean_mode) {
            flirtOpts.push({ key: 'I', label: 'Invite To Room' });
        }
        if (this.player.cha > 99) {
            flirtOpts.push({ key: 'P', label: 'Propose' });
        }
        this.io.emitPrompt('romantic_mail', flirtOpts);
        let ch = (await this.io.getkey()).toUpperCase();
        if ("FABIP".indexOf(ch) === -1) {
            ch = "N";
        }
        if (this.settings.clean_mode && ch === "I") {
            ch = "N";
        }
        if (this.player.cha < 100 && ch === "P") {
            ch = "N";
        }
        await this.io.sln(ch, 0);
        await this.io.sln();
        switch (ch) {
            case "F":
                sent = await this.marriage.romance(
                    "  Flattering Text? :",
                    [
                        "I like, um, think you are, uh, nice?",
                        "You are just as cute as my dog!",
                        "You have like, big uh, thingies.",
                        "Your lips are like roses.",
                        "May I drink in your beauty?  You're a tankard of joy!",
                        "I'd pick up yer hankie anywheres! Hyuck!",
                    ],
                    [
                        "I like, um, think you are, uh, nice?",
                        "You are just as cute as my dog!",
                        "I like the way you kill people.",
                        "I've been watching you for a while...",
                        "Might I let you know that you are handsome?",
                        "Ya wanna do something sometime, somewhere?",
                    ],
                    to,
                    "  Somehow you don't think that will turn " + pronoun + " on.",
                    "  `2" + this.player.name + " is flirting with you!",
                    "K",
                );
                this.player.flirted = sent;
                break;
            case "A":
                sent = await this.marriage.romance(
                    "  By saying what? :",
                    [
                        "Gimmie a kiss, woman!",
                        "Git over here, you!",
                        "Please give me the honor of touching your lips.",
                        "I'm an explorer.  Can I explore your mouth?",
                        "Kiss me, I use a mouth wash!",
                        "Uh, if you kiss me, I'll turn back into a prince.",
                    ],
                    [
                        "Kiss me you big hunk oh man!",
                        "Pleeeeeeeeease kiss me!",
                        "I'm an adventurer.  Can I explore your mouth?",
                        "If you kiss me, our relationship might grow.",
                        "Kiss me, lover!  I brush regularly.",
                        "Can I teach you a french custom I know?",
                    ],
                    to,
                    "  Somehow you don't think that will turn " + pronoun + " on.",
                    "  `2" + this.player.name + " wants you to kiss " + ppronoun + "!",
                    "Y",
                );
                this.player.flirted = sent;
                break;
            case "B":
                sent = await this.marriage.romance(
                    "  And just how? :",
                    [
                        "Please let me buy you dinner.  It will be good.",
                        "Let me take you out - I won't expect you to put out!",
                        "No obligations - Just dinner, baby.",
                        "You ever eat at the Red Dragon Inn?  It's on me.",
                        "Come on sweet thing, I know you wanna eat!",
                        "Please?  I'll cook Dragon for ya!",
                    ],
                    [
                        "I'm not a feminist, but I'll pay for it!",
                        "Pleeeeeeeeease let me buy you a warm meal.",
                        "I'll cook it myself!  A woman's place is the kitchen!",
                        "If you're not busy, I'd REALLY apreciate the company.",
                        "I'll give you a real meal - Not crap.",
                        "If you clean your plate, I'll even dance for you!",
                    ],
                    to,
                    "  Somehow you don't think that will turn " + pronoun + " on.",
                    "  `2" + this.player.name + " wants to treat you to dinner!",
                    "U",
                );
                this.player.flirted = sent;
                break;
            case "I":
                sent = await this.marriage.romance(
                    "  Worded how? :",
                    [
                        "Um, do you uh, um, think you could, uh.. wanna do it?",
                        "Glorious girl.  Please be my valentine.  Tonight.",
                        "Come take a ride on the wild stallion, baby!",
                        "Make me a man tonight, honey!  Pleeeeeease?!",
                        "I know you want my body, I know you think I'm sexy...",
                        "I've been waiting to ask you all my life for this.",
                    ],
                    [
                        "I'll pleasure you like no one has ever pleasured a man.",
                        "Say yes, honey.  I swear I'll be here in the morning.",
                        "Say yes.  Your body says yes, listen to it.",
                        "Do it!  I swear I've been tested recently..I think?",
                        "You'll never regret a night spent with me, studmuffin.",
                        "If you say no, I'll never ask again!",
                    ],
                    to,
                    "  Somehow you don't think that will turn " + pronoun + " on.",
                    "  `2" +
                        this.player.name +
                        "`2 wants you to join " +
                        ppronoun +
                        " in a night of\n  `2unbridled passion, in " +
                        ppronoun2 +
                        " room at the Inn.",
                    "I",
                );
                this.player.flirted = sent;
                break;
            case "P":
                if (this.player.cha > 99) {
                    sent = await this._handleProposal(op, to, pronoun, ppronoun2, uppronoun);
                    this.player.flirted = sent;
                }
                break;
        }
        return sent;
    }

    private async _handleProposal(op: LoadedPlayerRecord, to: number, pronoun: string, ppronoun2: string, uppronoun: string): Promise<boolean> {
        const proposeLog: string[] = [
            "`0" + this.player.name + " `2has been smitten - with love.",
            "`0" + this.player.name + " `2is sick - lovesick, that is.",
        ];

        await this.state.getState(false);
        if (
            this.player.married_to > -1 ||
            this.state.married_to_seth === this.player.Record ||
            this.state.married_to_violet === this.player.Record
        ) {
            await this.io.sln();
            await this.io.lln("Er - you sort of ARE married.  That kind of puts a crink in your romantic desires, now doesn't it?");
            await this.io.sln();
            await this.io.moreNoMail();
            return false;
        }
        if (
            op.married_to > -1 ||
            this.state.married_to_seth === op.Record ||
            this.state.married_to_violet === op.Record
        ) {
            await this.io.sln();
            await this.io.lln("`)PROBLEM! `2 You cannot marry a married person!  No way!");
            await this.io.sln();
            await this.io.moreNoMail();
            return false;
        }
        const sent = await this.marriage.romance(
            "  Worded how? :",
            [
                "Would you do me the honor of being my wife?",
                "I love you, " + op.name + ".  Marry me.",
                "Be my wife.  Make me the happiest man in the world.",
                "Please - I've watched you for the longest time..",
                "Say yes!  It's such a wonderful easy word!",
                "I cannot live another day without you.",
            ],
            [
                "Would you do me the honor of being my husband?",
                "I love you, " + op.name + ".  Marry me.",
                "Be mine.  Make me the happiest woman in the world.",
                "Please - I've watched you for the longest time..",
                'Marry me...So I can say "I gotta man!"...',
                "I've put my heart on my sleeve.  Don't break it.",
            ],
            to,
            "  Somehow you don't think that will convince " + pronoun + "...",
            "  `2" +
                this.player.name +
                " has publicly declared " +
                ppronoun2 +
                " love for\n  `2you.  " +
                uppronoun +
                " is asking for your hand in marriage.",
            "P",
        );
        if (sent) {
            await this.log.logLine(proposeLog[random(proposeLog.length)]);
        }
        return sent;
    }

    async composeMail(): Promise<void> {
        let op: LoadedPlayerRecord | null;
        let sent = false;

        await this.io.sln();
        await this.io.sln("Who would you like to send mail to?");
        const to = await this._player.value.findPlayer();
        if (to === -1) {
            this.io.foreground(15);
            await this.io.sln("No matching names found.");
        } else {
            op = this._player.value.playerGet(to);
            if (op && !(await this.promptMailContactAction(to, op))) {
                return;
            }
            if (!(await this.canSendMailTo(to))) {
                return;
            }
            if (op && this.player.sex !== op.sex && !this.player.flirted) {
                const pronoun = op.sex === "M" ? "him" : "her";
                const ch = await this.io.prompt(
                    "  `2Say something `0Romantic`2 to " + pronoun + "`2? : `2[`5N`2] `0: ",
                    [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }],
                    'romantic_confirm',
                    { defaultKey: 'N', leadingBlank: false, trailingBlank: true }
                );
                if (ch === "Y") {
                    const result = await this._sendRomanticMail(op, to);
                    if (result === null) return;
                    sent = result;
                }
                this.player.put();
            }
            await this.io.sln();
            if (!sent) {
                await this.mail.writeMail(to, false);
            }
        }
    }
}

export default Mail;
