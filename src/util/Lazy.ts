/**
 * Lazy<T> - A simple deferred-value container for dependency injection.
 *
 * Wraps a factory function so that the underlying value is resolved on first
 * access (or on every access when the source may change, such as a mutable
 * reference like `player`).
 *
 * Usage:
 *   const lazyPlayer = new Lazy(() => context.player!);
 *   // later …
 *   lazyPlayer.value;  // calls the factory each time
 */

'use strict';

export class Lazy<T> {
    private readonly _factory: () => T;

    constructor(factory: () => T) {
        this._factory = factory;
    }

    /** Resolve and return the underlying value. */
    get value(): T {
        return this._factory();
    }
}

export default Lazy;
