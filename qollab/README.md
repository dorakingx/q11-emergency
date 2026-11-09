# Q11 Emergency — Quantum Emergency Response

A toy-city fire-dispatch game that teaches how quantum error correction reasons: houses are qubits, alarm stations are
stabilizer (parity) checks, fire crews are Pauli corrections. Built for the Qollab × IonQ Global Quantum Hackathon 2026
(theme: Quantum Unlocked). **This effort is supported by Qollab & IonQ.**

**License: MIT** (see `LICENSE`). Libraries used: React, Vite (MIT); Qiskit, qiskit-aer (Apache-2.0).

## How to run it on Qollab
1. Open the **Code** tab, click **Run Project**, then **Run**.
2. In *Select QPU* pick **Built-in simulator (24q)** under *Locally Run Simulators* (the default) and click **Run**.
   The game renders above the console and immediately runs a self-test circuit (Blind Dispatch, 100 shots); the console
   prints `Q11 self-test {...}` with the measured syndrome / logical statistics next to the Pauli-frame prediction.
3. Play: tap a district on the city map, press **Dispatch!**, read the alarms, send crews, press **Spray!**.
   On any surface-code result, **Details → Verify on this backend (100 shots)** runs *your* dispatch as a Qiskit circuit.

IonQ's free noise-model simulators (Aria 1/2, Forte 1/Enterprise) work too, one job per run; counts deviate statistically
and the page labels them as such. On IonQ there is no self-test: the Run stays open (console on *Running…*) until you press
**Verify on ionq_simulator** on a result, and finishes (*Done.*) once that job's result is shown. No hardware (QPU) runs are made or claimed.

## What is in this project
- `index.html`, `main.js`, `main.css`, `game/q11-game.js` — the game (JS/Qiskit project page; `main.js` bridges to Python).
- `q11/` — pure-Python Qiskit package: codes (3-qubit repetition, distance-3 rotated surface code), Pauli frames, decoder,
  verdicts and mission circuits (encode → inject → syndrome extraction → correct → readout).
- `main.py` — text-mode runner for forks that remove `index.html`/`main.js`.

Full source, tests and the independent Python/Qiskit verification (4,746 comparisons) live in the GitHub repository
linked on the project page.
