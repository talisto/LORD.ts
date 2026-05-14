/**
 * DailyMaintenanceRunner - Headless daily maintenance entry point for LORD.
 *
 * Bootstraps a minimal GameContext with a no-op ISession and invokes
 * DailyMaint. Used by the lordctl CLI tool and the test harness to run
 * maintenance without an active player session.
 */
import { GameContext } from './GameContext';
import { GameRoundResetService } from './GameRoundResetService';
import type { ISession, ConsoleAttr, GetstrOptions } from './types';

class HeadlessSession implements ISession {
    attr: ConsoleAttr = { value: 7 };
    rows = 24;
    cols = 80;
    ansiSupported = false;
    ansi = false;

    private _lastActivityTime = Date.now();
    get lastActivityTime(): number { return this._lastActivityTime; }

    puts(_s: string): void { }
    write(_s: string): void { }
    print(_s: string): void { }
    center(_s: string): void { }
    gotoxy(_x: number, _y: number): void { }
    clear(): void { }
    cleareol(): void { }
    flush(): void { }

    getkey(): Promise<string> { return Promise.resolve('\r'); }
    getstr(_mode?: GetstrOptions): Promise<string> { return Promise.resolve(''); }
    inkey(_timeout?: number): string | undefined { return undefined; }
    waitkey(_timeout?: number): Promise<boolean> { return Promise.resolve(false); }
    deliverKeys(_str: string): void { }
    closeConnection(): void { }
}

export class DailyMaintenanceRunner {
    static async run(basePath: string): Promise<{ dayBefore: number; dayAfter: number }> {
        const session = new HeadlessSession();
        const ctx = new GameContext(basePath, session, '__maint__');
        ctx.user.noTimeout = true;

        const io = ctx.io as unknown as Record<string, unknown>;
        io.more = async (): Promise<void> => {};
        io.moreNoMail = async (): Promise<void> => {};
        ctx.display.morechk = false;

        return this.runContext(ctx, basePath);
    }

    static async runContext(
        ctx: Pick<GameContext, 'state' | 'log' | 'settings' | 'storage' | 'fileUtils'>,
        basePath: string,
        resetRound: typeof GameRoundResetService.reset = (resetBasePath, options) => GameRoundResetService.reset(resetBasePath, options),
    ): Promise<{ dayBefore: number; dayAfter: number }> {
        await ctx.state!.getState(false);

        const dayBefore = ctx.state!.days;
        // Reset log_date so createLog sees a day change and rotates the news log
        ctx.state!.log_date = 0;
        ctx.state!.putState();
        await ctx.log.createLog(false);

        // won_by is a player record index; >= 0 means someone slew the dragon
        if (ctx.settings.auto_reset_won_round === true && ctx.state!.won_by >= 0) {
            resetRound(basePath, {
                storage: ctx.storage,
                notificationFlagPath: ctx.fileUtils.runtimeFilePath('gameover_notified'),
            });
            await ctx.state!.getState(false);
        }

        return {
            dayBefore,
            dayAfter: ctx.state!.days,
        };
    }
}