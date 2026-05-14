/**
 * The L.O.R.D. Cavern v1.7 - Random Cave Events
 * Extracted from lordcave.exe strings and documentation.
 */
import { random, prettyInt } from '@lordts/util/Util';
import type IO from '@lordts/core/io/IO';
import type Player from '@lordts/core/Player';
import type Log from '@lordts/core/Log';
import type { Settings } from '@lordts/core/types';
import {
    voiceLines, trollQuestions, riddlerQuestions, childNames, warriorNames,
    skeletonWeapons, skeletonArmours, riverGemTypes,
    caveMonsters, skillClassName, skillUseFieldName,
    MAX_KIDS_TOTAL,
} from './data';
import type { CaveRecord } from './data';

function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}

/**
 * Approximate the original's percentage-based stat modification.
 * FUN_315b_0c6f + FUN_32e9_46e4/46d0 chain: random fraction of stat, minimum 1.
 */
function percentMod(stat: number): number {
    if (stat <= 0) return 0;
    return Math.max(1, random(stat));
}

// ── Events 1-6 ──

/** Nothing happens */
export async function eventNothing(io: IO): Promise<void> {
    await io.sln();
    await io.lln('`2You walk down a tunnel, but end up back where you started.');
}

/** Scary voice */
export async function eventVoice(io: IO): Promise<void> {
    await io.sln();
    await io.lln('`2While walking down a tunnel, you hear a scary voice.');
    await io.lln('`3It says `!"');
    await io.lln('`3' + voiceLines[random(voiceLines.length)]);
    await io.lln('`6...`!"`%.');
    await io.lln('`2You become frightened, and run back the way you came.');
}

/** Fall down a cliff */
export async function eventFall(io: IO, player: Player): Promise<void> {
    await io.sln();
    await io.lln('`3You\'re going down a tunnel when suddenly `%');
    await io.lln('`@You fall down a cliff!', 4);
    await io.lln('`3Fortunately, you landed on a narrow ledge, about 20 feet down.');
    await io.lln('`@Unfortunately, you sprained your ankle.', 4);
    await io.lln('`3The hard climb back up the cliff makes you feel `7weaker.');

    const strLoss = Math.min(30, percentMod(player.str));
    player.str = clamp(player.str - strLoss, 0, 32000);
    await io.lln('`2You `#LOSE `%' + strLoss + ' `0Strength points!', 4);

    const hpLoss = percentMod(player.hp);
    player.hp = clamp(player.hp - hpLoss, 1, player.hp_max);
    await io.lln('`2You `#LOSE `%' + hpLoss + ' `0Hit Points!', 4);
}

/** Vampire Bats */
export async function eventBats(io: IO, player: Player): Promise<void> {
    await io.sln();
    await io.lln('`7You run into some `@Vampire Bats`0!');
    await io.lln('`3They fight like demons!', 4);
    await io.lln('`7One almost bites your neck!');
    await io.lln('`3You kill the last blood-sucking varmint!', 4);
    await io.lln('`%You suddenly feel `0Stronger.', 4);

    const strGain = Math.min(25, percentMod(player.str));
    player.str = clamp(player.str + strGain, 0, 32000);
    await io.lln('`0You `#GAIN `%' + strGain + ' `!Strength points!');

    await io.lln('`3Your expertise with your `@' + player.weapon + ' `3increases.', 4);
}

/** River event - random(115)+1 with 7 sub-outcomes per decompiled FUN_1000_2cf1 */
export async function eventRiver(io: IO, player: Player): Promise<void> {
    await io.sln();
    await io.lln('`#You find an underground River!');
    await io.lln('`7You are a little bit `%Thirsty `6... ', 4);
    await io.lw('`2  Do you want to take a drink?');
    await io.lw('  `0[`#Y`0/`5n`0] `3');
    io.emitPrompt('lordcave_river_drink', [
        { key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' },
    ]);
    const ch = (await io.getkey()).toUpperCase();

    if (ch === 'N') {
        await io.sln();
        await io.lln('`2you walk back the way you came, still thirsty.');
        return;
    }

    await io.sln();
    await io.lln('`#You bend down to take a drink and `%', 4);

    // Decompiled event flow uses a 1..115 roll with clustered branches for
    // heals, losses, and a few larger penalty/reward outcomes.
    const roll = random(115) + 1;
    if (roll <= 25) {
        // Forest fights gain (level*4) + heal if HP < max
        await io.lln('`2As you drink, you observe that the water tastes great!');
        const ffGain = clamp(player.level * 4, 0, 32000 - player.forest_fights);
        if (ffGain > 0) {
            player.forest_fights = clamp(player.forest_fights + ffGain, 0, 32000);
            await io.lln('`$You `#GAIN `%' + ffGain + ' `$Forest Fights`%!');
        }
        if (player.hp < player.hp_max) {
            player.hp = player.hp_max;
            await io.lln('`!As you stand up, you notice your injuries have `#vanished!', 4);
            await io.lln('`2You feel regenerated.', 4);
        }
    } else if (roll <= 30) {
        // Simple heal
        if (player.hp < player.hp_max) {
            await io.lln('`2The water tastes great, and has quenched your thirst.');
            await io.lln('`!As you stand up, you notice your injuries have `#vanished!', 4);
            player.hp = player.hp_max;
        } else {
            await io.lln('`9A ghostly voice says, `6"You have no wounds for me to heal."');
        }
    } else if (roll <= 55) {
        // Fall in river - lose ALL gold and gems + HP loss
        await io.lln('`2You fall into the river, and are swept downstream!');
        await io.lln('`3Fortunately, you are a good swimmer.  But unfortunately, all of your `$Gold and Gems `3fell out of your pockets!', 4);
        if (player.gem > 0) await io.lln('`%You `#LOSE `$' + player.gem + ' `%Gems`@!');
        if (player.gold > 0) await io.lln('`%You `#LOSE `$' + player.gold + ' `%Gold Coins`@!');
        player.gem = 0;
        player.gold = 0;
        await io.lln('`3You struggle to swim to safety, and finally succeed. ', 4);
        await io.lln('`3You are weakened by the stress from nearly drowning to death.', 4);
        const hpLoss = percentMod(player.hp);
        player.hp = clamp(player.hp - hpLoss, 1, player.hp_max);
        await io.lln('`%You `#LOSE `0' + hpLoss + ' `%Hit-Points`@!');
    } else if (roll <= 60) {
        // Simple heal
        if (player.hp < player.hp_max) {
            await io.lln('`2The water tastes great, and has quenched your thirst.');
            await io.lln('`!As you stand up, you notice your injuries have `#vanished!', 4);
            player.hp = player.hp_max;
        } else {
            await io.lln('`9A ghostly voice says, `6"You have no wounds for me to heal."');
        }
    } else if (roll <= 85) {
        // Fish bite - charm loss (level*8)
        await io.lln('`2A fish jumps out of the water, and bites you on the nose!');
        await io.lln('`#Oops!  `7You look really silly and weird now.', 4);
        const chaLoss = Math.min(player.level * 8, player.cha);
        player.cha = clamp(player.cha - chaLoss, 0, 32000);
        await io.lln('`%You `@LOSE `$' + chaLoss + ' `0Charm points!');
        await io.lln('`3As you stop your nose bleed, you think about a `2Fish supper `6...', 4);
    } else if (roll <= 90) {
        // Simple heal
        if (player.hp < player.hp_max) {
            await io.lln('`2The water tastes great, and has quenched your thirst.');
            await io.lln('`!As you stand up, you notice your injuries have `#vanished!', 4);
            player.hp = player.hp_max;
        } else {
            await io.lln('`9A ghostly voice says, `6"You have no wounds for me to heal."');
        }
    } else {
        // Stress - HP loss (percentage-based)
        await io.lln('`2The current pulls you under!  You barely manage to escape!');
        await io.lln('`3You are weakened by the stress from nearly drowning to death.', 4);
        const hpLoss = percentMod(player.hp);
        player.hp = clamp(player.hp - hpLoss, 1, player.hp_max);
        await io.lln('`#You `%LOSE `!' + hpLoss + ' `0Hit-Points!');
    }
}

// ── Events 7-15 ──

/** Find Skeleton */
export async function eventSkeleton(
    io: IO, player: Player, log: Log,
): Promise<void> {
    await io.sln();
    await io.lln('`2You find the `@Skeleton `2of a Warrior.');
    await io.lln('`3You can see several items of use on it `6...', 4);
    await io.sln();
    await io.lln('`2What will you do?');
    await io.lln('`@(`!S`@)teal something');
    await io.lln('`@(`!L`@)et it `%R`@est `%I`@n `%P`@eace');

    io.emitPrompt('lordcave_skeleton', [
        { key: 'S', label: 'Steal something' }, { key: 'L', label: 'Let it rest' },
    ]);
    let ch: string;
    do {
        ch = (await io.getkey()).toUpperCase();
    } while (ch !== 'S' && ch !== 'L');

    if (ch === 'L') {
        await io.sln();
        await io.lln('`0You showed respect for a fallen warrior. `#');
        await io.lln('`%A ghostly voice says, `!"Thank you for respecting my grave."', 4);
        const chaGain = random(3) + 1;
        player.cha = clamp(player.cha + chaGain, 0, 32000);
        await io.lln('`2You `$GAIN `%' + chaGain + ' `2Charm points!', 4);
        await io.lln('`6You feel strange here, and so you leave.');
        return;
    }

    // Steal something
    await io.sln();
    await io.lln('`2You reach down and grab');

    // Skeleton loot splits into four categories: gems, gold, weapon, or armor.
    const stealType = random(4);
    if (stealType === 0) {
        // Gems
        await io.lln('`%some sparkling `$Gems`%!', 1);
        const gemGain = random(5) + 1;
        player.gem = clamp(player.gem + gemGain, 0, 32000);
        await io.lln('`$You found `#' + gemGain + ' `!pretty `0Gems.', 4);
    } else if (stealType === 1) {
        // Gold
        await io.lln('`%some `$Gold`%!', 1);
        const goldGain = random(50) + 10;
        player.gold = clamp(player.gold + goldGain, 0, 2000000000);
        await io.lln('`#But not much.  Only `$' + goldGain + '`# Coins.');
    } else if (stealType === 2) {
        // Weapon
        const weapIdx = Math.min(player.weapon_num + 1, skeletonWeapons.length - 1);
        const weapName = skeletonWeapons[weapIdx];
        await io.lln('`%a strange looking Weapon.', 1);
        await io.lln('`!Some engraved rune writing on it calls it a `@' + weapName, 4);
        if (weapIdx <= player.weapon_num) {
            await io.lln('`#Sorry, but you already have a `@' + player.weapon);
            // Whiskey consolation
            await io.lln('`!As you start to walk away from the `%Skeleton, `!you notice a ');
            await io.lln('`!small `%green bottle `!on the ground, which you pick up.  The ');
            await io.lln('`!label says that it is `$Scotch Whiskey. ');
            await io.lln('`0Naturally, you drink it quickly.  It tastes awesome.', 3);
            const strGain = random(3) + 1;
            player.str = clamp(player.str + strGain, 0, 32000);
            await io.lln('`$You `!GAIN `@' + strGain + ' `0Strength points`%!');
        } else {
            await io.lln('`!You grab the `@' + weapName + '`! from the still clutching hand.');
            await io.lln('`0You see that it is better than your old `@' + player.weapon);
            player.weapon = weapName;
            player.weapon_num = weapIdx;
            const strGain = random(3) + 1;
            player.str = clamp(player.str + strGain, 0, 32000);
            await io.lln('`$You `!GAIN `@' + strGain + ' `0Strength points!', 4);

            await log.logLine(
                '`$' + player.name + ' `0got a `@' + weapName + '`0 from the `#Skeleton `!today, \n`0while visiting `@The L.O.R.D. Cavern, `0and is enjoying the new weapon. '
            );
        }
        await io.lln('`#You leave the `@' + player.weapon + '`#, but have a feeling about it `6...');
    } else {
        // Armour
        const armIdx = Math.min(player.arm_num + 1, skeletonArmours.length - 1);
        const armName = skeletonArmours[armIdx];
        await io.lln('`9a strange looking `$Armour.', 1);
        await io.lln('`!Some engraved rune writing on it calls it a `@' + armName, 4);
        if (armIdx <= player.arm_num) {
            await io.lln('`#Sorry, but you already have a `@' + player.arm);
            await io.lln('`!As you start to walk away from the `%Skeleton, `!you notice a ');
            await io.lln('`!small `%blue bottle `!on the ground, which you pick up.  The ');
            await io.lln('`!label says that it is `$Red Dragon Vodka.');
            await io.lln('`0You waste no time in drinking it.  You feel great afterwards.', 3);
            const defGain = random(3) + 1;
            player.def = clamp(player.def + defGain, 0, 32000);
            await io.lln('`$You `!GAIN `@' + defGain + ' `0Defense points`%!', 4);
        } else {
            await io.lln('`!You grab the `@' + armName);
            await io.lln('`!from the dead body.', 1);
            await io.lln('`0You realize it is better than your old `@' + player.arm);
            player.arm = armName;
            player.arm_num = armIdx;
            const defGain = random(3) + 1;
            player.def = clamp(player.def + defGain, 0, 32000);
            await io.lln('`#You `!GAIN `@' + defGain + ' `#Defense points!', 4);

            await log.logLine(
                '`$' + player.name + ' `0got a `@' + armName + '`0 from the `#Skeleton `!today, while \n`0visiting `@The L.O.R.D. Cavern, `0and is enjoying the new armour. '
            );
        }
        await io.lln('`#You leave the `@' + player.arm + '`#, but have a feeling about it `6...');
    }
}

/** Cave Monster */
export async function eventMonster(io: IO, player: Player): Promise<void> {
    const monsterName = caveMonsters[random(caveMonsters.length)];
    await io.sln();
    await io.lln('`3You run into a `2Cave Monster`3!');
    await io.lln('`%It is `$' + monsterName, 4);
    await io.lln('`3It fights very well!');
    await io.lln('`@It almost hits you!', 4);
    await io.lln('`3Finally, you kill it with a mighty blow to its neck.');

    const defGain = random(3) + 2;
    player.def = clamp(player.def + defGain, 0, 32000);
    await io.lln('`%You feel more protected by your `$' + player.arm + '`%now.', 4);
    await io.lln('`2You `#GAIN `0' + defGain + ' `!Defense points!');

    // Baby Red Dragon special text
    if (monsterName.includes('Baby Red Dragon')) {
        await io.lln('`0Suddenly, you hear an eerie voice.  It says,');
        await io.lln('`#"I hope for your sake that the baby\'s `@Father `#isn\'t nearby!"', 4);
        await io.lln('`%The thought that it might have been the `@RED DRAGON\'s ');
        await io.lln('`%child leaves you petrified with fear.');
        const strLoss = random(2) + 1;
        player.str = clamp(player.str - strLoss, 0, 32000);
        await io.lln('`0You `#LOSE `!' + strLoss + ' `#Strength points!');
    }
}

/** Trip over a rock */
export async function eventTrip(io: IO, player: Player): Promise<void> {
    await io.sln();
    await io.lln('`#You\'re going down a tunnel when all of the sudden `% ');
    await io.lln('`3You trip over a Rock, and fall down onto the ground!', 4);
    await io.lln('`#Fortunately, you didn\'t break anything.');
    await io.lln('`3Your poor body is a little bruised, and aches some.', 4);
    const defLoss = Math.min(30, percentMod(player.def));
    player.def = clamp(player.def - defLoss, 0, 32000);
    await io.lln('`2You `#LOSE `%' + defLoss + ' `!Defense points!');
}

/** Find Oliver (adoption event) */
export async function eventOliver(
    io: IO, player: Player, log: Log, caveRecord: CaveRecord,
    kidsPerDay: number,
): Promise<void> {
    const childName = childNames[random(childNames.length)];
    const childSex = random(2) === 0 ? 'M' : 'F';
    const pronoun = childSex === 'M' ? 'he' : 'she';
    const pronounCap = childSex === 'M' ? 'He' : 'She';
    const himHer = childSex === 'M' ? 'him' : 'her';

    await io.sln();
    await io.lln('`9You start walking down a tunnel, when suddenly you hear something');
    await io.lln('`9crying.  You find the source.  It\'s one of the `@Lost Children!');
    await io.lln('`1"`2Where are your parents?," `2you ask `9' + childName + '.');
    await io.lln('`0"My parents were killed by the `@Red Dragon!, `#' + pronounCap, 4);
    await io.lln('`0replies.', 1);
    await io.lln('`!"My name is `%' + childName + '," `#' + pronoun + ' `!adds.');
    await io.lln('`!You feel sorry for the orphaned child.', 3);

    // Check adoption limits
    if (player.kids >= MAX_KIDS_TOTAL) {
        await io.lln('`%As you are about to say `$Yes, `%you remember a new `#Town Law.', 1);
        await io.lln('`2Which says, `$"One may not adopt more than `#' + MAX_KIDS_TOTAL + ' `$kids."  `%So,', 3);
        await io.lln('`%you take `@' + childName + ' `%to the `3Cave\'s `%exit, and tell ' + himHer + ' `%where', 1);
        await io.lln('`%' + pronoun + ' can get cleaned up.', 1);
        await io.lln('`!The `#King\'s Orphanage `!will find a good home for `$' + childName);
        const expGain = random(20) + 5;
        player.exp = clamp(player.exp + expGain, 0, 2000000000);
        await io.lln('`$Still, you `#GAIN `@' + expGain + ' `0Experience points `$for your kindness.');
        await log.logLine(
            '`$' + player.name + ' `0found a child in the `@Cavern `0and escorted `3' + childName + "\n`0to the King's Orphanage.  The child's name is `#" + childName
        );
        return;
    }

    if (caveRecord.adoptions >= kidsPerDay) {
        await io.sln();
        await io.lln('`0After you agree to adopt `%' + childName);
        await io.lln('`0you remember the new `#Town Ordinance, `0which', 1);
        await io.lln('`0says that, `%"One may not adopt more than `@' + kidsPerDay + ' `0Kids per day."');
        await io.lln('`!So, you take `$' + childName + ' `!to the `@Cavern\'s `!exit, and give `9' + himHer, 4);
        await io.lln('`!directions to the `#Orphanage. `%They will give the little child', 4);
        await io.lln('`!a good home.', 4);
        const expGain = random(10) + 5;
        player.exp = clamp(player.exp + expGain, 0, 2000000000);
        await io.lln('`$For being kind to orphans, you `#GAIN `$' + expGain + ' `!Experience points!', 4);
        return;
    }

    // Offer adoption
    await io.lw('  `! "Will you adopt `@' + childName);
    await io.lw('`!" and take `$' + himHer + '`! home with you?');
    await io.lw('  `0[`#Y`0/`5n`0] `3');
    io.emitPrompt('lordcave_adopt_orphan', [
        { key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' },
    ]);
    const ch = (await io.getkey()).toUpperCase();

    if (ch === 'N') {
        await io.sln();
        await io.lln('`2You comfort `$' + childName + ' `2, but you feel guilty');
        await io.lln('`2about leaving ' + himHer + ' `2alone in the `3Cavern.');
        const chaLoss = random(3) + 1;
        player.cha = clamp(player.cha - chaLoss, 0, 32000);
        await io.lln('`@You `%LOSE `!' + chaLoss + ' `@Charm points!');
        await io.lln('`#Shame on you for abandoning a poor orphan!', 4);
        await log.logLine(
            '`$' + player.name + ' `0found a lost child in the `@Cavern,  `0but `!' + player.name + ' `0left\n`0poor, `#' + childName + ' `0there!  So very heartless!'
        );
        return;
    }

    // Adopt the child
    player.kids = player.kids + 1;
    caveRecord.adoptions = caveRecord.adoptions + 1;
    caveRecord.put();

    const sonDaughter = childSex === 'M' ? 'Son' : 'Daughter';
    await io.sln();
    if (player.sex === 'F') {
        await io.lln('`%Your maternal instincts kick in, and you adopt `2' + childName);
    } else {
        await io.lln('`%You take pity on `2' + childName + ' `%and adopt `$' + himHer, 4);
    }
    await io.lln('`2You help your new `$child `2out of the `@Cavern.');
    await io.lln('`$You just `#GAINED a new `$' + sonDaughter + ', `9' + childName + '`$!', 4);

    const expGain = random(15) + 5;
    player.exp = clamp(player.exp + expGain, 0, 2000000000);

    await log.logLine(
        '`$' + player.name + ' `0found a child in the `#Cavern `0and adopted `9' + childName + "\n`%" + player.name + " `$new " + sonDaughter + "'s `0name is `9" + childName
    );
}

/** Find Warrior (Peter/Daphine encounter) */
export async function eventWarrior(
    io: IO, player: Player, log: Log, settings: Settings,
): Promise<void> {
    // Pick warrior matching opposite sex
    const template = player.sex === 'M'
        ? warriorNames.find(w => w.sex === 'F') ?? warriorNames[1]
        : warriorNames.find(w => w.sex === 'M') ?? warriorNames[0];

    const wName = template.name;
    const wSex = template.sex;

    await io.sln();
    await io.lln('`3While walking down the tunnel, you see something moving in the');
    await io.lln('`3shadows.  `%Then a Warrior jumps out of them to face you`0!');
    await io.lln('`!"Hail, `%Warrior!  `!My name is `%' + wName, 4);
    await io.lln('`9`$"I have been lost in here for quite some time!"`%', 4);
    await io.lln('`$"If you help me out, I\'ll make it worth your time!');

    if (wSex === 'F') {
        if (random(2) === 0) {
            await io.lln('`0. `0She is a tall, beautiful warrior, obviously a lady. `$');
        } else {
            await io.lln('`0. `0She is awesome looking, with superb cleavage! `$');
        }
        await io.lw('  Will you help her out?');
    } else {
        if (random(2) === 0) {
            await io.lln('`0. `0He is a handsome, strong warrior, obviously a gentleman. `$');
        } else {
            await io.lln('`0. `0His muscular body makes you feel weak in the knees! `$');
        }
        await io.lw('  Will you help him out?');
    }

    await io.lw('  `0[`#Y`0/`5n`0] `3');
    io.emitPrompt('lordcave_help_warrior', [
        { key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' },
    ]);
    const ch = (await io.getkey()).toUpperCase();

    if (ch === 'N') {
        await io.sln();
        await io.lln('`2You run away, as fast as you can!  `@Scare-dy-cat!');
        await io.lln('`0You\'re so scared that you wet yourself!  Very messy!', 4);
        return;
    }

    // Help the warrior
    await io.sln();
    await io.lln('`2You tell `%' + wName + ' `2the way out of the `#Cavern.');
    await io.lln('`3"Thank you,', 1);
    await io.lln('I have a room at the `$Inn.  `3Meet me there," `#' + wName + ' says.');
    await io.lln('`7The warrior\'s voice is very stimulating, and seductive.', 4);
    await io.lln('`%You walk off together towards the `#Cave\'s `%entrance `6...');
    await io.lln('`2You can\'t wait for that encounter with ' + wName, 4);

    // Check if married or clean mode
    const isMarried = player.married_to >= 0;
    const isClean = !!settings.clean_mode;

    if (isMarried || isClean) {
        await io.sln();
        await io.lln('`#' + (isClean ? 'Clean Encounter!' : 'Romantic Encounter!'), 5);
        await io.lln('`%You arrive at the `9Warrior\'s `%room, back at the Inn.');
        await io.lln('`!You sit down next to `$' + wName + ' `!at the table.');
        if (isMarried) {
            await io.lln('`#You begin to kiss, but then you remember `$your spouse.');
        }
        await io.lln('`!You spend all night talking with `0' + wName + ' `!about the `@Red Dragon`2.', 4);

        await log.logLine(
            '`$' + player.name + ' `%met the `!Lost Warrior `0' + wName + ' `%at the `@LORD Inn.'
        );
    } else {
        await io.sln();
        await io.lln('`#Romantic Encounter!', 5);
        await io.lln('`%You arrive at the `9Warrior\'s `%room, back at the Inn.');
        await io.lln('`%You open the door, and there stands `@' + wName + ' `%waiting for you.', 4);
        await io.lln('`%Nude!', 1);
        await io.lln('`!You follow `$' + wName + ' `!to the bed, and `#' + wName);
        await io.lln('`!proceeds to undress you.', 1);
        await io.lln('`%You make wild, passionate love with `#' + wName + ' `%for a few hours`0!');

        player.laid = player.laid + 1;
        const expGain = random(20) + 10;
        player.exp = clamp(player.exp + expGain, 0, 2000000000);
        await io.lln('`$You `#GAIN `0' + expGain + ' `$Experience points!', 3);
        await io.lln('`$You `#GAIN `$1 Lay point.', 3);

        await log.logLine(
            '`$' + player.name + ' `%got laid by `!Lost Warrior `0' + wName + ' `%at the `@LORD Inn.'
        );
    }
}

/** Bridge Keeper (Troll) */
export async function eventTroll(io: IO, player: Player): Promise<void> {
    await io.sln();
    await io.lln('`0Up ahead you see a deep canyon with a bridge across it.  As you');
    await io.lln('`0approach, a small `@Troll `0jumps out from underneath the `%bridge.');
    await io.lln('`@"STOP!!  `2You `%MUST `2answer me these `$3 `%questions, `2\'ere the ');
    await io.lln('`2other side ye may see." `0he says.');
    await io.lln('`%You say, `%"Ask away, oh Bridge-Keeper."');

    // Question 1: Name
    await io.lln('`!"What is your name?," `2he asks.');
    await io.lln('`2You reply, "`$' + player.name + '."');

    // Question 2: Quest
    await io.lln('`!"What is your quest?," `2he asks.');
    await io.lln('`2You reply, "`0To kill the `@Red Dragon`2.`0"');

    // Question 3: Random trivia
    const q = trollQuestions[random(trollQuestions.length)];
    const prefix = random(2) === 0 ? '`!"What `0' : '`!"Who `0';
    await io.lln(prefix + q.question);
    await io.lln('`%", `7he asks you.');
    await io.lw('`#Well? `%');
    io.emitPrompt('lordcave_troll_answer', [], 'line');
    const answer = await io.getstr({ max: 30 });
    const answerUp = answer.toUpperCase().trim();

    if (answerUp === q.answer) {
        await io.sln();
        await io.lln('`0"That\'s right!  `!Very good!  You may pass," `2he says.');
        await io.lln('`3You merrily skip, and run across the canyon\'s bridge.');
        await io.lln('`7You feel great, having outwitted the Troll!');
        const expGain = random(20) + 10;
        player.exp = clamp(player.exp + expGain, 0, 2000000000);
        await io.lln('`$You `#GAIN `0' + expGain + ' `$Experience points!');
    } else {
        await io.sln();
        await io.lln('`0"`2I don\'t know that!`0"`2 you scream!');
        await io.lln('`0"`@WRONG!  `#You get tossed in the pit!`0"`@, he screams!');
        await io.lln('`0"`2No!  Wait! AHHHHHHHHH!`0"`2, you scream back!');

        if (random(2) === 0) {
            const hpLoss = random(10) + 5;
            player.hp_max = clamp(player.hp_max - hpLoss, 1, 32000);
            player.hp = Math.min(player.hp, player.hp_max);
            await io.lln('`@You awake later covered in mud, and without `$' + hpLoss);
            await io.lln('`0Max HitPoints`@!', 1);
        } else {
            const expLoss = random(20) + 5;
            player.exp = clamp(player.exp - expLoss, 0, 2000000000);
            await io.lln('`@You awake later immersed in mud, `6...');
            await io.lln('`0and without `$' + expLoss, 4);
            await io.lln('`0Experience points`@!', 1);
        }
        await io.lln('`#You climb out of the pit, and search for adventure again.');
    }
}

/** The Riddler */
export async function eventRiddler(io: IO, player: Player): Promise<void> {
    await io.sln();
    await io.lln('`2While walking down a tunnel, a strange man in green pajamas,');
    await io.lln('`2with question marks printed all over them, jumps out at you.');
    await io.lln('`0"`%I am the `0Riddler`2!`0"`2 he crackles.');
    await io.lln('`0"`%Yeah, Ok.  Let me by now `6..., `0"`2you say to the strange man.', 4);
    await io.lln('`0"`#No!  `2First you must riddle me this `6...');

    await io.lln('`%??  ??  ??  ??  ??  ??  ??  ??  ??  ??  ??  ??  ??  ??  ??  ??  ??');

    const q = riddlerQuestions[random(riddlerQuestions.length)];
    await io.lln('`0' + q.question, 1);

    await io.lln('`$??  ??  ??  ??  ??  ??  ??  ??  ??  ??  ??  ??  ??  ??  ??  ??  ??');
    await io.lw('`0  Well? `%');
    io.emitPrompt('lordcave_riddler_answer', [], 'line');
    const answer = await io.getstr({ max: 40 });
    const answerUp = answer.toUpperCase().trim();

    if (answerUp === q.answer) {
        await io.sln();
        await io.lln('`0"`@NO!!  `#You got it right!  `@AHHHHHHH!`0"`#');
        await io.lln('`3He vanishes in a puff of smoke!', 4);
        await io.lln('`0You notice that he left his Cane behind.');
        await io.lln('`3You pick it up, and it `!glows brightly, `3and then vanishes.', 4);
        await io.lln('`#You feel that you have learned something from this encounter. `6...');

        // Random reward: experience, heal, defense, max HP, or skill use
        const reward = random(5);
        if (reward === 0) {
            const expGain = random(20) + 10;
            player.exp = clamp(player.exp + expGain, 0, 2000000000);
            await io.lln('`$You `#GAIN `!' + expGain, 4);
            await io.lln('`$Experience points!', 1);
        } else if (reward === 1) {
            if (player.hp >= player.hp_max) {
                await io.lln('`9A ghostly voice says, `6"You have no wounds for me to heal."');
                const defGain = random(3) + 1;
                player.def = clamp(player.def + defGain, 0, 32000);
                await io.lln('`2"So you are `#granted `!' + defGain, 4);
                await io.lln('`2Defense points `%instead.', 1);
            } else {
                player.hp = player.hp_max;
                await io.lln('`$You feel a lot better!  `2Your wounds were `@HEALED!', 4);
            }
        } else if (reward === 2) {
            const hpGain = random(5) + 1;
            player.hp_max = clamp(player.hp_max + hpGain, 1, 32000);
            await io.lln('`3You feel like you can take more Hits!');
            await io.lln('`2You `#GAIN `!' + hpGain, 4);
            await io.lln('`%Max Hit-Points!', 1);
        } else if (reward === 3) {
            const defGain = random(3) + 1;
            player.def = clamp(player.def + defGain, 0, 32000);
            await io.lln('`3Suddenly, your `!' + player.arm + ' `3is bathed in golden light.');
            await io.lln('`2You `#GAIN `!' + defGain + ' `2Defense points.', 4);
        } else {
            // Skill use increase
            const skillField = skillUseFieldName(player.clss);
            const currentUse = (player as Record<string, unknown>)[skillField] as number;
            if (currentUse >= 100) {
                await io.lln('`%An eerie voice says, `!"Sorry, your reward can not be granted."');
                await io.lln('`#You have reached your limit of `%100 `$' + skillClassName(player.clss) + ' Skill Uses.');
            } else {
                const gain = random(3) + 1;
                const newUse = Math.min(currentUse + gain, 100);
                (player as Record<string, unknown>)[skillField] = newUse;
                await io.lln('`9You feel a strange, tingling energy envelop your body `6...');
                await io.lln('`%You sense that your special abilities have `0increased.');
                await io.lln('`@Your `$' + skillClassName(player.clss) + ' `!Skill Uses `%rose to `0' + newUse + ' `%points.', 4);
            }
        }
    } else {
        // Wrong answer
        await io.sln();
        await io.lln('`0"`@WRONG!  Hahahahahaha!`0"`2 the strange man laughs.');

        const penalty = random(4);
        if (penalty === 0) {
            await io.lln('`%He points his cane at you, and a `@Lightning Bolt `%hits you!');
            await io.lln('`@Your heart falters, and you feel `%Weaker!');
            const hpLoss = random(5) + 1;
            player.hp_max = clamp(player.hp_max - hpLoss, 1, 32000);
            player.hp = Math.min(player.hp, player.hp_max);
            await io.lln('`$You `#LOSE `!' + hpLoss, 4);
            await io.lln('`$Max Hit-Points!', 1);
            await io.lln('`%Your heart attack leaves you weakened, but alive.');
        } else if (penalty === 1) {
            await io.lln('`%Your body trembles and spasms, and you feel `@Weaker!');
            await io.lln('`2He screams hysterically, and then runs away laughing!');
            await io.lln('`#Looks like you just had a `@Seizure.');
            // Lose skill uses
            const skillField = skillUseFieldName(player.clss);
            const currentUse = (player as Record<string, unknown>)[skillField] as number;
            if (currentUse <= 0) {
                await io.lln('`%An eerie voice says, `!"You are `#LUCKY, `!no penalty this time."');
                await io.lln('`#You no longer have any `$' + skillClassName(player.clss) + ' `#Skill Uses to lose.');
            } else {
                const loss = random(3) + 1;
                const newUse = Math.max(currentUse - loss, 0);
                (player as Record<string, unknown>)[skillField] = newUse;
                await io.lln('`@Your `!' + skillClassName(player.clss) + ' `!Skill Uses `%drop down to `0' + newUse + ' `%points!');
            }
        } else {
            await io.lln('`%He points his cane at you, and a `@Lightning Bolt `%hits you!');
            await io.lln('`@Your heart falters, and you feel `%Weaker!');
            await io.lln('`2He runs away screaming hysterically!');
            const hpLoss = random(5) + 1;
            player.hp_max = clamp(player.hp_max - hpLoss, 1, 32000);
            player.hp = Math.min(player.hp, player.hp_max);
            await io.lln('`$You `#LOSE `!' + hpLoss, 4);
            await io.lln('`$Max Hit-Points!', 1);
        }
        await io.lln('`3You find your way back to the main tunnel.');
    }
}

/** Shiny River (reach in for object) - random(100)+1 per decompiled FUN_1000_aa62 */
export async function eventShinyRiver(io: IO, player: Player): Promise<void> {
    await io.sln();
    await io.lln('`!You come upon a river.  The river continues into a small hole.');
    await io.lln('`3You can see something `$shiny `3at the bottom of the river.');
    await io.lw('`!    Do you want to reach in for the shiny object?');
    await io.lw('  `0[`#Y`0/`5n`0] `3');
    io.emitPrompt('lordcave_shiny_river', [
        { key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' },
    ]);
    const ch = (await io.getkey()).toUpperCase();

    if (ch === 'N') {
        await io.sln();
        await io.lln('`9You leave the shiny thing to be a mystery `6...');
        await io.lln('`%Sometimes, a warrior is smart to control their curiousity `6...');
        return;
    }

    await io.sln();
    await io.lln('`3You reach in and grab `%');

    const roll = random(100) + 1;
    if (roll <= 25) {
        // Gems - 4 types scaled by level
        const gemType = random(4) + 1;
        let gemAmount: number;
        let gemName: string;
        if (gemType === 1) {
            gemAmount = player.level * 2;
            gemName = riverGemTypes[0];
        } else if (gemType === 2) {
            gemAmount = player.level * 3;
            gemName = riverGemTypes[1];
        } else if (gemType === 3) {
            gemAmount = player.level * 4;
            gemName = riverGemTypes[2];
        } else {
            gemAmount = player.level * 5;
            gemName = riverGemTypes[3];
        }
        if (player.gem >= 32000) gemAmount = 0;
        const actualGain = clamp(gemAmount, 0, 32000 - player.gem);
        if (actualGain <= 0) {
            await io.lln('`%several shiny, but worthless, quartz pebbles.', 4);
            await io.lln('`%You wash your hands and move onward.', 5);
        } else {
            await io.lln(gemName);
            await io.lln('`#' + actualGain + ' `%beautiful `0Gems ', 3);
            player.gem = clamp(player.gem + actualGain, 0, 32000);
        }
    } else if (roll <= 50) {
        // Gold - level * 1000
        const goldAmount = player.level * 1000;
        if (player.level === 1) {
            await io.lln('`9one `$1,000-dollar Gold Coin! ', 3);
        } else {
            await io.lln('`!' + player.level + ' `#1,000-dollar `$Gold Coins!', 3);
        }
        const actualGain = clamp(goldAmount, 0, 2000000000 - player.gold);
        player.gold = clamp(player.gold + actualGain, 0, 2000000000);
        await io.lln('`0You add `$' + prettyInt(actualGain) + ' `!Gold Coins `0to your pouch.');
    } else if (roll <= 70) {
        // Charm gain - level * 4, capped at 24
        await io.lln('`0A strange, glowing `$Emerald Necklace!', 4);
        await io.lln('`3When you put the necklace on, you feel more `#attractive.');
        let chaGain = Math.min(24, player.level * 4);
        chaGain = clamp(chaGain, 0, 32000 - player.cha);
        player.cha = clamp(player.cha + chaGain, 0, 32000);
        await io.lln('`!You `#GAIN `%' + chaGain + ' `$Charm Points!', 4);
    } else if (roll <= 85) {
        // Nothing valuable
        if (random(2) === 0) {
            await io.lln('`%several shiny, but worthless, quartz pebbles.', 4);
        } else {
            await io.lln('`0A worthless handful of silty mud!', 3);
        }
        await io.lln('`%You wash your hands and move onward.', 5);
    } else {
        // Heal or HP loss (50/50)
        await io.lln('`0a small, yellow glass bottle.', 4);
        await io.lln('`%You can see a green liquid inside.', 4);
        await io.lln('`3Taking a chance, you open it, and drink it. `6...');
        if (random(2) === 0) {
            if (player.hp < player.hp_max) {
                await io.lln('`2You feel much better!  `%Your `#wounds `%were `@HEALED!', 4);
                player.hp = player.hp_max;
            } else {
                await io.lln('`9A ghostly voice says, `6"You have no wounds for me to heal."');
            }
        } else {
            await io.lln('`7Suddenly, you feel sick at your stomach, and throw up.', 4);
            const hpLoss = percentMod(player.hp);
            player.hp = clamp(player.hp - hpLoss, 1, player.hp_max);
            await io.lln('`@You `%LOSE `!' + hpLoss + ' `@Hit-Points!');
        }
    }
}
