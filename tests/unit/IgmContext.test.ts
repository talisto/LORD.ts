import { IgmContext } from '@lordts/igm/IgmContext';
import type { LoadedPlayerRecord } from '@lordts/core/types';

describe('IgmContext.init', () => {
    test('loads the caller record directly without rerunning the parent login flow', async () => {
        const record = { Record: 42, name: 'Baron' } as LoadedPlayerRecord;
        const getState = jest.fn().mockResolvedValue(undefined);
        const player = {
            loadPlayer: jest.fn(),
            playerGet: jest.fn().mockReturnValue(record),
            player: null,
        };
        const context = Object.create(IgmContext.prototype) as IgmContext;

        Object.assign(context, {
            state: { getState },
            player,
        });

        await context.init(42);

        expect(getState).toHaveBeenCalledWith(false);
        expect(player.playerGet).toHaveBeenCalledWith(42);
        expect(player.loadPlayer).not.toHaveBeenCalled();
        expect(player.player).toBe(record);
    });
});
