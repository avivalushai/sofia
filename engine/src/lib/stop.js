/**
 * What has to go away with this process: Chrome, an app started for the scan, a server. Without this,
 * a stopped scan (Ctrl-C, a closed terminal, an ended session) left Chrome and its tabs running.
 */
const tasks = new Set();
const SIGNALS = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 };
const GIVE_UP_MS = 5000;
let isStopping = false;

/** @param {() => Promise<void> | void} fn @returns {() => void} forget it again */
export function onStop(fn) {
  tasks.add(fn);
  return () => tasks.delete(fn);
}

/** True once the process has begun stopping. */
export const stopping = () => isStopping;

/** Runs every cleanup once, then exits; a cleanup that hangs can't keep the process alive. */
export async function stopNow(code = 0) {
  if (isStopping) return;
  isStopping = true;
  setTimeout(() => process.exit(code), GIVE_UP_MS).unref();
  await Promise.allSettled([...tasks].map(async (fn) => fn()));
  process.exit(code);
}

/** For the command line: Ctrl-C, kill and a closed terminal all clean up before exiting. */
export function stopOnSignals() {
  for (const [signal, code] of Object.entries(SIGNALS)) process.on(signal, () => stopNow(code));
}

/**
 * For long-running commands: when whoever started this process goes away (a closed session, a killed
 * terminal), the process is handed to the system (parent 1). Stop then instead of running on unseen.
 */
export function stopWithParent(everyMs = 5000) {
  if (process.ppid === 1) return;
  setInterval(() => process.ppid === 1 && stopNow(0), everyMs).unref();
}
