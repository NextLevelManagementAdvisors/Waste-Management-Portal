import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGS_DIR = path.resolve(__dirname, '..', 'logs');

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function getDateStr() {
  return new Date().toISOString().split('T')[0];
}

function appendLog(filename: string, entry: object) {
  const filePath = path.join(LOGS_DIR, `${filename}-${getDateStr()}.log`);
  fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf8');
}

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  source: 'server' | 'client';
  message: string;
  data?: any;
  stack?: string;
}

function log(level: 'info' | 'warn' | 'error', message: string, data?: any) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    source: 'server',
    message,
    ...(data !== undefined && { data }),
  };
  if (data instanceof Error) {
    entry.stack = data.stack;
    entry.data = { message: data.message };
  }
  console[level](`[${level.toUpperCase()}]`, message, data ?? '');
  appendLog('app', entry);
  if (level === 'error') {
    appendLog('error', entry);
  }
}

export const logger = {
  info: (message: string, data?: any) => log('info', message, data),
  warn: (message: string, data?: any) => log('warn', message, data),
  error: (message: string, data?: any) => log('error', message, data),
  clientError: (payload: {
    message: string;
    stack?: string;
    context?: string;
    url?: string;
    userAgent?: string;
    spa?: string;
  }) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      source: 'client',
      message: payload.message,
      data: {
        context: payload.context,
        url: payload.url,
        userAgent: payload.userAgent,
        spa: payload.spa,
      },
      stack: payload.stack,
    };
    console.error('[CLIENT ERROR]', payload.message);
    appendLog('app', entry);
    appendLog('error', entry);
  },
};

export function cleanOldLogs(maxAgeDays = 30) {
  try {
    if (!fs.existsSync(LOGS_DIR)) return;
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    for (const file of fs.readdirSync(LOGS_DIR)) {
      const filePath = path.join(LOGS_DIR, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
      }
    }
  } catch (e) {
    console.error('Failed to clean old logs:', e);
  }
}

export const LOGS_DIR_PATH = LOGS_DIR;
