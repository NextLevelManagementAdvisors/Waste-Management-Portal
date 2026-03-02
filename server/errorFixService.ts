import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
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
// Concurrency lock
// ---------------------------------------------------------------------------

let fixInProgress = false;

export function isFixRunning(): boolean {
  return fixInProgress;
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

export function deduplicateErrors(entries: LogEntry[], limit: number = 20): ErrorGroup[] {
  const groups = new Map<string, ErrorGroup>();

  for (const entry of entries) {
    const key = normalizeErrorKey(entry);
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

export function buildFixPrompt(date: string, groups: ErrorGroup[], includeUserStories: boolean = false): string {
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

INSTRUCTIONS:
1. For each error, identify the root cause in the SOURCE code (not the built/minified output)
2. For server errors showing HTTP 500s, find the route handler and trace why it fails
3. For server errors with "/undefined" in the URL, the client is passing undefined as a parameter — find where the API is called
4. For client errors with minified stacks, use the SPA name, URL path, and error message to locate the component
5. Fix the root causes directly in the source files
6. If an error cannot be fixed without more context (e.g., database schema issues, missing env vars), add a TODO comment explaining what is needed
7. Do NOT modify log files, test files, or build output${userStoriesBlock}`;
}

// ---------------------------------------------------------------------------
// Claude CLI
// ---------------------------------------------------------------------------

function checkClaudeCLI(): boolean {
  try {
    execSync('claude --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function invokeClaude(prompt: string): void {
  execSync(`claude -p ${JSON.stringify(prompt)}`, {
    cwd: PROJECT_ROOT,
    stdio: 'pipe',
    timeout: 5 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Git commit
// ---------------------------------------------------------------------------

function gitCommitFixes(date: string, summaries: string[]): string | null {
  try {
    // Check if there are any changes to commit
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

export async function runFix(options: {
  date?: string;
  source?: string;
  limit?: number;
  includeUserStories?: boolean;
  autoCommit?: boolean;
}): Promise<FixResult> {
  if (fixInProgress) {
    return { success: false, errorsFound: 0, uniqueErrors: 0, committed: false, message: 'A fix is already in progress', errorSummaries: [] };
  }

  fixInProgress = true;

  try {
    const date = options.date || new Date().toISOString().split('T')[0];
    const limit = options.limit || 20;

    // Check Claude CLI
    if (!checkClaudeCLI()) {
      return { success: false, errorsFound: 0, uniqueErrors: 0, committed: false, message: 'Claude CLI not found on server', errorSummaries: [] };
    }

    // Read and deduplicate errors
    const entries = readErrorLog(date, options.source);
    if (entries.length === 0) {
      return { success: true, errorsFound: 0, uniqueErrors: 0, committed: false, message: 'No errors found', errorSummaries: [] };
    }

    const groups = deduplicateErrors(entries, limit);
    const summaries = groups.map(g => {
      const e = g.mostRecent;
      const spaTag = e.data?.spa ? ` [${e.data.spa}]` : '';
      return `${g.count}x ${e.source}${spaTag}: ${e.message.slice(0, 120)}`;
    });

    logger.info(`Auto-fix: processing ${groups.length} unique errors from ${entries.length} entries for ${date}`);

    // Build prompt and invoke Claude
    const prompt = buildFixPrompt(date, groups, options.includeUserStories ?? false);
    invokeClaude(prompt);

    // Auto-commit if requested
    let committed = false;
    let commitHash: string | undefined;
    if (options.autoCommit !== false) {
      const hash = gitCommitFixes(date, summaries);
      if (hash) {
        committed = true;
        commitHash = hash;
        logger.info(`Auto-fix committed: ${hash}`);
      }
    }

    return {
      success: true,
      errorsFound: entries.length,
      uniqueErrors: groups.length,
      committed,
      commitHash,
      message: `Fixed ${groups.length} unique error(s)${committed ? `, committed as ${commitHash}` : ''}`,
      errorSummaries: summaries,
    };
  } catch (err: any) {
    const msg = err.killed ? 'Claude CLI timed out after 5 minutes' : (err.message || 'Unknown error');
    logger.error('Auto-fix failed', err);
    return { success: false, errorsFound: 0, uniqueErrors: 0, committed: false, message: msg, errorSummaries: [] };
  } finally {
    fixInProgress = false;
  }
}

// ---------------------------------------------------------------------------
// Auto-mode scheduler
// ---------------------------------------------------------------------------

let autoFixInterval: ReturnType<typeof setInterval> | null = null;
let lastAutoFixTime: string | null = null;

export function startAutoFix(): void {
  if (autoFixInterval) return;

  logger.info('Auto-fix: automatic mode enabled (checking every 60 minutes)');

  const tick = async () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Skip if we already ran for this hour
    const hourKey = `${today}T${now.getHours()}`;
    if (lastAutoFixTime === hourKey) return;

    const entries = readErrorLog(today);
    if (entries.length === 0) return;

    logger.info(`Auto-fix: found ${entries.length} errors, starting automatic fix`);
    lastAutoFixTime = hourKey;

    const result = await runFix({
      date: today,
      includeUserStories: true,
      autoCommit: true,
    });

    logger.info(`Auto-fix result: ${result.message}`);
  };

  // Run first check after 5 seconds, then every 60 minutes
  setTimeout(tick, 5000);
  autoFixInterval = setInterval(tick, 60 * 60 * 1000);
}

export function stopAutoFix(): void {
  if (autoFixInterval) {
    clearInterval(autoFixInterval);
    autoFixInterval = null;
    logger.info('Auto-fix: automatic mode disabled');
  }
}

export function isAutoFixEnabled(): boolean {
  return autoFixInterval !== null;
}
