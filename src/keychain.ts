import { run } from './shell';

/**
 * Read a token from macOS Keychain by its generic-password service name.
 * Returns null if the item doesn't exist or access is denied.
 */
export async function readToken(service: string): Promise<string | null> {
    const account = process.env.USER ?? '';
    const result = await run('/usr/bin/security', ['find-generic-password', '-a', account, '-s', service, '-w']);
    if (result.code !== 0) {
        return null;
    }
    const token = result.stdout.trim();
    return token.length > 0 ? token : null;
}

/**
 * Store (or update) a token in macOS Keychain. `-U` ensures an existing entry is replaced.
 */
export async function writeToken(service: string, token: string): Promise<void> {
    const account = process.env.USER ?? '';
    const result = await run('/usr/bin/security', [
        'add-generic-password',
        '-a',
        account,
        '-s',
        service,
        '-w',
        token,
        '-U'
    ]);
    if (result.code !== 0) {
        throw new Error(`security add-generic-password failed (code ${result.code}): ${result.stderr || result.stdout}`);
    }
}

/**
 * Remove the keychain entry. Non-existence is treated as success.
 */
export async function deleteToken(service: string): Promise<void> {
    const account = process.env.USER ?? '';
    await run('/usr/bin/security', ['delete-generic-password', '-a', account, '-s', service]);
}
