// Q11 Emergency — Quantum Emergency Response · Qollab entry (JS/Qiskit project).
// The game itself is a self-contained ES module bundle (./game/q11-game.js) built from the same TypeScript
// source as the web version. Quantum circuits are built and analysed in Python (q11/*.py, Qiskit) and run on
// whatever backend the person pressing Run selected in the Select QPU dialog — never a hard-coded one.
import { mountQ11 } from './game/q11-game.js';
import * as circuits from 'q11.circuits';

const root = document.getElementById('q11-root');
const backendLine = document.getElementById('q11-backend');

function toPlain(value) {
  // Pyodide proxies → plain JS (Map → object), recursively.
  if (value && typeof value.toJs === 'function') value = value.toJs({ dict_converter: Object.fromEntries, create_proxies: false });
  if (value instanceof Map) value = Object.fromEntries(value);
  if (Array.isArray(value)) return value.map(toPlain);
  if (value && typeof value === 'object' && !(value instanceof Uint8Array)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = toPlain(v);
    return out;
  }
  return value;
}

async function detectBackendName() {
  try {
    const n = typeof backend.name === 'function' ? backend.name() : backend.name;
    return String(n);
  } catch {
    return 'unknown backend';
  }
}

const backendName = await detectBackendName();
backendLine.textContent = `Backend selected in the Run dialog: ${backendName}`;

// One job per run on IonQ backends (Qollab rule). We enforce one cloud verification per Run for every backend
// except the local simulators, where more are allowed; the UI explains this (Verify button in the result's Details fold).
const isLocal = /basic|aer|braket|local|fake/i.test(backendName) && !/ionq/i.test(backendName);
let jobsThisRun = 0;
const recorded = [];
// A Qollab run ends when the top level of main.js finishes, and IonQ refuses requests made after that. On cloud
// backends the top level therefore waits on this promise (last line), which bridge.run resolves once the Run's
// one job has been sent and handled — Qollab docs, JS / Qiskit projects, "Waiting for user input".
let releaseRun;
const cloudJobDone = new Promise((resolve) => {
  releaseRun = resolve;
});

const bridge = {
  kind: 'qollab',
  backendName,
  isLocalSimulator: isLocal,
  jobsRemaining: () => (isLocal ? Infinity : Math.max(0, 1 - jobsThisRun)),
  // Results recorded in this Run only (the sandbox has no storage between runs).
  cached: (missionId, correction) => recorded.filter((r) => r.missionId === missionId && (correction === undefined || r.correction === correction)),
  /**
   * request: { missionId, correction, shots, prep: '0'|'+', readoutBasis: 'Z'|'X' }
   * returns: { status: 'ok', source: 'live-cloud'|'local-simulator', backendName, shots, counts, analysis, prediction, startedAt, finishedAt, jobId }
   *       or { status: 'error', message }
   */
  async run(request) {
    if (!isLocal && jobsThisRun >= 1) {
      return { status: 'error', message: 'Qollab allows one IonQ job per Run. Press Stop, then Run again to verify another mission.' };
    }
    const startedAt = new Date().toISOString();
    // Take the Run's job before the first await, so two quick calls cannot both pass the guard above.
    jobsThisRun += 1;
    let sent = false;
    try {
      const qc = await circuits.build_mission_circuit.callPromisingKwargs({
        mission_id: request.missionId,
        correction: request.correction,
        prep: request.prep ?? '0',
        readout_basis: request.readoutBasis ?? 'Z',
      });
      sent = true;
      const job = await backend.run(qc, { shots: request.shots });
      let jobId = null;
      try { jobId = String(typeof job.job_id === 'function' ? job.job_id() : job.job_id); } catch { jobId = null; }
      const result = await job.result();
      const counts = toPlain(result.get_counts());
      const analysis = toPlain(await circuits.analyze_counts.callPromisingKwargs({
        counts: result.get_counts(),
        mission_id: request.missionId,
        correction: request.correction,
        readout_basis: request.readoutBasis ?? 'Z',
        prep: request.prep ?? '0',
      }));
      const prediction = toPlain(await circuits.predict.callPromisingKwargs({
        mission_id: request.missionId,
        correction: request.correction,
        prep: request.prep ?? '0',
        readout_basis: request.readoutBasis ?? 'Z',
      }));
      const ok = {
        status: 'ok',
        source: isLocal ? 'local-simulator' : 'live-cloud',
        backendName,
        missionId: request.missionId,
        correction: request.correction,
        shots: request.shots,
        counts,
        analysis,
        prediction,
        jobId,
        startedAt,
        finishedAt: new Date().toISOString(),
      };
      recorded.push(ok);
      console.log('Q11 verification ' + JSON.stringify({ backend: backendName, missionId: request.missionId, correction: request.correction, shots: request.shots, jobId, dominantMatches: analysis && analysis.dominantMatches }));
      return ok;
    } catch (err) {
      console.log('Q11 verification failed: ' + (err && err.message ? err.message : String(err)));
      return { status: 'error', message: err && err.message ? err.message : String(err) };
    } finally {
      // Nothing reached the backend (the circuit failed to build): give the job back so the player can retry.
      if (!sent) jobsThisRun -= 1;
      // The cloud job was sent and handled (results logged above, or the error returned): let the run finish.
      if (!isLocal && jobsThisRun >= 1) releaseRun();
    }
  },
};

mountQ11(root, { bridge, storage: 'memory' });

// Self-test: run the core mission circuit once on the selected backend right after Run, so the console
// shows a real Qiskit result without any clicking. Local simulators are free and unlimited, so this is
// on by default there. On IonQ backends (one job per run) the player triggers the job from a debrief
// with "Verify on <backend>" instead — unless onlyLocal is set to false.
const AUTO_VERIFY = { enabled: true, onlyLocal: true, missionId: 'blind-dispatch', correction: 'IIIIXIIII', shots: 100 };
if (AUTO_VERIFY.enabled && (isLocal || !AUTO_VERIFY.onlyLocal)) {
  backendLine.textContent = `Backend: ${backendName} — self-test running (${AUTO_VERIFY.missionId}, ${AUTO_VERIFY.shots} shots)…`;
  const r = await bridge.run({ missionId: AUTO_VERIFY.missionId, correction: AUTO_VERIFY.correction, shots: AUTO_VERIFY.shots });
  if (r.status === 'ok') {
    const a = r.analysis || {};
    const share = typeof a.predictedSyndromeShare === 'number' ? Math.round(a.predictedSyndromeShare * 100) + '%' : 'n/a';
    const lshare = Array.isArray(a.predictedLogicalShare) && typeof a.predictedLogicalShare[0] === 'number' ? Math.round(a.predictedLogicalShare[0] * 100) + '%' : 'n/a';
    const agree = a.dominantMatches ? Object.values(a.dominantMatches).every((v) => v === true || v === null) : null;
    backendLine.textContent = `Backend: ${backendName} — self-test ${AUTO_VERIFY.missionId}: predicted alarms in ${share} of shots, predicted logical bit in ${lshare}; dominant outcome ${agree === null ? 'n/a' : agree ? 'agrees' : 'disagrees'} with the Pauli-frame verdict (${(r.prediction && r.prediction.verdict) || '?'}). Job ${r.jobId || 'n/a'}. Play Central District and open Details on the result to see this run's card.`;
    console.log('Q11 self-test ' + JSON.stringify({ backend: backendName, source: r.source, missionId: r.missionId, correction: r.correction, shots: r.shots, jobId: r.jobId, predictedSyndromeShare: a.predictedSyndromeShare, predictedLogicalShare: a.predictedLogicalShare, dominantMatches: a.dominantMatches, exactMatchesIdealModel: a.matches, verdict: r.prediction && r.prediction.verdict, counts: r.counts }));
  } else {
    backendLine.textContent = `Backend: ${backendName} — self-test failed: ${r.message}`;
  }
}

// Cloud backends: keep this Run open until the player's Verify job has finished (see cloudJobDone above).
// Local simulators finish here as before.
if (!isLocal) {
  const waitingForPlayer = jobsThisRun === 0;
  if (waitingForPlayer) backendLine.textContent += ' — this Run stays open until you press Verify on a result (Details); one job per Run.';
  await cloudJobDone;
  if (waitingForPlayer) backendLine.textContent = `Backend: ${backendName} — this Run's job has finished (one job per Run). Press Run again to verify another dispatch.`;
}
