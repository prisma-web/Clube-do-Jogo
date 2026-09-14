import { createHash } from 'node:crypto';
import { cpus, platform, release, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { chmodSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const warmupCount = 5;
const pairCount = 10;
const loopbackHost = '127.0.0.1';
const defaultPath = '/jogo-do-mes';
const viewport = { width: 1280, height: 960 };

function usage() {
  process.stdout.write([
    'Usage: PERF_AUTH_BASELINE_URL=... PERF_AUTH_CANDIDATE_URL=... PERF_AUTH_EMAIL=... PERF_AUTH_PASSWORD=... PERF_AUTH_EXPECTED_IDENTITY=... npm run perf:auth',
    'Optional: PERF_AUTH_OUTPUT=/absolute/path/receipt.json',
    'Optional: PERF_AUTH_ALLOW_NON_LOOPBACK=1 for an explicitly approved non-local origin',
  ].join('\n') + '\n');
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function targetUrl(name, value, allowNonLoopback) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${name} must not contain credentials, query parameters, or fragments`);
  }
  if (!parsed.port) throw new Error(`${name} must include an explicit port`);
  if (!allowNonLoopback && (parsed.protocol !== 'http:' || parsed.hostname !== loopbackHost)) {
    throw new Error(`${name} must use http://${loopbackHost}:<port> unless PERF_AUTH_ALLOW_NON_LOOPBACK=1`);
  }
  const pathname = parsed.pathname === '/' ? defaultPath : parsed.pathname;
  return `${parsed.origin}${pathname}`;
}

function optionalSha(name) {
  const value = process.env[name];
  if (!value) return null;
  if (!/^[0-9a-f]{40}$/i.test(value)) throw new Error(`${name} must be a 40-character hexadecimal SHA`);
  return value.toLowerCase();
}

function redact(value, secrets) {
  let safe = value instanceof Error ? value.message : String(value);
  for (const secret of secrets) {
    if (secret) safe = safe.split(secret).join('[redacted]');
  }
  safe = safe.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
  safe = safe.replace(/\beyJ[A-Za-z0-9._-]+/g, '[redacted-token]');
  return safe.slice(0, 500);
}

function percentile95(values) {
  if (values.length === 0) return null;
  return [...values].sort((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1];
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function target(name, url, sha) {
  return { name, url, sha: sha || null };
}

async function measureLogin(browser, targetValue, phase, index, config) {
  const context = await browser.newContext({ viewport, locale: 'pt-BR' });
  const page = await context.newPage();
  let submitStartedAt;
  let identityVerified = false;
  let consoleErrors = 0;
  let pageErrors = 0;
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors += 1;
  });
  page.on('pageerror', () => {
    pageErrors += 1;
  });
  try {
    await page.goto(targetValue.url, { waitUntil: 'domcontentloaded', timeout: config.navigationTimeoutMs });
    const email = page.getByPlaceholder('Seu e-mail', { exact: true });
    const password = page.getByPlaceholder('Sua senha', { exact: true });
    const submit = page.getByRole('button', { name: 'Entrar', exact: true });
    await email.waitFor({ state: 'visible', timeout: config.navigationTimeoutMs });
    await password.waitFor({ state: 'visible', timeout: config.navigationTimeoutMs });
    await submit.waitFor({ state: 'visible', timeout: config.navigationTimeoutMs });
    await email.fill(config.email);
    await password.fill(config.password);
    submitStartedAt = performance.now();
    await submit.click();
    const identity = page.locator('button[aria-label="Abrir menu da conta"] strong').filter({ hasText: config.expectedIdentity }).first();
    await identity.waitFor({ state: 'visible', timeout: config.authTimeoutMs });
    const observedIdentity = (await identity.textContent() || '').trim();
    if (observedIdentity !== config.expectedIdentity) throw new Error('authenticated identity did not match expected identity');
    identityVerified = true;
    const readyAt = performance.now();
    return {
      target: targetValue.name,
      phase,
      index,
      status: 'passed',
      identityVerified,
      submitToReadyMs: readyAt - submitStartedAt,
      consoleErrors,
      pageErrors,
    };
  } catch (error) {
    const endedAt = performance.now();
    return {
      target: targetValue.name,
      phase,
      index,
      status: 'failed',
      identityVerified,
      submitToReadyMs: submitStartedAt === undefined ? null : endedAt - submitStartedAt,
      consoleErrors,
      pageErrors,
      error: redact(error, [config.email, config.password]),
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

function measuredValues(samples) {
  return samples
    .map(sample => sample.submitToReadyMs)
    .filter(value => typeof value === 'number' && Number.isFinite(value));
}

async function main() {
  if (process.argv.includes('--help')) {
    usage();
    return 0;
  }
  const outputPath = process.env.PERF_AUTH_OUTPUT;
  if (outputPath && !isAbsolute(outputPath)) throw new Error('PERF_AUTH_OUTPUT must be absolute');
  const allowNonLoopback = process.env.PERF_AUTH_ALLOW_NON_LOOPBACK === '1';
  const email = required('PERF_AUTH_EMAIL');
  const password = required('PERF_AUTH_PASSWORD');
  const config = {
    email,
    password,
    expectedIdentity: required('PERF_AUTH_EXPECTED_IDENTITY'),
    navigationTimeoutMs: Number(process.env.PERF_AUTH_NAVIGATION_TIMEOUT_MS || 30_000),
    authTimeoutMs: Number(process.env.PERF_AUTH_AUTH_TIMEOUT_MS || 30_000),
  };
  const targets = [
    target('baseline', targetUrl('PERF_AUTH_BASELINE_URL', required('PERF_AUTH_BASELINE_URL'), allowNonLoopback), optionalSha('PERF_AUTH_BASELINE_SHA')),
    target('candidate', targetUrl('PERF_AUTH_CANDIDATE_URL', required('PERF_AUTH_CANDIDATE_URL'), allowNonLoopback), optionalSha('PERF_AUTH_CANDIDATE_SHA')),
  ];
  if (targets[0].url === targets[1].url) throw new Error('PERF_AUTH_BASELINE_URL and PERF_AUTH_CANDIDATE_URL must differ after normalization');
  if (!Number.isFinite(config.navigationTimeoutMs) || config.navigationTimeoutMs <= 0 || !Number.isFinite(config.authTimeoutMs) || config.authTimeoutMs <= 0) {
    throw new Error('PERF_AUTH timeouts must be positive numbers');
  }

  const browser = await chromium.launch({ headless: true });
  const warmups = { baseline: [], candidate: [] };
  const samples = { baseline: [], candidate: [] };
  const orders = [];
  try {
    for (const targetValue of targets) {
      for (let index = 0; index < warmupCount; index += 1) {
        warmups[targetValue.name].push(await measureLogin(browser, targetValue, 'warmup', index, config));
      }
    }
    for (let pair = 0; pair < pairCount; pair += 1) {
      const order = pair % 2 === 0 ? ['baseline', 'candidate'] : ['candidate', 'baseline'];
      orders.push(order);
      for (const name of order) {
        const targetValue = targets.find(value => value.name === name);
        samples[name].push(await measureLogin(browser, targetValue, 'paired', pair, config));
      }
    }
  } finally {
    await browser.close();
  }

  const rawSamples = [...warmups.baseline, ...warmups.candidate, ...samples.baseline, ...samples.candidate];
  const baselineValues = measuredValues(samples.baseline);
  const candidateValues = measuredValues(samples.candidate);
  const baselineP95Ms = percentile95(baselineValues);
  const candidateP95Ms = percentile95(candidateValues);
  const limitMs = baselineP95Ms === null ? null : Math.max(1.1 * baselineP95Ms, baselineP95Ms + 50);
  const collectionPassed = warmups.baseline.length === warmupCount
    && warmups.candidate.length === warmupCount
    && samples.baseline.length === pairCount
    && samples.candidate.length === pairCount
    && baselineValues.length === pairCount
    && candidateValues.length === pairCount;
  const identityPassed = rawSamples.length === (2 * (warmupCount + pairCount))
    && rawSamples.every(sample => sample.status === 'passed' && sample.identityVerified === true);
  const thresholdPassed = collectionPassed
    && baselineP95Ms !== null
    && candidateP95Ms !== null
    && limitMs !== null
    && candidateP95Ms <= limitMs;
  const output = {
    status: collectionPassed && identityPassed && thresholdPassed ? 'passed' : 'failed',
    scope: 'web authentication submit through authenticated UI with literal account identity',
    timestamp: new Date().toISOString(),
    timer: 'node:perf_hooks performance.now (monotonic)',
    host: {
      platform: platform(),
      release: release(),
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
      memoryBytes: totalmem(),
      node: process.version,
      playwright: require('playwright/package.json').version,
    },
    targets,
    fixture: {
      expectedIdentity: config.expectedIdentity,
      paths: {
        baseline: new URL(targets[0].url).pathname,
        candidate: new URL(targets[1].url).pathname,
      },
      browser: 'Chromium headless',
      viewport,
      freshBrowserContextPerLogin: true,
    },
    warmupCount,
    pairCount,
    orders,
    warmups,
    samples,
    p95Ms: { baseline: baselineP95Ms, candidate: candidateP95Ms },
    limitMs,
    collectionPassed,
    identityPassed,
    thresholdPassed,
    rawSampleCount: rawSamples.length,
    credentialsPrinted: false,
    outputDigest: digest(JSON.stringify({ baselineValues, candidateValues, orders })),
  };
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  if (outputPath) {
    writeFileSync(outputPath, serialized, { mode: 0o600 });
    chmodSync(outputPath, 0o600);
  }
  process.stdout.write(serialized);
  return output.status === 'passed' ? 0 : 1;
}

main().then(code => {
  process.exitCode = code;
}).catch(error => {
  process.stderr.write(`${redact(error, [process.env.PERF_AUTH_EMAIL, process.env.PERF_AUTH_PASSWORD])}\n`);
  process.exitCode = 1;
});
