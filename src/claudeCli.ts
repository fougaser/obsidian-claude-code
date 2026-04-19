import * as fs from 'fs/promises';
import { expandHome, run } from './shell';

const TOKEN_REGEX = /(sk-ant-oat01-[A-Za-z0-9_-]+)/;

/**
 * Ensure the isolated CLAUDE_CONFIG_DIR exists.
 */
export async function ensureConfigDir(configDir: string): Promise<void> {
    await fs.mkdir(expandHome(configDir), { recursive: true });
}

/**
 * Launch Terminal.app with `claude auth login` pre-filled. The OAuth browser flow
 * requires an interactive TTY and user attention, so we hand off to the system terminal
 * rather than trying to embed it. Returns once `open` is dispatched (not when login finishes).
 */
export async function openLoginTerminal(claudeBin: string, configDir: string): Promise<void> {
    const expandedConfigDir = expandHome(configDir);
    const cmd = `CLAUDE_CONFIG_DIR=${shellQuote(expandedConfigDir)} ${shellQuote(claudeBin)} auth login`;
    const applescript = `tell application "Terminal"\n  activate\n  do script ${appleQuote(cmd)}\nend tell`;
    const result = await run('/usr/bin/osascript', ['-e', applescript]);
    if (result.code !== 0) {
        throw new Error(`Failed to open Terminal.app: ${result.stderr || result.stdout}`);
    }
}

/**
 * Run `claude setup-token` in the isolated config dir, parse stdout for the token,
 * and return it. The CLI prints the token exactly once — the caller must persist it.
 */
export async function generateToken(claudeBin: string, configDir: string): Promise<string> {
    const result = await run(
        claudeBin,
        ['setup-token'],
        {
            env: { CLAUDE_CONFIG_DIR: expandHome(configDir) },
            timeoutMs: 120_000
        }
    );
    const combined = `${result.stdout}\n${result.stderr}`;
    const match = combined.match(TOKEN_REGEX);
    if (!match) {
        throw new Error(
            `Could not extract token from setup-token output. The CLI may have reported an error:\n${combined.trim()}`
        );
    }
    return match[1];
}

/**
 * Log out of the isolated session so the default `Claude Code-credentials` keychain slot
 * stays empty. The long-lived token we saved separately is unaffected.
 */
export async function logoutIsolated(claudeBin: string, configDir: string): Promise<void> {
    await run(
        claudeBin,
        ['auth', 'logout'],
        {
            env: { CLAUDE_CONFIG_DIR: expandHome(configDir) },
            timeoutMs: 30_000
        }
    );
}

/**
 * Verify the token works by running `claude auth status` with the token injected.
 */
export async function checkToken(claudeBin: string, configDir: string, token: string): Promise<boolean> {
    const result = await run(
        claudeBin,
        ['auth', 'status'],
        {
            env: {
                CLAUDE_CONFIG_DIR: expandHome(configDir),
                CLAUDE_CODE_OAUTH_TOKEN: token
            },
            timeoutMs: 30_000
        }
    );
    if (result.code !== 0) {
        return false;
    }
    return /"?loggedIn"?\s*:\s*true/.test(result.stdout);
}

function shellQuote(value: string): string {
    if (/^[A-Za-z0-9_\-./]+$/.test(value)) {
        return value;
    }
    return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function appleQuote(value: string): string {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
