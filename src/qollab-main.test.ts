/**
 * Run lifecycle of qollab/main.js (the Qollab JS/Qiskit entry). A Qollab run ends when the top level of main.js
 * finishes; IonQ refuses requests after that. These tests import main.js with a fake `backend`, fake Python
 * modules and a stub mountQ11, and watch when the module's top level settles. They are NOT quantum simulations and
 * say nothing about the real Qollab/IonQ integration — that is checked by hand on Qollab (reports/qollab-runs.md).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Bridge {
  readonly isLocalSimulator: boolean;
  jobsRemaining(): number;
  run(request: { missionId: string; correction: string; shots: number }): Promise<{ status: string; message?: string; jobId?: string | null; counts?: Record<string, number> }>;
}

const mounted = vi.hoisted((): { bridge: unknown; onMount: () => void } => ({ bridge: null, onMount: () => undefined }));
const pyFail = vi.hoisted(() => ({ build: false }));

vi.mock('../qollab/game/q11-game.js', () => ({
  mountQ11: (_root: unknown, options: { bridge: unknown }) => {
    mounted.bridge = options.bridge;
    mounted.onMount();
  },
}));

// Fake q11.circuits (Pyodide proxies): each function exposes callPromisingKwargs like the real bridge.
vi.mock('q11.circuits', () => ({
  build_mission_circuit: {
    callPromisingKwargs: (kw: Record<string, unknown>) => (pyFail.build ? Promise.reject(new Error('build failed')) : Promise.resolve({ circuit: kw })),
  },
  analyze_counts: { callPromisingKwargs: () => Promise.resolve({ dominantMatches: { syndrome: true, logical: true } }) },
  predict: { callPromisingKwargs: () => Promise.resolve({ verdict: 'success' }) },
}));

const MAIN = '../qollab/main.js';
const REQUEST = { missionId: 'rowhouse-lane', correction: 'XIIII', shots: 100 };

function fakeBackend(name: string, opts: { fail?: boolean } = {}) {
  let n = 0;
  let finished = false;
  const backend = {
    name,
    calls: 0,
    markFinished: () => {
      finished = true;
    },
    run: vi.fn(() => {
      backend.calls += 1;
      // Mirrors Qollab: on IonQ a request after the run has finished is refused.
      if (finished && /ionq/.test(name)) return Promise.reject(new Error('IonQ request made after the run has finished'));
      if (opts.fail) return Promise.reject(new Error('PreflightError: simulated'));
      n += 1;
      const id = `job-${String(n)}`;
      return Promise.resolve({ job_id: () => id, result: () => Promise.resolve({ get_counts: () => new Map([['11000000', 81], ['10000000', 19]]) }) });
    }),
  };
  return backend;
}

/** Imports main.js and reports whether its top level (the Qollab "run") has finished. */
async function startRun(backend: ReturnType<typeof fakeBackend>) {
  vi.stubGlobal('backend', backend);
  const run = { done: false };
  const loaded = (import(/* @vite-ignore */ MAIN) as Promise<unknown>).then(() => {
    run.done = true;
    logs.push('Done.');
    backend.markFinished();
  });
  // Wait until main.js has mounted the game (module loading is asynchronous), then let any self-test settle.
  await Promise.race([new Promise<void>((resolve) => (mounted.onMount = resolve)), loaded]);
  await flush();
  return { run, loaded, bridge: () => mounted.bridge as Bridge };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

let logs: string[];
let backendLine: { textContent: string };

beforeEach(() => {
  vi.resetModules();
  mounted.bridge = null;
  pyFail.build = false;
  logs = [];
  backendLine = { textContent: '' };
  vi.stubGlobal('document', { getElementById: (id: string) => (id === 'q11-backend' ? backendLine : {}) });
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    logs.push(a.map(String).join(' '));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('qollab/main.js run lifecycle', () => {
  it('local simulator: self-test runs on load and the run finishes as before (no waiting)', async () => {
    const backend = fakeBackend('basic_simulator');
    const { run, loaded, bridge } = await startRun(backend);
    await loaded;
    expect(run.done).toBe(true);
    expect(backend.calls).toBe(1);
    expect(logs.some((l) => l.startsWith('Q11 self-test'))).toBe(true);
    // Local simulators keep unlimited jobs.
    expect(bridge().jobsRemaining()).toBe(Infinity);
    const again = await bridge().run(REQUEST);
    expect(again.status).toBe('ok');
    expect(backend.calls).toBe(2);
  });

  it('IonQ: the run stays open after mounting, the Verify job runs inside it, then the run finishes', async () => {
    const backend = fakeBackend('ionq_simulator');
    const { run, loaded, bridge } = await startRun(backend);
    expect(mounted.bridge).not.toBeNull();
    expect(run.done).toBe(false); // would be true (Done.) with the judged version
    expect(backend.calls).toBe(0); // no self-test job on IonQ
    expect(backendLine.textContent).toContain('stays open until you press Verify');

    const result = await bridge().run(REQUEST);
    expect(result.status).toBe('ok');
    expect(result.jobId).toBe('job-1');
    expect(result.counts).toEqual({ '11000000': 81, '10000000': 19 });
    const line = logs.find((l) => l.startsWith('Q11 verification '));
    expect(line).toBeDefined();
    expect(JSON.parse((line ?? '').slice('Q11 verification '.length))).toMatchObject({ backend: 'ionq_simulator', jobId: 'job-1', shots: 100 });

    await loaded;
    expect(run.done).toBe(true);
    expect(backendLine.textContent).toContain("this Run's job has finished");
    // The verification line is logged before the run finishes (Qollab prints Done. at that point).
    expect(logs.indexOf(line ?? '')).toBeLessThan(logs.indexOf('Done.'));
  });

  it('IonQ: a second Verify in the same Run is refused by the one-job guard and sends nothing', async () => {
    const backend = fakeBackend('ionq_simulator');
    const { loaded, bridge } = await startRun(backend);
    await bridge().run(REQUEST);
    await loaded;
    expect(bridge().jobsRemaining()).toBe(0);
    const second = await bridge().run(REQUEST);
    expect(second).toMatchObject({ status: 'error' });
    expect(second.message).toMatch(/one IonQ job per Run/);
    expect(backend.calls).toBe(1);
  });

  it('IonQ: two quick Verify calls send only one job', async () => {
    const backend = fakeBackend('ionq_simulator');
    const { loaded, bridge } = await startRun(backend);
    const [a, b] = await Promise.all([bridge().run(REQUEST), bridge().run(REQUEST)]);
    expect([a.status, b.status].sort()).toEqual(['error', 'ok']);
    expect(backend.calls).toBe(1);
    await loaded;
  });

  it('IonQ: a backend error is returned to the UI and still ends the run (no hang, no unhandled rejection)', async () => {
    const backend = fakeBackend('ionq_simulator', { fail: true });
    const { run, loaded, bridge } = await startRun(backend);
    const result = await bridge().run(REQUEST);
    expect(result).toMatchObject({ status: 'error', message: 'PreflightError: simulated' });
    expect(logs.some((l) => l.startsWith('Q11 verification failed'))).toBe(true);
    await loaded;
    expect(run.done).toBe(true);
    expect(bridge().jobsRemaining()).toBe(0);
  });

  it('IonQ: if the circuit fails to build, nothing is sent, the run stays open and the player can retry', async () => {
    const backend = fakeBackend('ionq_simulator');
    const { run, loaded, bridge } = await startRun(backend);
    pyFail.build = true;
    const failed = await bridge().run(REQUEST);
    expect(failed).toMatchObject({ status: 'error', message: 'build failed' });
    await flush();
    expect(run.done).toBe(false);
    expect(backend.calls).toBe(0);
    expect(bridge().jobsRemaining()).toBe(1);

    pyFail.build = false;
    const ok = await bridge().run(REQUEST);
    expect(ok.status).toBe('ok');
    await loaded;
    expect(run.done).toBe(true);
    expect(backend.calls).toBe(1);
  });
});
