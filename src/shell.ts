import * as child_process from 'child_process';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(child_process.execFile);

export interface CommandResult {
    stdout: string;
    stderr: string;
    code: number;
}

export interface RunOptions {
    env?: Record<string, string>;
    cwd?: string;
    timeoutMs?: number;
}

/**
 * Run a command, collect stdout/stderr, and return a structured result.
 * Does NOT throw on non-zero exit — caller inspects `code`.
 */
export async function run(bin: string, args: string[], options: RunOptions = {}): Promise<CommandResult> {
    try {
        const { stdout, stderr } = await execFileAsync(bin, args, {
            env: { ...process.env, ...options.env },
            cwd: options.cwd,
            timeout: options.timeoutMs,
            maxBuffer: 1024 * 1024 * 8
        });
        return { stdout, stderr, code: 0 };
    } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; code?: number };
        return {
            stdout: e.stdout ?? '',
            stderr: e.stderr ?? '',
            code: typeof e.code === 'number' ? e.code : 1
        };
    }
}

/**
 * Returns the absolute path to the `claude` binary, or null if not on PATH.
 */
export async function whichClaude(): Promise<string | null> {
    const result = await run('/usr/bin/which', ['claude']);
    if (result.code !== 0) {
        return null;
    }
    const trimmed = result.stdout.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export function expandHome(p: string): string {
    if (p.startsWith('~/')) {
        return path.join(process.env.HOME ?? '', p.slice(2));
    }
    if (p === '~') {
        return process.env.HOME ?? '';
    }
    return p;
}
