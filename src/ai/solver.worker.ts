import { solve, type SolverPiece } from './solver.ts';

export interface SolveRequest {
  id: number;
  rows: number[];
  pieces: (SolverPiece | null)[];
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<SolveRequest>) => void) | null;
  postMessage(message: unknown): void;
};

scope.onmessage = ({ data }) => {
  scope.postMessage({ id: data.id, result: solve(data.rows, data.pieces) });
};
