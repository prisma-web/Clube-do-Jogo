// Preloaded by release-notes.test.mjs: this process reports the Node version in PRETEND_NODE_VERSION and no built-in type stripping.
// A third nested launch fails, so a relaunch loop ends the test instead of spawning processes forever.
const launches = Number(process.env.PRETEND_NODE_LAUNCHES ?? 0) + 1;
if (launches > 2) {
  console.error(`release-notes.mjs relaunched itself ${launches - 1} times`);
  process.exit(99);
}
process.env.PRETEND_NODE_LAUNCHES = String(launches);
Object.defineProperty(process.features, 'typescript', { value: false });
Object.defineProperty(process, 'versions', { value: { ...process.versions, node: process.env.PRETEND_NODE_VERSION } });
