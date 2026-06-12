// Deterministic instruction generator. Given a seed, emits a reproducible
// stream of {raw, verb, nouns[]} actions mixing four modes:
//   - sequence:    a sensible recipe run (open bag -> take slices -> spread...)
//   - permutation: verb x noun cross product (sensible + absurd pairings)
//   - typo:        verbs over misspelled nouns from TYPO_FIXES
//   - garbage:     empty/degenerate/anaphora-without-antecedent inputs
import { makeRng, pick, VERBS, NOUNS, SPREADS, TYPO_NOUNS, GARBAGE, VAGUE_GAGS } from './vocab.mjs';

const SENSIBLE_RECIPE = [
  'open the bag',
  'take the slices out of the bag',
  'open the peanut butter',
  'dip the knife into the peanut butter',
  'spread peanut butter on the left slice',
  'open the jelly',
  'spread jelly on the right slice',
  'put the slices together',
  'cut the sandwich',
];

function fill(tpl, x, y) {
  return tpl.replace('{x}', x).replace('{y}', y || x);
}

// Build one action from the chosen mode.
function genOne(rng, mode) {
  if (mode === 'garbage') {
    const raw = pick(rng, GARBAGE);
    return { raw, verb: 'garbage', nouns: [] };
  }

  if (mode === 'gag') {
    const raw = pick(rng, VAGUE_GAGS);
    return { raw, verb: 'gag', nouns: [] };
  }

  const spec = pick(rng, VERBS);
  const tpl = pick(rng, spec.tpl);

  if (spec.arity === 0) {
    // 0-arity templates may still contain {x} (dipknife/sprinkle variants) — fill from spreads.
    const x = pick(rng, SPREADS);
    return { raw: fill(tpl, x), verb: spec.v, nouns: tpl.includes('{x}') ? [x] : [] };
  }

  const pool = mode === 'typo' ? TYPO_NOUNS : NOUNS;
  // For spread/sprinkle/drizzle, bias {x} toward an actual spreadable so we hit
  // the "correct" branches too, while {y} ranges over everything.
  const xPool = ['spread', 'sprinkle', 'drizzle', 'dipknife'].includes(spec.v) && mode !== 'typo'
    ? (rng() < 0.6 ? SPREADS : pool) : pool;
  const x = pick(rng, xPool);
  const y = spec.arity === 2 ? pick(rng, pool) : null;
  return { raw: fill(tpl, x, y), verb: spec.v, nouns: spec.arity === 2 ? [x, y] : [x] };
}

// Generate `count` actions from `seed`. Interleaves a fresh sensible recipe
// every ~25 actions so coherent multi-step state (open jars, slices out) is
// exercised, not just isolated permutations on a pristine world.
export function* generate(seed, count) {
  const rng = makeRng(seed);
  let recipeStep = 0;
  let sinceRecipe = 999;
  for (let i = 0; i < count; i++) {
    let action;
    if (sinceRecipe >= 25 && recipeStep < SENSIBLE_RECIPE.length) {
      action = { raw: SENSIBLE_RECIPE[recipeStep], verb: 'sequence', nouns: [] };
      recipeStep++;
      if (recipeStep >= SENSIBLE_RECIPE.length) { recipeStep = 0; sinceRecipe = 0; }
    } else {
      sinceRecipe++;
      const roll = rng();
      const mode = roll < 0.12 ? 'garbage' : roll < 0.22 ? 'gag' : roll < 0.40 ? 'typo' : 'permutation';
      action = genOne(rng, mode);
    }
    yield action;
  }
}

// Map a raw instruction's mentioned canonical nouns to coverage keys.
// (Coarse: which THING_WORDS-style objects appear, for the verb x object matrix.)
const CANON = [
  [/peanut\s*butter\s*lid|lid.*peanut/, 'pbLid'],
  [/jelly\s*lid|lid.*jelly/, 'jellyLid'],
  [/peanut\s*butter|\bpb\b|peanut/, 'peanutButterJar'],
  [/jelly|jam/, 'jellyJar'],
  [/knife|nife/, 'knife'],
  [/mustard|musterd/, 'mustard'],
  [/ketchup|catsup|ketsup|kethcup/, 'ketchup'],
  [/mayo/, 'mayo'],
  [/honey|hunny|honney/, 'honey'],
  [/\bbutter\b|butterr/, 'butterDish'],
  [/banana|banann/, 'banana'],
  [/apple/, 'apple'],
  [/\bsalt\b/, 'salt'],
  [/pepper/, 'pepper'],
  [/cereal|oat|cerial|ceareal/, 'cerealBox'],
  [/\bmug\b|\bcup\b/, 'mug'],
  [/whisk/, 'whisk'],
  [/spatula|spachula/, 'spatula'],
  [/rolling\s*pin|roller|\bpin\b/, 'rollingPin'],
  [/crock/, 'crock'],
  [/shelf|pantry/, 'shelf'],
  [/counter|table|countr/, 'counter'],
  [/plate|dish|palte|plat/, 'plate'],
  [/bag|loaf/, 'breadBag'],
  [/bread|bred|braed/, 'breadBag'],
  [/left hand/, 'leftHand'],
  [/right hand/, 'rightHand'],
  [/slice|sandwich|piece|sammich/, 'slice'],
];
export function canonObjects(raw) {
  const s = String(raw).toLowerCase();
  const out = new Set();
  for (const [re, name] of CANON) if (re.test(s)) out.add(name);
  return [...out];
}
