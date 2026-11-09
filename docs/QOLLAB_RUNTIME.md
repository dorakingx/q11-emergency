# Qollab runtime facts (verified from qollab.xyz docs, read 2026-10-10 09:45 JST)

Sources: /learn/docs/runtime-environment, /learn/docs/js-qiskit-projects, /learn/docs/python-qiskit-projects,
/learn/docs/compute-backends, /learn/docs/ideal-vs-noise-model-simulators, /learn/docs/error-reference, hackathon terms + start email.

## Project types (decided from top-level files at every Run)
- `index.html` + `main.js` at top level ⇒ **JS project** (editor label "HTML/JS"). Page renders above the console; JS can call Python.
- Otherwise `main.py` at top level ⇒ **Python project** (stdout/stderr to console). Files in folders do not count.
- JS project: `index.html` is placed inside `<body>` (html/head/body tags dropped; `<script>` tags do NOT run). `main.css` optional and the only stylesheet loaded. Other .html/.css are not loaded.
- `main.js` may import `./x.js` (also `../`, `.mjs`, folder `index.js`), Python modules by dotted name (`import * as eng from 'q11.engine'` → `q11/engine.py`), and installed Python packages (`import { QuantumCircuit } from 'qiskit'`). Named imports or `import * as` only. JS libs: three.js/postprocessing by name; anything else from a full URL (`https://cdn.jsdelivr.net/npm/<pkg>/+esm`). **Q11 ships a self-contained bundle; no CDN.**
- JS **cannot** read project files (`fetch('data.json')` fails). Read data in Python and return it to JS.
- Python data files: path must appear as a **plain string literal** somewhere in the Python code (f-strings / joins are not loaded). Binary OK.
- Pyodide (WASM) Python; NumPy/SciPy/Matplotlib load on import. `requirements.txt` pure-Python wheels only; Qiskit always installed (`qiskit>=2.5.2,<3.0.0` default). Python 3.14 per python-qiskit doc.

## The `backend` variable
- Pre-created; chosen by whoever presses Run in the **Select QPU** dialog. Never hardcode a backend.
- Python: global in `main.py`; pass to modules. JS: `const job = await backend.run(circuit, { shots: 100 }); const counts = (await job.result()).get_counts().toJs();`
- Python values are proxies in JS: constructors without `new`, kwargs via `.callKwargs({...})`, call Python functions via `.callPromising(...)` / `.callPromisingKwargs({...})`; `.toJs()` to unpack. On IonQ, a *plain* (non-promising) call stops the run with ConnectionError (XHR not supported).
- `def main(shots: int = 100, label: str = "run 1", threshold: float = 0.05, verbose: bool = False):` (one line, annotated int/float/str/bool) ⇒ form under Run settings; runtime calls `main()` after the script. Not applicable to JS projects.

## Backends and limits
- Local, free, in-browser: built-in = Qiskit `BasicSimulator` (ideal, 24 qubits), AWS Braket local (25q, ideal), IBM noise-model fakes (120–156q).
- Remote, free, IonQ cloud, **noise-model**: Aria 1 & 2 (25q), Forte 1 & Forte Enterprise 1 (29q). Shot-aware: one noise simulation per shot ⇒ start with ~100 shots.
- Hardware (credits): Forte 1 / Forte Enterprise 1 (36q). **Never used by Q11.**
- **Run lifecycle (JS projects, docs read 2026-11-09):** a run ends when the top level of `main.js` finishes, awaits included; the console prints *Done.* and IonQ then refuses `backend.run` ("IonQ request made after the run has finished"). Page handlers keep working, local simulators still run after *Done.* (with a warning). To run a job from a click, the top level must `await` a promise the handler resolves (docs: JS / Qiskit projects → "Waiting for user input"). Q11: `cloudJobDone` in `qollab/main.js`, released in `bridge.run`'s `finally` once the Run's IonQ job was sent; regression tests in `src/qollab-main.test.ts`.
- **One job per run on any IonQ backend** (simulator or QPU). Second `backend.run` errors. Pass all circuits to a single `run()` if the provider supports lists. Local simulators: unlimited jobs per run.
- Job states: submitted → ready → started → completed (canceled/failed). Errors: PreflightError, InvalidInput, CompilationError, UnsupportedGate, TooManyShots, SimulationTimeout, QuotaExhaustedError, ...
- Network: only GET (CORS `*`); no XHR/WebSocket/workers. No storage at all in JS projects (no localStorage/sessionStorage/IndexedDB/cookies); nothing persists between runs ⇒ ship saved state as project files.
- Limits: 100 files × 2 MB per project; 200 MB total per account; no run time limit. Browser needs WebAssembly JSPI (recent Chrome/Edge/Opera, Firefox 153+).

## Publishing / visibility
- A project is **private while a draft** (only owner sees it; Run works). **Publish** makes it public at `qollab.xyz/u/<username>/<project>` with a version others can fork; later edits save to the draft on top of the published version. Q11 will NOT publish without explicit user approval.
- No API/CLI for creating projects found in docs: creation/editing is in the web editor (sign-in via Google or GitHub; provider-specific accounts).

## Hackathon requirements (terms + 2026-10-09 start email)
- Qiskit project; runs on Qollab's free simulators incl. IonQ's; published & runnable on Qollab under MIT before Oct 11 19:00 ET (23:00 UTC); project page; 2–3 min demo video viewable without sign-in; captain submits from team page; ≤5 projects/team; outside deps MIT; attribution line **"This effort is supported by Qollab & IonQ"**; disclose AI/tutorial/template usage; accessibility best practices; stay available 12 months.
- Judging: Novelty & Creativity, Technical Execution, Impact Potential, Documentation Quality. Themes: Quantum Impact / Quantum Playground / Quantum Unlocked. "Judges run every project on a free local simulator, and results from IonQ's simulators or hardware neither add nor subtract points."
