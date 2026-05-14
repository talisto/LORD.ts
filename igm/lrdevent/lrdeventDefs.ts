/**
 * LRDEVENT - Definitions and Types
 * Ported from LRDEVENT by Joseph Masters, 9/25/95
 */

/** A LORD Event definition from lrdevent.json (decoded from EVENT.DAT) */
export interface LrdEvent {
    message: string;   // line 1 of event message
    message2: string;  // line 2
    message3: string;  // line 3
    log: string;       // log entry (unused in TS port - we have game_log)
    expinc: string;    // formula for experience change
    definc: string;    // formula for defense change
    strinc: string;    // formula for strength change
    hitinc: string;    // formula for hp_max change
    ffinc: string;     // formula for forest fights change
    pfinc: string;     // formula for pvp fights change
    goldinc: string;   // formula for bank gold change
    skillinc: string;  // formula for skill change
    charminc: string;  // formula for charm change
    laysinc: string;   // formula for lays change
    Directed: string;  // targeting: All, Female, Male, Above, Below, Random, Kids, Fields, Inn
    dirvar: number;    // parameter for Directed (level threshold, random denominator, etc.)
    pair: number;      // if > 0, also run this event # (1-indexed) as a paired event
}

/** Config stored in DB under key 'lrdevent' */
export interface LrdEventConfig {
    mode: number;  // 0 = run fixed count per day, 1 = random chance per day
    count: number; // mode=0: # events to run; mode=1: denominator (1-in-N chance each day)
}

export const LRDEVENT_CONFIG_KEY = 'lrdevent';

export const LRDEVENT_CONFIG_DEFAULTS: LrdEventConfig = {
    mode: 1,   // random chance (matches default event.cfg gar=1)
    count: 2,  // denominator=2 → 50% chance per day (matches default gar2=2)
};
