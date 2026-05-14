import { WebSocketSession } from '@lordts/core/net/WebSocketSession';

describe('WebSocketSession', () => {
    test('accepts input up to the configured buffer limit', async () => {
        const session = new WebSocketSession();

        session.deliverKeys('AB');

        await expect(session.getkey()).resolves.toBe('A');
        await expect(session.getkey()).resolves.toBe('B');
    });

    test('closes the session when buffered input exceeds the safety limit', async () => {
        const session = new WebSocketSession();
        const overflowHandler = jest.fn<void, [string]>();

        session.setInputOverflowHandler(overflowHandler);
        session.deliverKeys('A'.repeat(4096));
        session.deliverKeys('B');

        expect(overflowHandler).toHaveBeenCalledWith(expect.stringContaining('input buffer exceeded'));
        await expect(session.getkey()).resolves.toBe('CONNECTION_CLOSED');
    });
});
