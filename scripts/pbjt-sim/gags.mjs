// Targeted tests for the 9 literal-misinterpretation gags. Sets up one world,
// walks each scenario (with prerequisites), prints the instruction and the
// chef's response, and asserts checkScene() passes (finite transforms, matrix
// builds, world bounds) after every action.
//
//   node scripts/pbjt-sim/gags.mjs
import { runInstruction, checkScene } from './world.mjs';

let failures = 0;

function ok(check) {
  return check.finite && check.matrixOk && check.bounds.length === 0;
}

async function step(instruction, { label, expect } = {}) {
  const res = await runInstruction(instruction);
  const chk = checkScene();
  const passed = res.ok && ok(chk);
  const tag = label ? `  [setup] ` : `INSTRUCTION: `;
  if (label) {
    console.log(`  - "${instruction}" -> ${res.ok ? res.response : '[' + res.kind + ']'}`);
  } else {
    console.log(`\n>>> "${instruction}"`);
    console.log(`    chef: ${res.ok ? res.response : '[FAILED: ' + res.kind + (res.error ? ' ' + res.error : '') + ']'}`);
  }
  if (!passed) {
    failures++;
    console.log(`    !! RENDER CHECK FAILED: ${JSON.stringify(chk)}`);
  }
  if (expect && res.ok && !expect.test(res.response)) {
    failures++;
    console.log(`    !! RESPONSE did not match ${expect}`);
  }
  return res;
}

const setup = (s) => step(s, { label: true });

console.log('=== PB&J GAG TESTS ===');

// Common prerequisites: open the bag and both jars, get slices out.
console.log('\n--- prerequisites ---');
await setup('open the bag');
await setup('take the slices out of the bag');
await setup('open the peanut butter');
await setup('open the jelly');

// --- regression FIRST (clean slice state): precise phrasings must NOT trigger
// the gags and must route to the normal handlers ---
console.log('\n--- regression: precise phrasings still work normally ---');
// "take a SLICE out of the bag" -> normal extract, not the piece gag
await step('take a slice of bread out of the bag', { expect: /slice|bag|empty/i });
// precise spread on a named slice -> normal spreadOn (gags never say "Smeared")
await step('spread the peanut butter on the left slice', { expect: /smeared/i });

// GAG 1: piece of bread (a slice is out, so it tears a nub off a slice)
await step('take a piece of bread out of the bag', { expect: /piece/i });

// GAG 2: scoop a little jelly
await step('scoop a little jelly out of the jar', { expect: /little jelly/i });

// GAG 4: scoop out some peanut butter (no tool -> bare hand)
await step('scoop out some peanut butter', { expect: /bare hand/i });

// GAG 5: use the knife to scoop ... then put it on the bread ("it" = knife)
await step('use the knife to scoop out some peanut butter, then put it on the bread', { expect: /knife/i });

// GAG 6: spread the peanut butter on the face of the bread
await step('spread the peanut butter on the face of the bread', { expect: /face/i });

// GAG 8: cut the sandwich down the middle (clean-ish literal cut)
await step('cut the sandwich down the middle', { expect: /./ });

// GAG 7: cut the sandwich into two pieces (one tiny, one huge)
await step('cut the sandwich into two pieces', { expect: /tiny|sliver|enormous/i });

// GAG 9: take the jelly (bare take -> steal then return)
await step('take the jelly', { expect: /took|take/i });

// GAG 3: spread the peanut butter and the jelly on different slices (jars)
// Reset: fresh slices since earlier gags chewed up the current ones.
console.log('\n--- reset slices for gag 3 ---');
await setup('take the slices out of the bag');
await step('spread the peanut butter and the jelly on different slices of bread', { expect: /jar/i });

// GAG 6 regression: "the FACE of the bread" with a TOOL named is NOT the
// face-smear gag — it means the slice's upward face. Route to normal spread,
// targeting a slice. (Run last: seating a slice on the plate narrows the slice
// pool, which would otherwise starve earlier multi-slice gags.)
// Reset to a clean slice on the plate so the spread has a target.
console.log('\n--- regression: tool + "face of the bread" -> spread on a slice ---');
await setup('take the slices out of the bag');
await setup('put a slice on the plate');
// (a) User's EXACT bug report. Tool named -> no gag, spread targets the slice.
await step('use butter knife to spread peanut butter onto the face of the bread on the plate', {
  expect: /slice/i,
});
await step('use butter knife to spread peanut butter onto the face of the bread on the plate', {
  expect: /^(?!.*face in this kitchen).*$/i,
});
// (b) VAGUE, tool-less phrasing still triggers the gag (face-smear response).
await step('spread the peanut butter on the face of the bread', { expect: /face in this kitchen/i });

console.log(`\n=== GAG TESTS COMPLETE: ${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'} ===`);
process.exit(failures === 0 ? 0 : 1);
