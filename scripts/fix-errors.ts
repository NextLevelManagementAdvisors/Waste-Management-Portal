import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const LOGS_DIR = path.join(PROJECT_ROOT, 'logs');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LogEntry {
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

interface ErrorGroup {
  key: string;
  count: number;
  mostRecent: LogEntry;
  source: 'server' | 'client';
}

// ---------------------------------------------------------------------------
// CLI Argument Parsing
// ---------------------------------------------------------------------------

function parseArgs(): { date: string; source?: string; limit: number; dryRun: boolean } {
  const args = process.argv.slice(2);
  const today = new Date().toISOString().split('T')[0];
  let date = today;
  let source: string | undefined;
  let limit = 20;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--date':
        date = args[++i];
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          console.error('Invalid date format. Use YYYY-MM-DD');
          process.exit(1);
        }
        break;
      case '--source':
        source = args[++i];
        if (source !== 'server' && source !== 'client') {
          console.error('Invalid source. Use "server" or "client"');
          process.exit(1);
        }
        break;
      case '--limit':
        limit = parseInt(args[++i], 10);
        if (isNaN(limit) || limit < 1) {
          console.error('Invalid limit. Must be a positive integer');
          process.exit(1);
        }
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--help':
        console.log(`Usage: npx tsx scripts/fix-errors.ts [options]

Options:
  --date YYYY-MM-DD       Date to read errors from (default: today)
  --source server|client  Filter by error source
  --limit N               Max unique errors to process (default: 20)
  --dry-run               Show errors without invoking Claude
  --help                  Print this help message

Examples:
  npm run fix-errors
  npm run fix-errors -- --dry-run
  npm run fix-errors -- --date 2026-02-28 --source server
  npm run fix-errors -- --source client --limit 5`);
        process.exit(0);
      default:
        console.error(`Unknown argument: ${args[i]}. Use --help for usage.`);
        process.exit(1);
    }
  }

  return { date, source, limit, dryRun };
}

// ---------------------------------------------------------------------------
// Log Reading
// ---------------------------------------------------------------------------

function readErrorLog(date: string, source?: string): LogEntry[] {
  const logFile = path.join(LOGS_DIR, `error-${date}.log`);

  if (!fs.existsSync(logFile)) {
    console.log(`No error log found for ${date}`);
    return [];
  }

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
    // Strip UUIDs
    msg = msg.replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      '<UUID>',
    );
    // Strip Stripe IDs (in_xxx, pi_xxx, sub_xxx, cus_xxx, etc.)
    msg = msg.replace(/\b(in|pi|pm|sub|cus|ch|cs|si|seti|price|prod)_[A-Za-z0-9]+/g, '<STRIPE_ID>');
    // Strip query strings
    msg = msg.replace(/\?[^ ]*/, '');
    // Strip timing suffixes
    msg = msg.replace(/\s+\d+ms$/, '');
  }

  return `${entry.source}::${msg}`;
}

function deduplicateErrors(entries: LogEntry[], limit: number): ErrorGroup[] {
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

function buildPrompt(date: string, groups: ErrorGroup[]): string {
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
7. Do NOT modify log files, test files, or build output`;
}

// ---------------------------------------------------------------------------
// Claude CLI Invocation
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
  console.log('\nInvoking Claude Code CLI to analyze and fix errors...\n');
  console.log('\u2500'.repeat(60));

  try {
    execSync(`claude -p ${JSON.stringify(prompt)}`, {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      timeout: 5 * 60 * 1000,
    });
  } catch (error: any) {
    if (error.killed) {
      console.error('\nClaude CLI timed out after 5 minutes');
      process.exit(1);
    }
    if (error.status) {
      console.error(`\nClaude CLI exited with code ${error.status}`);
      process.exit(error.status);
    }
    throw error;
  }

  console.log('\u2500'.repeat(60));
  console.log('\nDone. Review changes with: git diff');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const { date, source, limit, dryRun } = parseArgs();

  console.log(`\nFix Errors \u2014 Waste Management Portal`);
  console.log(`Date: ${date}${source ? ` | Source: ${source}` : ''} | Limit: ${limit}${dryRun ? ' | DRY RUN' : ''}`);
  console.log('\u2500'.repeat(60));

  const entries = readErrorLog(date, source);

  if (entries.length === 0) {
    console.log('No errors found. Nothing to fix.');
    process.exit(0);
  }

  console.log(`Found ${entries.length} total error entries`);

  const groups = deduplicateErrors(entries, limit);
  console.log(`Deduplicated to ${groups.length} unique error(s):\n`);

  for (const g of groups) {
    const e = g.mostRecent;
    const spaTag = e.data?.spa ? ` [${e.data.spa}]` : '';
    console.log(`  ${g.count}x ${e.source}${spaTag}: ${e.message.slice(0, 120)}`);
  }

  if (dryRun) {
    console.log('\n--dry-run specified. Full error details:\n');
    for (const g of groups) {
      console.log(JSON.stringify(g.mostRecent, null, 2));
      console.log(`  (${g.count} occurrences)\n`);
    }
    process.exit(0);
  }

  if (!checkClaudeCLI()) {
    console.error('\nError: Claude CLI (claude) not found in PATH.');
    console.error('Install it with: npm install -g @anthropic-ai/claude-code');
    console.error('\nYou can still use --dry-run to view the errors.');
    process.exit(1);
  }

  const prompt = buildPrompt(date, groups);
  invokeClaude(prompt);
}

main();
