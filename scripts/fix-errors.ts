import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { readErrorLog, deduplicateErrors, buildFixPrompt } from '../server/errorFixService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

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
// Claude CLI (interactive — stdio: inherit for CLI mode)
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

  const prompt = buildFixPrompt(date, groups);
  invokeClaude(prompt);
}

main();
