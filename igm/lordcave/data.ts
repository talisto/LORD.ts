/**
 * The L.O.R.D. Cavern v1.7 - Static data
 * Extracted from lordcave.exe (Borland Pascal 7.01) and documentation.
 * Original by Jason Brown, maintained by Donald Tidmore.
 */

/** Per-player IGM record definition for IStorage.create() */
export const LordCave_Defs = [
    { prop: 'lrdrecord', name: 'Lord Player Record #', type: 'SignedInteger', def: -1 },
    { prop: 'day', name: 'Lord Day last played', type: 'Integer', def: 0 },
    { prop: 'searches', name: 'Cave Searches Left', type: 'Integer', def: 0 },
    { prop: 'adoptions', name: 'Kids adopted today', type: 'Integer', def: 0 },
    { prop: 'visits', name: 'Visits today', type: 'Integer', def: 0 },
    { prop: 'was_killed', name: 'Killed during visit', type: 'Boolean', def: false },
    { prop: 'fairy_saved', name: 'Fairy saved player', type: 'Boolean', def: false },
];

export interface CaveRecord {
    lrdrecord: number;
    day: number;
    searches: number;
    adoptions: number;
    visits: number;
    was_killed: boolean;
    fairy_saved: boolean;
    put(): void;
}

/** Default searches per day */
export const DEFAULT_SEARCHES = 15;

/** Max kids before adoption is refused */
export const MAX_KIDS_TOTAL = 16;

/** Default max adoptions per visit */
export const DEFAULT_KIDS_PER_DAY = 4;

/** Kid-loss threshold (if kids > 19, chance of losing some on exit) */
export const KID_LOSS_THRESHOLD = 19;

// ── Bridge Keeper (Troll) questions & answers ──

export interface TrollQuestion {
    question: string;
    answer: string;
}

// Questions prefixed with "What " by display code. Multiline questions use
// \n`! where `! is LORD's "restore to column 1" control code.
export const trollQuestions: TrollQuestion[] = [
    { question: 'is Star Trek\'s Captain Kirk\'s middle name?', answer: 'TIBERIUS' },
    { question: 'thing goes around the world, but stays in the corner?', answer: 'STAMP' },
    { question: 'is the name of Garion\'s sorceress Aunt, in "The Belgariad"?', answer: 'POLGARA' },
    { question: 'was the name of Thorin\'s sword, which was found in the\n`!Troll\'s cave, by Bilbo?', answer: 'ORCRIST' },
    { question: 'was the first name of Luke Skywalker\'s mother?', answer: 'PADME' },
    { question: 'says, "Give me food, and I will live;  give me water,\n`!and I will die?', answer: 'FIRE' },
    { question: 'is Seth Able\'s occupation?', answer: 'BARD' },
    { question: 'animal stinks while it is alive, but smells good in death?', answer: 'PIG' },
    { question: 'is the capital of Canada?', answer: 'OTTAWA' },
    { question: 'was the name of King Arthur\'s famous sword?', answer: 'EXCALIBUR' },
    { question: 'is 7 times 58?', answer: '406' },
    { question: 'object is not wanted by its maker, is not needed \nby its buyer, and is unknown by its user?', answer: 'COFFIN' },
    { question: 'wrote "The Art of Thievery" LORD story?', answer: 'CHANCE' },
    { question: 'was the name of TV\'s most famous German Shepherd hero?', answer: 'RIN TIN TIN' },
    { question: 'was the name of the guy who became the Incredible Hulk?', answer: 'BRUCE BANNER' },
    { question: 'was the first name of Spiderman\'s aunt?', answer: 'MAY' },
    { question: 'was the name of Roy Rogers\'s famous horse?', answer: 'TRIGGER' },
    { question: 'was the nickname people called John Wayne?', answer: 'THE DUKE' },
];

// ── Riddler questions & answers ──

export interface RiddlerQuestion {
    question: string;
    answer: string;
}

export const riddlerQuestions: RiddlerQuestion[] = [
    { question: 'Who was the monster fought by the ancient warrior Beowulf?', answer: 'GRENDEL' },
    { question: 'What gets wetter the more it dries?', answer: 'TOWEL' },
    { question: 'What was the nickname for the Lone Ranger that Tonto Used?', answer: 'KEMO SABE' },
    { question: 'Who did Robin Hood fight on the bridge, to cross a stream?', answer: 'LITTLE JOHN' },
    { question: 'What was the name of TV\'s most famous collie heroine?', answer: 'LASSIE' },
    { question: 'What\'s the longest word in the dictionary?', answer: 'SMILES' },
    { question: 'How do undertakers speak?', answer: 'GRAVELY' },
    { question: 'What was the name of Gene Autry\'s famous horse?', answer: 'CHAMPION' },
    { question: 'What childhood illness can you give away, and still keep?', answer: 'MEASLES' },
    { question: 'Who wrote `%"The Art of Swordfighting" `0LORD story?', answer: 'ARAGORN' },
    { question: 'What thing is full of holes, yet holds water?', answer: 'SPONGE' },
    { question: 'What object did the Lone Ranger give to his friends?', answer: 'SILVER BULLET' },
    { question: 'What is the only dog in the world that doesn\'t bark?', answer: 'HOT DOG' },
    { question: 'What was the name of Roland\'s sword?', answer: 'DURENDAL' },
    { question: 'What was the name of Prince Valiant\'s sword?', answer: 'SINGING SWORD' },
    { question: 'What is Kal-El\'s cold retreat home called?', answer: 'FORTRESS OF SOLITUDE' },
    { question: 'What does Yu-Gi-Oh put his trust in during a duel?', answer: 'HEART OF THE CARDS' },
    { question: 'What is the name of Inuyasha\'s teen-age girl-friend?', answer: 'KAGOME' },
];

// ── Voice lines (scary voice event) ──

export const voiceLines: string[] = [
    '    Dayrel ...  Dayrel ...',
    '    You will never leave ALIVE!  Hahahaha!',
    '    Are you still here?',
    '    Try to walk around ... You might find me!  Ah ha ha ha',
    '    L\'RAJ NAINA!  Hahahahahahaha!',
];

// ── Cave monsters ──

export const caveMonsters: string[] = [
    'an Ogre.',
    'a Werewolf',
    'a Vampire',
    'a Minotaur',
    'a Baby Red Dragon',
    'a Gryphon',
];

// ── Lost children names ──

export const childNames: string[] = [
    'Oliver', 'Jason', 'Donald', 'Suzanne', 'Charlie',
    'Gary', 'Janet', 'Gordon', 'Michael', 'Michelle',
];

// ── Lost warrior names ──

export interface WarriorTemplate {
    name: string;
    sex: 'M' | 'F';
}

export const warriorNames: WarriorTemplate[] = [
    { name: 'Peter', sex: 'M' },
    { name: 'Daphine', sex: 'F' },
];

// ── Skeleton weapon/armour names (higher-tier items from EXE) ──

export const skeletonWeapons: string[] = [
    'Gloves', 'Club', 'Mace', 'Ball & Chain', 'Spear',
    'Short Bow', 'Long Bow', 'Two-Handed Sword', 'Samurai Sword',
    'Viking Axe', 'Holy Blade', 'Demon Claw Blade', 'Fairy Blade',
    'Diana\'s Bow', 'Thor\'s Hammer', 'Excalibar',
    'Gryphon\'s Claw', 'Gandalf\'s Staff', 'Diamond Axe',
    'Titanium Spear', 'Gold Dragon Sword', 'Titanium Sword',
];

export const skeletonArmours: string[] = [
    'Leaves', 'Bear Armour', 'Puma Armour', 'Eagle Armour',
    'Pikeman\'s Mail', 'Rainbow Mail', 'Studded Mail', 'Stone Plate Mail',
    'Samurai Armour', 'Viking Suit', 'Fire Armour', 'Demon\'s Shell',
    'Demon Spike Mail', 'Blessed Armour', 'Zeus\'s Armour', 'Dragon Armour',
    'Hercules\' Coat', 'Turgon\'s Cloak', 'Dragon Scale Armor',
    'Adamantium Armour', 'Mystic Gold Armor', 'Diamond Armour',
];

// ── River shiny items ──

export const riverGemTypes: string[] = [
    '`%-- Emeralds!',
    '`@-- Rubies!',
    '`$-- Sapphires!',
    '`#-- Diamonds!',
];

// ── Skill class names ──

export const skillClassName = (clss: number): string => {
    switch (clss) {
    case 0: return 'Death Knight';
    case 1: return 'Mystical';
    case 2: return 'Thieving';
    default: return 'Death Knight';
    }
};

export const skillFieldName = (clss: number): 'skillw' | 'skillm' | 'skillt' => {
    switch (clss) {
    case 0: return 'skillw';
    case 1: return 'skillm';
    case 2: return 'skillt';
    default: return 'skillw';
    }
};

export const skillUseFieldName = (clss: number): 'levelw' | 'levelm' | 'levelt' => {
    switch (clss) {
    case 0: return 'levelw';
    case 1: return 'levelm';
    case 2: return 'levelt';
    default: return 'levelw';
    }
};
