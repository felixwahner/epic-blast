import type { SolveResult, SolverPiece } from './solver.ts';
import type { SolveRequest } from './solver.worker.ts';

/**
 * Runs the exhaustive round solver in a module worker. The worker is reused
 * while it is idle; starting a new round during a search terminates it, so
 * rapid play cannot queue expensive work.
 */
export class RoundPredictor {
  private worker: Worker | null = null;
  private busy = false;

  start(id: number, rows: number[], pieces: (SolverPiece | null)[], onResult: (id: number, result: SolveResult) => void): void {
    if (this.busy) this.stop();
    try {
      const worker = this.worker ??= new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }: MessageEvent<{ id: number; result: SolveResult }>) => {
        this.busy = false;
        onResult(data.id, data.result);
      };
      const request: SolveRequest = { id, rows, pieces };
      worker.postMessage(request);
      this.busy = true;
    } catch (error) {
      console.warn('Round solver unavailable:', error);
    }
  }

  stop(): void {
    this.worker?.terminate();
    this.worker = null;
    this.busy = false;
  }
}
