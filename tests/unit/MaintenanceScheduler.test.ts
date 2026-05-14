import { MaintenanceScheduler } from '@lordts/core/net/MaintenanceScheduler';

describe('MaintenanceScheduler', () => {
    test('runs maintenance once per day during the configured window', async () => {
        const setMaintenanceMode = jest.fn();
        const runMaintenance = jest.fn().mockResolvedValue(undefined);
        const scheduler = new MaintenanceScheduler(
            {
                maintenance_window_seconds: 60,
                maintenance_force_disconnect: false,
                timezone: 'UTC',
            },
            {
                setMaintenanceMode,
                getActiveSessionCount: () => 0,
                closeAllSessions: jest.fn(),
                runMaintenance,
            },
        );

        await scheduler.tick(new Date('2026-04-25T00:00:10Z'));
        expect(setMaintenanceMode).toHaveBeenCalledWith(true);
        expect(runMaintenance).toHaveBeenCalledTimes(1);

        await scheduler.tick(new Date('2026-04-25T00:00:20Z'));
        expect(runMaintenance).toHaveBeenCalledTimes(1);

        await scheduler.tick(new Date('2026-04-25T00:01:10Z'));
        expect(setMaintenanceMode).toHaveBeenLastCalledWith(false);

        await scheduler.tick(new Date('2026-04-26T00:00:10Z'));
        expect(runMaintenance).toHaveBeenCalledTimes(2);
    });

    test('postpones maintenance while sessions remain active when forced disconnects are disabled', async () => {
        let activeSessions = 1;
        const runMaintenance = jest.fn().mockResolvedValue(undefined);
        const scheduler = new MaintenanceScheduler(
            {
                maintenance_window_seconds: 60,
                maintenance_force_disconnect: false,
                timezone: 'UTC',
            },
            {
                setMaintenanceMode: jest.fn(),
                getActiveSessionCount: () => activeSessions,
                closeAllSessions: jest.fn(),
                runMaintenance,
            },
        );

        await scheduler.tick(new Date('2026-04-25T00:00:10Z'));
        expect(runMaintenance).not.toHaveBeenCalled();

        activeSessions = 0;
        await scheduler.tick(new Date('2026-04-25T00:00:20Z'));
        expect(runMaintenance).toHaveBeenCalledTimes(1);
    });

    test('disconnects active sessions before running maintenance when forced disconnects are enabled', async () => {
        let activeSessions = 2;
        const closeAllSessions = jest.fn().mockImplementation(() => {
            activeSessions = 0;
        });
        const runMaintenance = jest.fn().mockResolvedValue(undefined);
        const scheduler = new MaintenanceScheduler(
            {
                maintenance_window_seconds: 60,
                maintenance_force_disconnect: true,
                timezone: 'UTC',
            },
            {
                setMaintenanceMode: jest.fn(),
                getActiveSessionCount: () => activeSessions,
                closeAllSessions,
                runMaintenance,
            },
        );

        await scheduler.tick(new Date('2026-04-25T00:00:10Z'));
        expect(closeAllSessions).toHaveBeenCalledTimes(1);
        expect(runMaintenance).not.toHaveBeenCalled();

        await scheduler.tick(new Date('2026-04-25T00:00:20Z'));
        expect(runMaintenance).toHaveBeenCalledTimes(1);
    });

    test('runs deferred tasks on scheduler ticks even outside the maintenance window', async () => {
        const runDeferredTasks = jest.fn().mockResolvedValue(undefined);
        const runMaintenance = jest.fn().mockResolvedValue(undefined);
        const scheduler = new MaintenanceScheduler(
            {
                maintenance_window_seconds: 60,
                maintenance_force_disconnect: false,
                timezone: 'UTC',
            },
            {
                setMaintenanceMode: jest.fn(),
                getActiveSessionCount: () => 0,
                closeAllSessions: jest.fn(),
                runDeferredTasks,
                runMaintenance,
            },
        );

        await scheduler.tick(new Date('2026-04-25T12:00:00Z'));

        expect(runDeferredTasks).toHaveBeenCalledTimes(1);
        expect(runMaintenance).not.toHaveBeenCalled();
    });
});