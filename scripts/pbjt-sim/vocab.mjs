// Verb + noun vocabulary extracted from the game.js parser (if-ladder at ~1535),
// THING_WORDS (~471), slice phrasings (resolveThing ~501), and TYPO_FIXES (~444).
// Used to generate seeded-random instructions covering the verb x object cross
// product, plus adversarial permutations.

// --- seedable PRNG (mulberry32): same seed -> same stream -----------------
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// --- VERBS -----------------------------------------------------------------
// arity: 0 = no object, 1 = one object, 2 = two objects (connective forms).
// Each verb lists trigger templates; {x}/{y} are filled with noun phrases.
export const VERBS = [
  { v: 'open',     arity: 1, tpl: ['open the {x}', 'unscrew the {x}', 'uncap the {x}', 'untwist the {x}', 'take the lid off the {x}', 'remove the lid from the {x}'] },
  { v: 'close',    arity: 1, tpl: ['close the {x}', 'seal the {x}', 'shut the {x}', 'screw the {x}'] },
  { v: 'spread',   arity: 2, tpl: ['spread {x} on the {y}', 'smear {x} on the {y}', 'slather {x} onto the {y}'] },
  { v: 'stir',     arity: 1, tpl: ['stir the {x}'] },
  { v: 'sprinkle', arity: 2, tpl: ['sprinkle the {x}', 'sprinkle {x} on the {y}', 'season the {y} with {x}', 'dust the {x}'] },
  { v: 'drizzle',  arity: 1, tpl: ['drizzle honey on the {x}', 'drizzle the {x}'] },
  { v: 'tear',     arity: 1, tpl: ['tear the {x}', 'rip the {x}', 'split the {x}'] },
  { v: 'fold',     arity: 1, tpl: ['fold the {x}'] },
  { v: 'bite',     arity: 1, tpl: ['bite the {x}', 'nibble the {x}'] },
  { v: 'flip',     arity: 1, tpl: ['flip the {x}', 'turn over the {x}', 'turn the {x}'] },
  { v: 'squeeze',  arity: 1, tpl: ['squeeze the {x}'] },
  { v: 'shake',    arity: 1, tpl: ['shake the {x}'] },
  { v: 'pour',     arity: 2, tpl: ['pour the {x}', 'pour the {x} on the {y}', 'dump the {x}', 'empty the {x}'] },
  { v: 'tip',      arity: 1, tpl: ['tip over the {x}', 'knock over the {x}', 'topple the {x}'] },
  { v: 'stand',    arity: 1, tpl: ['stand the {x} up', 'set the {x} upright', 'stand up the {x}'] },
  { v: 'throw',    arity: 1, tpl: ['throw the {x}', 'toss the {x}', 'yeet the {x}', 'chuck the {x}', 'hurl the {x}', 'fling the {x}', 'lob the {x}'] },
  { v: 'stab',     arity: 1, tpl: ['stab the {x}'] },
  { v: 'roll',     arity: 1, tpl: ['roll the {x}', 'roll over the {x}'] },
  { v: 'squish',   arity: 1, tpl: ['squish the {x}', 'smash the {x}', 'flatten the {x}', 'crush the {x}', 'press the {x}', 'mash the {x}'] },
  { v: 'swap',     arity: 2, tpl: ['swap the {x} and the {y}', 'switch the {x} with the {y}', 'exchange the {x} for the {y}'] },
  { v: 'spin',     arity: 1, tpl: ['spin the {x}', 'rotate the {x}', 'twirl the {x}'] },
  { v: 'hide',     arity: 1, tpl: ['hide the {x}'] },
  { v: 'give',     arity: 1, tpl: ['give me the {x}', 'hand me the {x}', 'pass me the {x}'] },
  { v: 'putback',  arity: 1, tpl: ['put the {x} back', 'put it back'] },
  { v: 'puton',    arity: 2, tpl: ['put the {x} on the {y}', 'place the {x} onto the {y}', 'set the {x} on top of the {y}', 'lay the {x} on the {y}', 'move the {x} on the {y}', 'balance the {x} on the {y}', 'rest the {x} on the {y}', 'drop the {x} on the {y}', 'put the {x} in the {y}', 'stick the {x} into the {y}'] },
  { v: 'slide',    arity: 1, tpl: ['slide the {x}', 'push the {x}', 'shove the {x}', 'scoot the {x} left', 'nudge the {x} right'] },
  { v: 'pickup',   arity: 1, tpl: ['pick up the {x}', 'grab the {x}', 'take the {x}', 'hold the {x}', 'snatch the {x}', 'yank the {x}', 'swipe the {x}'] },
  { v: 'cut',      arity: 1, tpl: ['cut the {x}', 'saw the {x}', 'halve the {x}'] },
  { v: 'smell',    arity: 1, tpl: ['smell the {x}', 'sniff the {x}'] },
  { v: 'lick',     arity: 1, tpl: ['lick the {x}', 'taste the {x}', 'kiss the {x}'] },
  { v: 'pat',      arity: 1, tpl: ['pat the {x}', 'pet the {x}', 'boop the {x}'] },
  { v: 'slap',     arity: 1, tpl: ['slap the {x}'] },
  { v: 'lookat',   arity: 1, tpl: ['look at the {x}', 'inspect the {x}', 'examine the {x}', 'stare at the {x}', 'zoom in on the {x}', 'show me the {x}'] },
  { v: 'point',    arity: 1, tpl: ['point at the {x}', 'point to the {x}'] },
  { v: 'weigh',    arity: 1, tpl: ['weigh the {x}', 'measure the {x}'] },
  { v: 'use',      arity: 2, tpl: ['use the {x} on the {y}'] },
  { v: 'dipknife', arity: 0, tpl: ['dip the knife into the {x}', 'load the knife with {x}', 'scoop {x} with the knife'] },
  { v: 'takeout',  arity: 0, tpl: ['take the slices out of the bag', 'take out two slices', 'pull slices out', 'get a slice out of the bag'] },
  { v: 'stack',    arity: 0, tpl: ['put the slices together', 'stack the slices', 'close the sandwich', 'make the sandwich', 'assemble the sandwich', 'press the slices together', 'squish the slices together', 'slap the slices together'] },
  { v: 'putdown',  arity: 0, tpl: ['put it down', 'set it down', 'drop', 'let go', 'release'] },
  { v: 'wipe',     arity: 0, tpl: ['wipe the counter', 'clean up', 'tidy up', 'mop'] },
  { v: 'count',    arity: 0, tpl: ['count the slices', 'how many slices'] },
  { v: 'cook',     arity: 0, tpl: ['cook the sandwich', 'bake it', 'fry the bread', 'grill it', 'microwave the sandwich', 'boil it', 'toast the bread'] },
  { v: 'ambient',  arity: 0, tpl: ['wave', 'clap', 'dance', 'wash your hands', 'high five', 'wait', 'drink', 'eat', 'juggle', 'zoom out', 'help'] },
];

// --- NOUNS -----------------------------------------------------------------
// Canonical object phrasings the parser resolves (THING_WORDS + slices + "it").
export const NOUNS = [
  'peanut butter', 'pb', 'jelly', 'jam', 'peanut butter lid', 'jelly lid',
  'knife', 'butter knife', 'mustard', 'ketchup', 'catsup', 'mayo', 'mayonnaise',
  'honey', 'butter', 'banana', 'apple', 'salt', 'pepper', 'cereal', 'oats',
  'mug', 'cup', 'whisk', 'spatula', 'rolling pin', 'roller', 'crock',
  'shelf', 'pantry', 'counter', 'table', 'plate', 'dish', 'bag', 'loaf', 'bread',
  'left hand', 'right hand',
  // slice phrasings
  'slice', 'left slice', 'right slice', 'the other slice', 'both slices',
  'slices', 'piece of bread', 'piece of toast', 'sandwich', 'first slice',
  'second slice', 'peanut butter slice', 'jelly slice',
  // anaphora
  'it', 'that', 'this',
];

// "Spreadable" nouns make sense as the {x} of spread/sprinkle/etc.
export const SPREADS = ['peanut butter', 'pb', 'jelly', 'jam', 'honey', 'mayo', 'mustard', 'ketchup', 'butter'];

// Typo'd nouns drawn from TYPO_FIXES — adversarial misspellings the normalizer
// is expected to repair.
export const TYPO_NOUNS = [
  'peenut buter', 'pnut', 'peannut', 'butterr', 'jellie', 'jeli', 'jelyl', 'jaam',
  'knive', 'nife', 'kniffe', 'knfe', 'sandwhich', 'sammich', 'samwich',
  'bred', 'braed', 'banannna', 'mayonaise', 'musterd', 'ketsup', 'kethcup',
  'cerial', 'ceareal', 'hunny', 'honney', 'spachula', 'spatuala', 'peice',
  'slise', 'slisec', 'palte', 'plat', 'countr', 'counterr',
];

// Vague/ambiguous phrasings that trigger the literal-misinterpretation gags.
// Worth fuzzing across arbitrary world states (slices out or not, jars open or
// not) to confirm the gag handlers always settle to a render-ready scene.
export const VAGUE_GAGS = [
  'take a piece of bread out of the bag',
  'take a piece of bread',
  'tear a piece of bread off',
  'scoop a little jelly out of the jar',
  'scoop a tiny bit of peanut butter',
  'scoop out some peanut butter',
  'scoop out some jelly',
  'use the knife to scoop out some peanut butter, then put it on the bread',
  'spread the peanut butter on the face of the bread',
  'smear jelly on the face of the bread',
  'spread the peanut butter and the jelly on different slices of bread',
  'cut the sandwich into two pieces',
  'cut the bread into two pieces',
  'cut the sandwich down the middle',
  'take the jelly',
  'take the peanut butter',
  'take the knife',
];

// Adversarial / degenerate inputs.
export const GARBAGE = [
  '', ' ', '   ', '.', '!?', 'asdfghjkl', 'the the the', 'on', 'with', 'and',
  'put the on the', 'spread on', 'open', 'close', 'throw', 'give me',
  '🍞🥜', 'a'.repeat(300), 'do the thing', 'make me a sandwich please now',
  'it', 'that', 'this', 'put it back', 'spread it on it', 'use it on it',
];
