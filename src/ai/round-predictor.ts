import type { SolveResult, SolverPiece } from './solver.ts';
import type { SolveRequest } from './solver.worker.ts';

/**
 * Runs the exhaustive round solver in a module worker. Starting a new round
 * terminates the previous search so rapid play cannot queue expensive work.
 */
export class RoundPredictor {
  private worker: Worker | null = null;

  start(id: number, rows: number[], pieces: (SolverPiece | null)[], onResult: (id: number, result: SolveResult) => void): void {
    this.worker?.terminate();
    this.worker = null;
    try {
      const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }: MessageEvent<{ id: number; result: SolveResult }>) => onResult(data.id, data.result);
      const request: SolveRequest = { id, rows, pieces };
      worker.postMessage(request);
      this.worker = worker;
    } catch (error) {
      console.warn('Round solver unavailable:', error);
    }
  }

  stop(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
