import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { logger, LOGS_DIR_PATH } from './logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const USER_STORIES_PATH = path.join(PROJECT_ROOT, 'docs', 'USER_STORIES.md');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  source: 'server' | 'client';
  message: string;
  data?: {
    context?: string;
    url?: string;
    userAgent?: string;
    spa?: string;
    method?: string;
    status?: number;
    duration?: number;
  };
  stack?: string;
}

export interface ErrorGroup {
  key: string;
  count: number;
  mostRecent: LogEntry;
  source: 'server' | 'client';
}

export interface FixResult {
  success: boolean;
  errorsFound: number;
  uniqueErrors: number;
  committed: boolean;
  commitHash?: string;
  message: string;
  errorSummaries: string[];
}

// ---------------------------------------------------------------------------
// Concurrency lock & progress tracking
// ---------------------------------------------------------------------------

let fixInProgress = false;
let fixProgressMessages: string[] = [];
let fixStatus: 'idle' | 'running' | 'done' | 'error' = 'idle';
let fixResultStore: FixResult | null = null;

export function isFixRunning(): boolean {
  return fixInProgress;
}

export function getFixProgress(): { status: typeof fixStatus; messages: string[]; result: FixResult | null } {
  return { status: fixStatus, messages: [...fixProgressMessages], result: fixResultStore };
}

const MAX_PROGRESS_MESSAGES = 150;

function addProgress(msg: string): void {
  if (fixProgressMessages.length >= MAX_PROGRESS_MESSAGES) {
    fixProgressMessages.splice(0, fixProgressMessages.length - MAX_PROGRESS_MESSAGES + 1);
  }
  fixProgressMessages.push(msg);
}

function resetProgress(): void {
  fixProgressMessages = [];
  fixStatus = 'running';
  fixResultStore = null;
}

// ---------------------------------------------------------------------------
// Log Reading
// ---------------------------------------------------------------------------

export function readErrorLog(date: string, source?: string): LogEntry[] {
  const logFile = path.join(LOGS_DIR_PATH, `error-${date}.log`);

  if (!fs.existsSync(logFile)) return [];

  const content = fs.readFileSync(logFile, 'utf8').trim();
  if (!content) return [];

  const lines = content.split('\n').filter(Boolean);
  let entries: LogEntry[] = lines
    .map(line => {
      try { return JSON.parse(line) as LogEntry; }
      catch { return null; }
    })
    .filter((e): e is LogEntry => e !== null);

  if (source) {
    entries = entries.filter(e => e.source === source);
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function normalizeErrorKey(entry: LogEntry): string {
  let msg = entry.message;

  if (entry.source === 'server') {
    msg = msg.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>');
    msg = msg.replace(/\b(in|pi|pm|sub|cus|ch|cs|si|seti|price|prod)_[A-Za-z0-9]+/g, '<STRIPE_ID>');
    msg = msg.replace(/\?[^ ]*/, '');
    msg = msg.replace(/\s+\d+ms$/, '');
  }

  return `${entry.source}::${msg}`;
}

// ---------------------------------------------------------------------------
// Fixed-error ledger — prevents re-processing already-fixed errors
// ---------------------------------------------------------------------------

function fixedLedgerPath(date: string): string {
  return path.join(LOGS_DIR_PATH, `fixed-${date}.json`);
}

interface FixedEntry {
  key: string;
  commitHash: string;
  fixedAt: string;
}

function readFixedLedger(date: string): FixedEntry[] {
  try {
    const content = fs.readFileSync(fixedLedgerPath(date), 'utf8');
    const arr = JSON.parse(content);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function readFixedKeys(date: string): Set<string> {
  return new Set(readFixedLedger(date).map(e => e.key));
}

function markKeysAsFixed(date: string, keys: string[], commitHash: string): void {
  const existing = readFixedLedger(date);
  const existingKeys = new Set(existing.map(e => e.key));
  const now = new Date().toISOString();
  for (const k of keys) {
    if (!existingKeys.has(k)) {
      existing.push({ key: k, commitHash, fixedAt: now });
    }
  }
  fs.writeFileSync(fixedLedgerPath(date), JSON.stringify(existing, null, 2));
}

export function deduplicateErrors(entries: LogEntry[], limit: number = 20, date?: string): ErrorGroup[] {
  const fixedKeys = date ? readFixedKeys(date) : new Set<string>();
  const groups = new Map<string, ErrorGroup>();

  for (const entry of entries) {
    const key = normalizeErrorKey(entry);
    if (fixedKeys.has(key)) continue; // skip already-fixed errors
    const existing = groups.get(key);

    if (existing) {
      existing.count++;
      existing.mostRecent = entry;
    } else {
      groups.set(key, { key, count: 1, mostRecent: entry, source: entry.source });
    }
  }

  return Array.from(groups.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Prompt Construction
// ---------------------------------------------------------------------------

export interface UserStory {
  id: string;
  section: string;
  text: string;
}

export function parseUserStories(): UserStory[] {
  try {
    const content = fs.readFileSync(USER_STORIES_PATH, 'utf8');
    const stories: UserStory[] = [];
    let currentSection = '';

    for (const rawLine of content.split('\n')) {
      const line = rawLine.replace(/\r$/, '');
      const sectionMatch = line.match(/^###\s+\d+\.\d+\s+(.+)/);
      if (sectionMatch) {
        currentSection = sectionMatch[1].trim();
        continue;
      }
      const storyMatch = line.match(/^\|\s*([CATS]-\d+)\s*\|(?:\s*\w+\s*\|)?\s*(.+?)\s*\|$/);
      if (storyMatch) {
        stories.push({ id: storyMatch[1], section: currentSection, text: storyMatch[2].trim() });
      }
    }
    return stories;
  } catch {
    return [];
  }
}

export function buildFixPrompt(
  date: string,
  groups: ErrorGroup[],
  includeUserStories: boolean = false,
  adminNotes?: string,
  flaggedStories?: string[],
): string {
  const totalOccurrences = groups.reduce((sum, g) => sum + g.count, 0);

  const errorBlocks = groups.map((g, i) => {
    const e = g.mostRecent;
    const lines: string[] = [
      `--- ERROR #${i + 1} (occurred ${g.count} time${g.count > 1 ? 's' : ''}) ---`,
      `Source: ${e.source}`,
      `Message: ${e.message}`,
    ];

    if (e.data?.spa) lines.push(`SPA: ${e.data.spa}`);
    if (e.data?.url) lines.push(`URL: ${e.data.url}`);
    if (e.data?.context) lines.push(`Context: ${e.data.context}`);
    if (e.stack) lines.push(`Stack trace:\n${e.stack}`);
    lines.push(`Most recent: ${e.timestamp}`);

    return lines.join('\n');
  }).join('\n\n');

  let userStoriesBlock = '';
  if (includeUserStories) {
    try {
      const stories = fs.readFileSync(USER_STORIES_PATH, 'utf8');
      userStoriesBlock = `\n\nCONSTRAINT — USER STORIES:
You must ONLY make changes that align with the following user stories.
Do not add features, refactor code, or make changes outside the scope
of these stories. If an error fix would require changes beyond these
stories, add a TODO comment instead of implementing it.

${stories}`;
    } catch {
      // USER_STORIES.md not found — skip constraint
    }
  }

  return `You are fixing errors in a Waste Management Portal web application.

PROJECT STRUCTURE:
- Three SPAs: main (index.tsx), admin (admin/main.tsx), team (team/main.tsx)
- Server: Express backend in server/ directory
- Frontend: React + TypeScript + Tailwind
- Client errors with minified stack traces come from production builds; use the component names and URL paths to locate the source files

ERROR LOG for ${date}:
${groups.length} unique error${groups.length > 1 ? 's' : ''} found (from ${totalOccurrences} total occurrences):

${errorBlocks}

WORKFLOW — You MUST follow this two-phase approach:

PHASE 1 — PLAN:
Before making ANY code changes, analyze every error above and produce a numbered plan.
For each error state:
  - Root cause (which file and why it fails)
  - Proposed fix (what you will change)
  - Skip reason (if you cannot fix it, explain why)
Output the plan as a numbered list so progress can be tracked.

PHASE 2 — IMPLEMENT:
Work through your plan ONE error at a time, in order:
  1. State which error you are fixing (e.g. "Fixing error #1: ...")
  2. Read the relevant source file(s)
  3. Make the minimal fix
  4. Move to the next error
Do NOT batch multiple fixes into a single edit. Fix one, then the next.

RULES:
- For server errors showing HTTP 500s, find the route handler and trace why it fails
- For server errors with "/undefined" in the URL, the client is passing undefined as a parameter — find where the API is called
- For client errors with minified stacks, use the SPA name, URL path, and error message to locate the component
- Fix root causes in SOURCE code (not built/minified output)
- If an error cannot be fixed without more context (e.g., database schema issues, missing env vars), skip it and explain why
- Do NOT modify log files, test files, or build output${userStoriesBlock}${adminNotes ? `\n\nADMIN CONTEXT:\n${adminNotes}` : ''}${flaggedStories?.length ? buildFlaggedStoriesBlock(flaggedStories) : ''}`;
}

function buildFlaggedStoriesBlock(storyIds: string[]): string {
  const allStories = parseUserStories();
  const matched = storyIds
    .map(id => allStories.find(s => s.id === id))
    .filter((s): s is UserStory => s !== null && s !== undefined);
  if (matched.length === 0) return '';
  const bullets = matched.map(s => `- ${s.id}: ${s.text}`).join('\n');
  return `\n\nFLAGGED USER STORIES — these are NOT being followed correctly. Prioritize fixing:\n${bullets}`;
}

// ---------------------------------------------------------------------------
// Claude CLI
// ---------------------------------------------------------------------------

function findClaudeBinary(): string | null {
  // Try bare command
  try {
    execSync('claude --version', { stdio: 'pipe' });
    return 'claude';
  } catch { /* not in PATH */ }

  // Try common npm global locations on Windows
  const candidates = [
    path.join(process.env.APPDATA || '', 'npm', 'claude.cmd'),
    path.join(process.env.APPDATA || '', 'npm', 'claude'),
    path.join(process.env.LOCALAPPDATA || '', 'npm', 'claude.cmd'),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        execSync(`"${candidate}" --version`, { stdio: 'pipe' });
        return candidate;
      }
    } catch { /* not valid */ }
  }

  return null;
}

function describeToolUse(name: string, input: any): string | null {
  switch (name) {
    case 'Read':
      return `Reading ${input?.file_path ? path.relative(PROJECT_ROOT, input.file_path) : 'file'}`;
    case 'Edit':
      return `Editing ${input?.file_path ? path.relative(PROJECT_ROOT, input.file_path) : 'file'}`;
    case 'Write':
      return `Writing ${input?.file_path ? path.relative(PROJECT_ROOT, input.file_path) : 'file'}`;
    case 'Glob':
      return `Searching for ${input?.pattern || 'files'}`;
    case 'Grep':
      return `Searching for "${input?.pattern || '...'}"${input?.path ? ' in ' + path.relative(PROJECT_ROOT, input.path) : ''}`;
    case 'Bash':
      return `Running command`;
    default:
      return `Using ${name}`;
  }
}

function invokeClaude(claudeBin: string, prompt: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Strip CLAUDECODE env var to avoid "nested session" block when running
    // inside VS Code Claude Code extension or another Claude session
    const env = { ...process.env };
    delete env.CLAUDECODE;

    // Pipe prompt via stdin to avoid Windows ENAMETOOLONG on large prompts
    // shell: true so Windows can resolve claude.cmd via PATH
    // Use stream-json to get structured tool-use events for progress display
    const child = spawn(claudeBin, ['-p', '--verbose', '--output-format', 'stream-json'], {
      cwd: PROJECT_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: true,
      env,
    });

    let stderrBuf = '';
    let lineBuffer = '';

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Claude CLI timed out after 15 minutes'));
    }, 15 * 60 * 1000);

    child.stdout?.on('data', (chunk: Buffer) => {
      lineBuffer += chunk.toString('utf8');
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed);
          // Extract tool-use events for human-readable progress
          // Only surface tool-use events and final result — skip text deltas
          // to avoid flooding the progress buffer with thousands of token chunks
          if (event.type === 'assistant' && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === 'tool_use') {
                const desc = describeToolUse(block.name, block.input);
                if (desc) addProgress(desc);
              }
            }
          } else if (event.type === 'result') {
            addProgress('Analysis complete');
          }
        } catch {
          // Not valid JSON — ignore (partial chunk or non-JSON stderr leak)
        }
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString('utf8');
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (lineBuffer.trim()) {
        try {
          const event = JSON.parse(lineBuffer.trim());
          if (event.type === 'result') addProgress('Analysis complete');
        } catch {
          addProgress(lineBuffer.trim());
        }
      }
      if (code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}${stderrBuf ? ': ' + stderrBuf.slice(0, 500) : ''}`));
      } else {
        resolve();
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    // Write prompt via stdin, then close
    child.stdin?.write(prompt);
    child.stdin?.end();
  });
}

// ---------------------------------------------------------------------------
// Git commit
// ---------------------------------------------------------------------------

function gitCommitFixes(date: string, summaries: string[]): string | null {
  try {
    const status = execSync('git status --porcelain', { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
    if (!status) return null;

    execSync('git add -A', { cwd: PROJECT_ROOT, stdio: 'pipe' });

    const bulletList = summaries.map(s => `- ${s}`).join('\n');
    const message = `Auto-fix: ${summaries.length} error(s) from ${date}\n\nErrors fixed:\n${bulletList}\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`;

    execSync(`git commit -m ${JSON.stringify(message)}`, { cwd: PROJECT_ROOT, stdio: 'pipe' });

    const hash = execSync('git rev-parse --short HEAD', { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
    return hash;
  } catch (err) {
    logger.error('Auto-fix git commit failed', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main fix runner
// ---------------------------------------------------------------------------

export function startFix(options: {
  date?: string;
  source?: string;
  limit?: number;
  includeUserStories?: boolean;
  autoCommit?: boolean;
  adminNotes?: string;
  flaggedStories?: string[];
}): { started: boolean; message: string } {
  if (fixInProgress) {
    return { started: false, message: 'A fix is already in progress' };
  }

  const date = options.date || new Date().toISOString().split('T')[0];
  const limit = options.limit || 20;

  // Find Claude CLI synchronously before going async
  const claudeBin = findClaudeBinary();
  if (!claudeBin) {
    return { started: false, message: 'Claude CLI not found. Run: npm install -g @anthropic-ai/claude-code' };
  }

  // Read and deduplicate errors
  const entries = readErrorLog(date, options.source);
  if (entries.length === 0) {
    return { started: false, message: 'No errors found for this date' };
  }

  const groups = deduplicateErrors(entries, limit, date);
  if (groups.length === 0) {
    return { started: false, message: 'All errors for this date have already been fixed' };
  }
  const summaries = groups.map(g => {
    const e = g.mostRecent;
    const spaTag = e.data?.spa ? ` [${e.data.spa}]` : '';
    return `${g.count}x ${e.source}${spaTag}: ${e.message.slice(0, 120)}`;
  });

  // Mark as running and reset progress
  fixInProgress = true;
  resetProgress();
  addProgress(`Found ${entries.length} error entries, deduplicated to ${groups.length} unique error(s)`);
  for (const s of summaries) {
    addProgress(`  ${s}`);
  }
  addProgress('Claude will plan fixes first, then implement one at a time...');

  // Single Claude invocation — prompt instructs plan-then-implement workflow
  const prompt = buildFixPrompt(date, groups, options.includeUserStories ?? false, options.adminNotes, options.flaggedStories);

  (async () => {
    try {
      logger.info(`Auto-fix: processing ${groups.length} unique errors from ${entries.length} entries for ${date}`);

      await invokeClaude(claudeBin, prompt);

      addProgress('Claude finished analyzing and fixing errors');

      // Auto-commit if requested
      let committed = false;
      let commitHash: string | undefined;
      if (options.autoCommit !== false) {
        addProgress('Checking for changes to commit...');
        const hash = gitCommitFixes(date, summaries);
        if (hash) {
          committed = true;
          commitHash = hash;
          // Tag these errors as fixed so they won't be picked up again
          const fixedKeys = groups.map(g => g.key);
          markKeysAsFixed(date, fixedKeys, hash);
          addProgress(`Committed fixes as ${hash} — ${fixedKeys.length} error(s) tagged as fixed`);
          logger.info(`Auto-fix committed: ${hash}, tagged ${fixedKeys.length} errors as fixed`);
        } else {
          addProgress('No file changes detected — nothing to commit');
        }
      }

      fixStatus = 'done';
      fixResultStore = {
        success: true,
        errorsFound: entries.length,
        uniqueErrors: groups.length,
        committed,
        commitHash,
        message: `Fixed ${groups.length} unique error(s)${committed ? `, committed as ${commitHash}` : ''}`,
        errorSummaries: summaries,
      };
    } catch (err: any) {
      const msg = err.killed ? 'Claude CLI timed out after 15 minutes' : (err.message || 'Unknown error');
      logger.error('Auto-fix failed', err);
      addProgress(`Error: ${msg}`);
      fixStatus = 'error';
      fixResultStore = { success: false, errorsFound: entries.length, uniqueErrors: groups.length, committed: false, message: msg, errorSummaries: summaries };
    } finally {
      fixInProgress = false;
    }
  })();

  return { started: true, message: `Processing ${groups.length} unique error(s)...` };
}

// Kept for auto-fix scheduler (awaits completion)
export async function runFix(options: {
  date?: string;
  source?: string;
  limit?: number;
  includeUserStories?: boolean;
  autoCommit?: boolean;
  adminNotes?: string;
  flaggedStories?: string[];
}): Promise<FixResult> {
  const start = startFix(options);
  if (!start.started) {
    return { success: false, errorsFound: 0, uniqueErrors: 0, committed: false, message: start.message, errorSummaries: [] };
  }

  // Poll until done
  return new Promise((resolve) => {
    const check = () => {
      const progress = getFixProgress();
      if (progress.status === 'done' || progress.status === 'error') {
        resolve(progress.result!);
      } else {
        setTimeout(check, 1000);
      }
    };
    setTimeout(check, 1000);
  });
}

// ---------------------------------------------------------------------------
// Auto-mode scheduler (event-driven + periodic fallback)
// ---------------------------------------------------------------------------

let autoFixInterval: ReturnType<typeof setInterval> | null = null;
let lastAutoFixRunAt = 0; // epoch ms of last fix attempt
let debouncedFixTimer: ReturnType<typeof setTimeout> | null = null;

const AUTO_FIX_COOLDOWN_MS = 15 * 60 * 1000; // 15 min between runs
const AUTO_FIX_DEBOUNCE_MS = 2 * 60 * 1000;  // 2 min debounce after new error
const AUTO_FIX_PERIODIC_MS = 60 * 60 * 1000;  // 1 hour periodic check

async function autoFixTick(): Promise<void> {
  // Cooldown: skip if we ran recently
  if (Date.now() - lastAutoFixRunAt < AUTO_FIX_COOLDOWN_MS) return;

  const today = new Date().toISOString().split('T')[0];
  const entries = readErrorLog(today);
  if (entries.length === 0) return;

  // Deduplicate to check if there are actually unfixed errors
  const unfixed = deduplicateErrors(entries, 20, today);
  if (unfixed.length === 0) return;

  logger.info(`Auto-fix: ${unfixed.length} unfixed error(s) detected, starting fix`);
  lastAutoFixRunAt = Date.now();

  const result = await runFix({
    date: today,
    includeUserStories: true,
    autoCommit: true,
  });

  logger.info(`Auto-fix result: ${result.message}`);
}

/**
 * Called when a new error is logged. If auto-fix is enabled, schedules a
 * debounced fix attempt so rapid-fire errors are batched together.
 */
export function notifyNewError(): void {
  if (!autoFixInterval) return; // auto-fix not enabled
  if (fixInProgress) return;    // already running

  // Debounce: reset the timer on each new error
  if (debouncedFixTimer) clearTimeout(debouncedFixTimer);
  debouncedFixTimer = setTimeout(() => {
    debouncedFixTimer = null;
    autoFixTick().catch(err => logger.error('Auto-fix debounced tick failed', err));
  }, AUTO_FIX_DEBOUNCE_MS);
}

export function startAutoFix(): void {
  if (autoFixInterval) return;

  logger.info('Auto-fix: enabled (event-driven + hourly fallback)');

  // Periodic fallback check
  autoFixInterval = setInterval(() => {
    autoFixTick().catch(err => logger.error('Auto-fix periodic tick failed', err));
  }, AUTO_FIX_PERIODIC_MS);

  // Initial check after 5 seconds
  setTimeout(() => {
    autoFixTick().catch(err => logger.error('Auto-fix initial tick failed', err));
  }, 5000);
}

export function stopAutoFix(): void {
  if (autoFixInterval) {
    clearInterval(autoFixInterval);
    autoFixInterval = null;
  }
  if (debouncedFixTimer) {
    clearTimeout(debouncedFixTimer);
    debouncedFixTimer = null;
  }
  logger.info('Auto-fix: disabled');
}

export function isAutoFixEnabled(): boolean {
  return autoFixInterval !== null;
}
