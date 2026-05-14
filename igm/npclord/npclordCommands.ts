/**
 * NPC CLI Commands for lordctl
 *
 * Exposes NPC management operations (list, create, delete) as IGM commands
 * discoverable by lordctl via the IgmCommand interface.
 */
import * as path from 'path';
import * as fs from 'fs';
import type { IgmCommand, IgmCommandContext } from '@lordts/igm/IgmCommand';
import { Player_Def } from '@lordts/storage/RecordDefs';

/** Default starting stats for a new NPC - mirrors NPCGEN.PAS initial values. */
function npcDefaults(npcName: string, sex: string): Record<string, unknown> {
    const clss = 1 + Math.floor(Math.random() * 3); // 1=DK, 2=Thief, 3=Mage
    return {
        name:          npcName,
        real_name:     npcName,
        sex:           sex,
        clss:          clss,
        level:         1,
        hp:            20,
        hp_max:        20,
        str:           10,
        def:           1,
        cha:           3,
        exp:           1,
        gold:          500,
        bank:          0,
        gem:           0,
        weapon:        'Stick',
        weapon_num:    1,
        arm:           'Nothing!',
        arm_num:       0,
        forest_fights: 15,
        pvp_fights:    3,
        dead:          false,
        inn:           false,
        on_now:        false,
        is_npc:        true,
    };
}

function cmdList({ storage }: IgmCommandContext): void {
    const playerFile = storage.create('players', Player_Def);
    const len = playerFile.length;

    let count = 0;
    for (let i = 0; i < len; i++) {
        const rec = playerFile.get(i);
        if (!rec) continue;
        if (!rec.is_npc) continue;
        if (rec.name === 'X') continue;
        if (count === 0) {
            process.stdout.write(['#'.padEnd(4), 'Name'.padEnd(20), 'Lv'.padEnd(4),
                'HP'.padEnd(8), 'Exp'.padEnd(12), 'Sex'].join('  ') + '\n');
            process.stdout.write('-'.repeat(60) + '\n');
        }
        process.stdout.write([
            String(i).padEnd(4),
            (rec.name as string).padEnd(20),
            String(rec.level).padEnd(4),
            (String(rec.hp) + '/' + String(rec.hp_max)).padEnd(8),
            String(rec.exp).padEnd(12),
            rec.sex as string,
        ].join('  ') + '\n');
        count++;
    }
    if (count === 0) {
        process.stdout.write('No NPC players found. Use "npc create" to add one.\n');
    } else {
        process.stdout.write('\n' + count + ' NPC(s).\n');
    }
}

function cmdCreate({ basePath, storage, args }: IgmCommandContext): void {
    let name = args[0];
    if (!name) {
        const namesPath = path.join(basePath, 'igm', 'npclord', 'NAMES.TXT');
        if (fs.existsSync(namesPath)) {
            const names = fs.readFileSync(namesPath, 'utf8')
                .split(/\r?\n/).filter(l => l.trim() !== '');
            if (names.length > 0) {
                name = names[Math.floor(Math.random() * names.length)];
            }
        }
        if (!name) {
            process.stderr.write('Error: No name given and could not load igm/npclord/NAMES.TXT\n');
            process.exit(1);
        }
    }

    const playerFile = storage.create('players', Player_Def);

    // Check for duplicate name
    const nameLower = name.toLowerCase();
    for (let i = 0; i < playerFile.length; i++) {
        const rec = playerFile.get(i);
        if (!rec) continue;
        if ((rec.name as string).toLowerCase() === nameLower && rec.name !== 'X') {
            process.stderr.write('Player "' + name + '" already exists.\n');
            process.exit(1);
        }
    }

    const chosenSex = args[1]?.toUpperCase() === 'F' ? 'F' : 'M';
    const rec = playerFile.new();
    if (!rec) {
        process.stderr.write('Error: Failed to create new player record\n');
        process.exit(1);
    }

    const defaults = npcDefaults(name, chosenSex);
    for (const [k, v] of Object.entries(defaults)) {
        rec[k] = v;
    }
    rec.put();

    process.stdout.write('NPC "' + name + '" (' + chosenSex + ', class ' + String(rec.clss) + ') created at record #' + String(rec.Record) + '.\n');
}

function cmdDelete({ storage, args }: IgmCommandContext): void {
    const name = args[0];
    if (!name) {
        process.stderr.write('Usage: npc delete <name>\n');
        process.exit(1);
    }

    const playerFile = storage.create('players', Player_Def);
    const len = playerFile.length;
    const target = name.toLowerCase();
    let found = false;

    for (let i = 0; i < len; i++) {
        const rec = playerFile.get(i);
        if (!rec) continue;
        if ((rec.name as string).toLowerCase() !== target) continue;
        if (rec.name === 'X') continue;

        found = true;
        const savedName = rec.name as string;
        // Soft-delete: name='X' tombstones the record. LORD's fixed-record player
        // file reuses slots when name === 'X', matching original LORDUTIL DELETE.
        rec.name = 'X';
        rec.real_name = 'X';
        rec.on_now = false;
        rec.put();
        process.stdout.write('NPC "' + savedName + '" deleted.\n');
        break;
    }

    if (!found) {
        process.stderr.write('NPC "' + name + '" not found.\n');
        process.exit(1);
    }
}

export const NPC_COMMANDS: IgmCommand[] = [
    {
        name: 'list',
        description: 'List all NPC players',
        handler: cmdList,
    },
    {
        name: 'create',
        description: 'Create an NPC player (random name if omitted)',
        usage: '[name] [M|F]',
        handler: cmdCreate,
    },
    {
        name: 'delete',
        description: 'Delete an NPC player',
        usage: '<name>',
        handler: cmdDelete,
    },
];
