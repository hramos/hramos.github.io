import { runInstruction, checkScene, isBusy, cleanup } from './world.mjs';

const cmds = [
  'open the bag',
  'take out two slices',
  'open the peanut butter',
  'spread peanut butter on the bread',
  'open the jelly',
  'spread jelly on the other slice',
  'put the slices together',
  'cut the sandwich',
  'throw the apple',
  'juggle',
  'asdf qwerty nonsense',
  'spread it on it',
  '',
  'flip the left slice',
  'stab the banana',
];

for (const c of cmds) {
  const r = await runInstruction(c);
  const chk = checkScene();
  console.log(JSON.stringify({
    cmd: c,
    ok: r.ok,
    kind: r.kind,
    busy: isBusy(),
    resp: r.ok ? r.response?.slice(0, 70) : undefined,
    err: r.error?.split('\n')[0],
    finite: chk.finite,
    matrixOk: chk.matrixOk,
    bounds: chk.bounds,
  }));
}
cleanup();
console.log('PROBE DONE');
