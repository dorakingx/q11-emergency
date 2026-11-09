# Q11 Emergency — Quantum Emergency Response (project instructions)

Hackathon entry for the Qollab × IonQ Global Quantum Hackathon 2026.
Submission deadline: **2026-10-12 08:00 JST = 2026-10-11 23:00 UTC**.
The authoritative build spec is `spec/Q11_BUILD_SPEC.md`. Plan / status / decisions live in `docs/`.

## Hard constraints (never violate)
> Publication state (2026-10-11 11:30 UTC, on the user's written approval): the repo is **public**, Vercel protection is **off**, the Qollab project is **published** (v1.0, public default) and the demo video is on YouTube (unlisted). Those four items are done and must not be reverted or re-done without being asked. On 2026-11-09, at the user's request (Qollab asked for an IonQ fix), **v1.9** (run-lifecycle fix in main.js) and then **v1.10** (Verify result shown once) were published as the public default; v1.8 is the judged version. The team-page submission was also made (2026-10-11 11:36 UTC, second approval): 1 of 5 submitted. Do not withdraw or resubmit without being asked. Everything else below still holds.

- GitHub repo `dorakingx/q11-emergency` (renamed from `q11` on 2026-10-11; old URL redirects) stays **private**. Never make it public, never force-push, never rewrite history.
- Vercel project `q11` (scope `doraking`, Hobby) must have **Vercel Authentication = All Deployments** before any deployment exists. Never remove protection, never add public exceptions, never widen Trusted Sources.
- Do **not** publish on Qollab, do **not** submit, do **not** upload the demo video anywhere, no paid plans, no QPU (hardware) jobs, no billable API calls. Free simulators only, and never a flood of jobs.
- Never print, log, commit, screenshot or record credentials. `.env*`, `.vercel/`, auth state are git-ignored; only `.env.example` is committed.
- Do not touch any other project, repo, Vercel project or domain on this machine/account.
- Never report unexecuted tests, runs, or deploys as done. Distinguish Local / Cached cloud / Live cloud, simulator / QPU, verified / unverified.

## Layout
```
src/quantum/   Pauli frame (binary symplectic), stabilizer codes, GF(2) algebra, verdicts, decoders
src/game/      missions, state machine, scoring, replay
src/ui/        React UI (city map + scene are the hero), accessibility; src/ui/art (SVG parts), src/ui/city, src/ui/scene, src/ui/i18n (EN/JA)
public/        original icon assets (Q guard ring + flame)
quantum/       Python/Qiskit independent reference implementation + comparison
qollab/        Qollab JS/Qiskit project (game bundle + main.js bridge + q11/ Python package + main.py fallback)
fixtures/      shared mission definitions and verification cases (JSON)
scripts/       verification, packaging, protection checks
submission/    project page draft, demo script, checklist, evidence index
reports/       test results and limitations (no secrets)
docs/          plan, status, decisions, science notes
```

## Commands
`npm run lint` · `npm run typecheck` · `npm run test:unit` · `npm run test:e2e` · `npm run build` · `npm run verify:quantum` · `npm run verify:release`
Python: `uv venv --python 3.12 .venv && uv pip install -r quantum/requirements.txt` (Qiskit 2.5.x, qiskit-aer, qiskit-ionq).

## Science rules
- Paulis are binary symplectic `(x, z)`; composition is XOR (never OR). H swaps x/z; S: z ^= x; CNOT(c,t): x[t] ^= x[c], z[c] ^= z[t]. Propagation happens only through gates.
- Repetition code = X-noise-only intro. Main code = distance-3 rotated surface code (9 data, 8 checks).
- Success ⇔ residual C·E ∈ stabilizer group (GF(2) membership), logical error ⇔ commutes but not in group, detectable ⇔ anticommutes with some check. Never "syndrome == 0" alone, never one-state fidelity alone.
- Perfect-syndrome model unless stated. Clifford+Pauli educational simulation; do not overclaim.

## Redesign (2026-10-10 18:15 →)
Acceptance criteria R1–R15: `docs/UX_REDESIGN.md`; screen spec: `docs/UX_SCREENS.md`. The engine, fixtures, Python verification and Qollab bridge are kept; the experience layer is rebuilt (city map, scene art, spray effects, EN/JA).

## Working style
Plan → Implement → Run → Inspect → Fix → Commit → Deploy → Verify. Keep `docs/STATUS.md` current. Commit at meaningful milestones with real test results. Never disable TS strict or lint to pass.
