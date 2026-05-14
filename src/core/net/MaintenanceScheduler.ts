/**
 * MaintenanceScheduler - Automatic daily maintenance scheduler for LORD.
 *
 * Polls a configurable nightly time window every second. When the window
 * opens it gracefully closes active sessions, waits for them to finish,
 * runs DailyMaint, then exits maintenance mode until the next day.
 */
import type { Settings } from '../types';

type MaintenanceSchedulerCallbacks = {
    setMaintenanceMode: (active: boolean) => void;
    getActiveSessionCount: () => number;
    closeAllSessions: () => void;
    runMaintenance: () => Promise<void>;
    runDeferredTasks?: () => Promise<void> | void;
};

export class MaintenanceScheduler {
    private interval: ReturnType<typeof setInterval> | null = null;
    private maintenanceModeActive = false;
    private lastRunDayKey: string | null = null;
    private running = false;

    constructor(
        private settings: Pick<Settings, 'maintenance_window_seconds' | 'maintenance_force_disconnect' | 'timezone'>,
        private callbacks: MaintenanceSchedulerCallbacks,
    ) {}

    start(): void {
        if (this.resolveWindowSeconds() <= 0 || this.interval !== null) {
            return;
        }

        this.interval = setInterval(() => {
            void this.tick();
        }, 1000);
        this.interval.unref();
    }

    stop(): void {
        if (this.interval !== null) {
            clearInterval(this.interval);
            this.interval = null;
        }

        if (this.maintenanceModeActive) {
            this.maintenanceModeActive = false;
            this.callbacks.setMaintenanceMode(false);
        }
    }

    async tick(now: Date = new Date()): Promise<void> {
        if (this.callbacks.runDeferredTasks) {
            await this.callbacks.runDeferredTasks();
        }

        const windowSeconds = this.resolveWindowSeconds();
        if (windowSeconds <= 0) {
            if (this.maintenanceModeActive) {
                this.maintenanceModeActive = false;
                this.callbacks.setMaintenanceMode(false);
            }
            return;
        }

        const { dayKey, secondsSinceMidnight } = this.resolveTimeParts(now);
        // Window is 00:00:00 to maintenance_window_seconds past midnight (e.g. 300 = first 5 min)
        const inWindow = secondsSinceMidnight < windowSeconds;

        if (!inWindow) {
            if (this.maintenanceModeActive) {
                this.maintenanceModeActive = false;
                this.callbacks.setMaintenanceMode(false);
            }
            return;
        }

        if (!this.maintenanceModeActive) {
            this.maintenanceModeActive = true;
            this.callbacks.setMaintenanceMode(true);
        }

        if (this.lastRunDayKey === dayKey || this.running) {
            return;
        }

        // Defer maintenance until all sessions drain naturally (or force-close if configured)
        const activeSessions = this.callbacks.getActiveSessionCount();
        if (activeSessions > 0) {
            if (this.settings.maintenance_force_disconnect === true) {
                this.callbacks.closeAllSessions();
            }
            return;
        }

        this.running = true;
        try {
            await this.callbacks.runMaintenance();
            this.lastRunDayKey = dayKey;
        } finally {
            this.running = false;
        }
    }

    private resolveWindowSeconds(): number {
        const value = this.settings.maintenance_window_seconds;
        if (typeof value !== 'number' || isNaN(value) || value <= 0) {
            return 0;
        }

        return Math.floor(value);
    }

    private resolveTimeParts(now: Date): { dayKey: string; secondsSinceMidnight: number } {
        if (this.settings.timezone) {
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: this.settings.timezone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
            });
            const parts = formatter.formatToParts(now);
            const values: Record<string, string> = {};
            for (const part of parts) {
                if (part.type !== 'literal') {
                    values[part.type] = part.value;
                }
            }

            const year = values.year || String(now.getUTCFullYear());
            const month = values.month || '01';
            const day = values.day || '01';
            const hour = Number.parseInt(values.hour || '0', 10);
            const minute = Number.parseInt(values.minute || '0', 10);
            const second = Number.parseInt(values.second || '0', 10);

            return {
                dayKey: year + '-' + month + '-' + day,
                secondsSinceMidnight: hour * 3600 + minute * 60 + second,
            };
        }

        return {
            dayKey: [
                now.getFullYear(),
                String(now.getMonth() + 1).padStart(2, '0'),
                String(now.getDate()).padStart(2, '0'),
            ].join('-'),
            secondsSinceMidnight: now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds(),
        };
    }
}