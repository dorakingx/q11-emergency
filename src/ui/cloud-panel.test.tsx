/**
 * CloudPanel with a Qollab-style bridge: bridge.run records the result it returns (like qollab/main.js), so after a
 * Verify the panel must show that result once — not once as the live card and again as a recorded card.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import type { CloudResultOk, QuantumBridge } from '../game';
import { CloudPanel } from './play';

function qollabLikeBridge(jobs: number): QuantumBridge & { readonly runs: () => number } {
  const recorded: CloudResultOk[] = [];
  let left = jobs;
  let runs = 0;
  return {
    kind: 'qollab',
    backendName: 'ionq_simulator',
    isLocalSimulator: false,
    runs: () => runs,
    jobsRemaining: () => left,
    cached: (missionId, correction) => recorded.filter((r) => r.missionId === missionId && (correction === undefined || r.correction === correction)),
    run: (request) => {
      runs += 1;
      left -= 1;
      const ok: CloudResultOk = {
        status: 'ok',
        source: 'live-cloud',
        backendName: 'ionq_simulator',
        missionId: request.missionId,
        correction: request.correction,
        shots: request.shots,
        counts: { '00011': 100 },
        analysis: {},
        prediction: { verdict: 'success' },
        jobId: `job-${String(runs)}`,
        startedAt: '2026-11-09T00:16:00.000Z',
        finishedAt: '2026-11-09T00:17:00.000Z',
      };
      recorded.push(ok);
      return Promise.resolve(ok);
    },
  };
}

describe('CloudPanel · Qollab live result', () => {
  it('shows a Verify result once, then the one-job message; nothing more is sent', async () => {
    const u = userEvent.setup();
    const bridge = qollabLikeBridge(1);
    render(<CloudPanel bridge={bridge} missionId="first-alarm" correction="IXI" />);
    expect(screen.queryAllByTestId('cloud-card')).toHaveLength(0);

    await u.click(screen.getByRole('button', { name: 'Verify on ionq_simulator (100 shots)' }));
    expect(await screen.findByText('job-1')).toBeInTheDocument();
    expect(screen.getAllByTestId('cloud-card')).toHaveLength(1);

    const noJobs = screen.getByRole('button', { name: 'No job left in this run' });
    expect(noJobs).toBeDisabled();
    await u.click(noJobs);
    expect(bridge.runs()).toBe(1);
    expect(screen.getAllByTestId('cloud-card')).toHaveLength(1);
  });

  it('a result recorded earlier in the Run (another panel, same dispatch) is still listed next to a new live one', async () => {
    const u = userEvent.setup();
    const bridge = qollabLikeBridge(2);
    const first = render(<CloudPanel bridge={bridge} missionId="first-alarm" correction="IXI" />);
    await u.click(screen.getByRole('button', { name: 'Verify on ionq_simulator (100 shots)' }));
    expect(await screen.findByText('job-1')).toBeInTheDocument();
    first.unmount();

    render(<CloudPanel bridge={bridge} missionId="first-alarm" correction="IXI" />);
    expect(screen.getAllByTestId('cloud-card')).toHaveLength(1);
    await u.click(screen.getByRole('button', { name: 'Verify on ionq_simulator (100 shots)' }));
    expect(await screen.findByText('job-2')).toBeInTheDocument();
    expect(screen.getAllByTestId('cloud-card')).toHaveLength(2);
  });
});
