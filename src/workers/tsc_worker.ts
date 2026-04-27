import { parentPort } from "node:worker_threads";

type TscRequest = { id: string; projectPath: string };
type TscResponse = {
  id: string;
  errors: Array<{ file: string; line: number; column: number; message: string }>;
};

parentPort?.on("message", (msg: TscRequest) => {
  // Stage 1 stub — real type-check is wired up in a later stage.
  const response: TscResponse = { id: msg.id, errors: [] };
  parentPort?.postMessage(response);
});
