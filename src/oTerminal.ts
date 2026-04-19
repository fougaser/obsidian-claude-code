import * as fs from 'fs/promises';
import * as path from 'path';
import type { App } from 'obsidian';

export interface OTerminalStatus {
    installed: boolean;
    dataPath: string;
    currentShell: string | null;
}

const PLUGIN_ID = 'o-terminal';
const DATA_FILE = 'data.json';

export async function inspectOTerminal(app: App): Promise<OTerminalStatus> {
    const dataPath = resolveDataPath(app);
    try {
        const raw = await fs.readFile(dataPath, 'utf-8');
        const parsed = raw.length > 0 ? JSON.parse(raw) : {};
        return {
            installed: true,
            dataPath,
            currentShell: typeof parsed.defaultShell === 'string' ? parsed.defaultShell : null
        };
    } catch (err: unknown) {
        const e = err as NodeJS.ErrnoException;
        if (e.code === 'ENOENT') {
            const pluginFolderExists = await folderExists(path.dirname(dataPath));
            return { installed: pluginFolderExists, dataPath, currentShell: null };
        }
        throw err;
    }
}

/**
 * Set O Terminal's defaultShell (and clear shellArgs) to the given path.
 * Other keys in the data file are preserved.
 */
export async function pointOTerminalAtShell(app: App, shellPath: string): Promise<void> {
    const dataPath = resolveDataPath(app);
    const folder = path.dirname(dataPath);
    if (!(await folderExists(folder))) {
        throw new Error(`O Terminal is not installed — expected folder at ${folder}`);
    }
    let parsed: Record<string, unknown> = {};
    try {
        const raw = await fs.readFile(dataPath, 'utf-8');
        if (raw.trim().length > 0) {
            parsed = JSON.parse(raw);
        }
    } catch (err: unknown) {
        const e = err as NodeJS.ErrnoException;
        if (e.code !== 'ENOENT') {
            throw err;
        }
    }
    parsed.defaultShell = shellPath;
    parsed.shellArgs = [];
    const serialized = `${JSON.stringify(parsed, null, 2)}\n`;
    await fs.writeFile(dataPath, serialized, 'utf-8');
}

function resolveDataPath(app: App): string {
    const configDir = app.vault.configDir; // usually ".obsidian"
    // FileSystemAdapter exposes getBasePath (not in the public types).
    type AdapterWithBase = { getBasePath?: () => string };
    const adapter = app.vault.adapter as unknown as AdapterWithBase;
    const basePath = typeof adapter.getBasePath === 'function' ? adapter.getBasePath() : '';
    return path.join(basePath, configDir, 'plugins', PLUGIN_ID, DATA_FILE);
}

async function folderExists(folder: string): Promise<boolean> {
    try {
        const stat = await fs.stat(folder);
        return stat.isDirectory();
    } catch {
        return false;
    }
}
