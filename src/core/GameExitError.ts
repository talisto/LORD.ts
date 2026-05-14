'use strict';

/**
 * Thrown whenever the game needs to end a player session cleanly
 * (e.g. quitting, dying, winning the tournament, connection closed).
 *
 * In server mode this is caught by server.ts's session runner, which
 * cleans up the player record and closes the WebSocket without killing
 * the server process.
 *
 * In CLI mode (lord.ts) it is caught at the top level and the process
 * exits normally.
 */
export class GameExitError extends Error {
    constructor() {
        super('Game session ended');
        this.name = 'GameExitError';
    }
}
