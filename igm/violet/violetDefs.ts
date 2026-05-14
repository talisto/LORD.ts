/**
 * Violet's Cottage - Definitions
 * An IGM for Legend of the Red Dragon
 * Original by Trevor Herndon (v5.20), ported to TypeScript
 */

export interface RecordDef {
    prop: string;
    name?: string;
    type: string;
    def: unknown;
}

export interface VioletRecord {
    lrdrecord: number;
    day: number;
    visited: boolean;
    cookReady: boolean;
    put(): void;
}

export const Violet_Defs: RecordDef[] = [
    {
        prop: 'lrdrecord',
        name: 'Lord Player Record #',
        type: 'SignedInteger',
        def: -1
    },
    // Default 123456 is an impossible day number, ensuring the first-visit
    // reset logic always triggers (real days start at 1)
    {
        prop: 'day',
        name: 'Lord Day last played.',
        type: 'Integer',
        def: 123456
    },
    {
        prop: 'visited',
        name: 'Visited today?',
        type: 'Boolean',
        def: false
    },
    {
        prop: 'cookReady',
        name: 'Cook will serve food?',
        type: 'Boolean',
        def: false
    }
];

export interface GossipRecord {
    text: string;
    put(): void;
}

export const Gossip_Defs: RecordDef[] = [
    {
        prop: 'text',
        name: 'Gossip text',
        type: 'String:40',
        def: ''
    }
];

/** LOG_SEPARATOR is appended after each log entry in LORD's daily log */
export const LOG_SEPARATOR = '`>`.`2-`0=`2-`0=`2-`0=`2-';

/** Hardcoded gossip entries written to GOSSIP.VLT on first creation */
export const DEFAULT_GOSSIP = [
    'Man, that Seth Able is a real GOON!',
    'Violet wants to go out with Halder!',
    'Sandtiger is really Kato Kaelin!',
];
