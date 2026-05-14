'use strict';

/**
 * AdminNotify - Sends one-shot admin notifications via SMTP.
 *
 * If SMTP is not configured the function returns silently - it is always safe
 * to call even in installations without email support.
 *
 * A flag file at `flagPath` prevents duplicate notifications: the email is
 * sent only when the flag file does not yet exist.  The flag is created
 * immediately after a successful (or attempted) send so that subsequent
 * logins do not re-send.  Delete the flag file (or pass `force = true`) to
 * allow re-sending (e.g. after a game reset).
 */

import * as fs from 'fs';
import * as nodemailer from 'nodemailer';

interface SmtpConfig {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
    to: string;
}

function loadSmtpConfig(): SmtpConfig | null {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM;
    const to   = process.env.SMTP_TO;
    if (!host || !user || !pass || !from || !to) return null;
    const port   = parseInt(process.env.SMTP_PORT   || '587', 10);
    const secure = process.env.SMTP_SECURE === 'true';
    return { host, port, secure, user, pass, from, to };
}

/**
 * Send a game-over notification to the admin and create `flagPath` to
 * prevent duplicate emails on subsequent logins.
 *
 * @param winnerName  - In-game name of the player who won
 * @param flagPath    - Absolute path to the dedup flag file (e.g.
 *                      `runtime/gameover_notified`)
 * @param force       - If true, skip the flag-file check and always send
 */
export async function sendGameOverNotification(
    winnerName: string,
    flagPath: string,
    force: boolean = false,
): Promise<void> {
    // Check flag file to avoid sending on every subsequent login
    if (!force && fs.existsSync(flagPath)) {
        return;
    }

    // Write the flag unconditionally so that a broken SMTP config doesn't
    // spam the admin with error-retry attempts on every login.
    try {
        fs.writeFileSync(flagPath, new Date().toISOString() + '\n', { flag: 'w' });
    } catch (_e) {
        // If we cannot write the flag we still attempt the email, but log a
        // warning so the operator knows something is off with file permissions.
        console.error('[AdminNotify] Warning: could not write flag file:', flagPath);
    }

    const cfg = loadSmtpConfig();
    if (!cfg) {
        // SMTP not configured - silently skip
        return;
    }

    const transporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: { user: cfg.user, pass: cfg.pass },
    });

    const subject = 'LORD: Game Over - Reset Required';
    const body = [
        'The Legend of the Red Dragon game has ended!',
        '',
        `Winner: ${winnerName}`,
        '',
        'The game is now locked. Players will see the winner screen on login',
        'and cannot continue playing until the game is reset.',
        '',
        'To reset the game (keeping all player accounts but resetting their',
        'in-game progress to level 1), run:',
        '',
        '  node lord.js --reset-game',
        '',
        'This resets all player stats (exp, level, equipment, etc.) while',
        'preserving usernames, passwords, and character names/class/sex.',
        '',
        'State changes made by --reset-game:',
        '  • state.won_by reset to -1 (game unlocked)',
        '  • state.days reset to 0 (tournament timer restarted if active)',
        '  • All player combat stats reset to starting values',
        '',
    ].join('\n');

    try {
        await transporter.sendMail({
            from: cfg.from,
            to:   cfg.to,
            subject,
            text: body,
        });
    } catch (err) {
        // Non-fatal - game can still operate without email delivery
        const e = err as Error;
        console.error('[AdminNotify] Failed to send game-over email:', e.message);
    }
}
