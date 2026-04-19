import { App, Modal, Notice, Setting } from 'obsidian';
import {
    checkToken,
    ensureConfigDir,
    generateToken,
    logoutIsolated,
    openLoginTerminal
} from './claudeCli';
import { readToken, writeToken } from './keychain';
import { pointOTerminalAtShell } from './oTerminal';
import { whichClaude } from './shell';
import type { ClaudeSubscriptionSettings } from './settings';
import { writeWrapperScript } from './wrapperScript';

export interface SetupModalOptions {
    settings: ClaudeSubscriptionSettings;
    onComplete: () => Promise<void>;
    rotateOnly?: boolean;
}

export class SetupModal extends Modal {
    private readonly opts: SetupModalOptions;
    private logEl!: HTMLElement;

    constructor(app: App, opts: SetupModalOptions) {
        super(app);
        this.opts = opts;
    }

    onOpen(): void {
        this.titleEl.setText(this.opts.rotateOnly ? 'Rotate token' : 'Claude Subscription setup');

        const desc = this.contentEl.createEl('p');
        desc.setText(
            this.opts.rotateOnly
                ? 'Walk through login + token generation again. The existing Keychain entry and wrapper are updated in place.'
                : 'Five steps. The plugin will nudge you to the browser once for OAuth; everything else runs here.'
        );

        const steps = this.contentEl.createEl('ol');
        steps.createEl('li', { text: '1. Verify Claude CLI is installed.' });
        steps.createEl('li', { text: '2. Open Terminal.app for OAuth login.' });
        steps.createEl('li', { text: '3. After login → click "Generate token" below.' });
        if (!this.opts.rotateOnly) {
            steps.createEl('li', { text: '4. Write wrapper script and configure O Terminal.' });
        } else {
            steps.createEl('li', { text: '4. Store new token in Keychain (wrapper stays unchanged).' });
        }
        steps.createEl('li', { text: '5. Verify token works.' });

        const actions = this.contentEl.createDiv({ cls: 'modal-button-container' });
        const verifyBtn = actions.createEl('button', { text: '1 · Check CLI' });
        verifyBtn.addEventListener('click', () => void this.stepVerifyCli());
        const loginBtn = actions.createEl('button', { text: '2 · Open Terminal for login' });
        loginBtn.addEventListener('click', () => void this.stepOpenLogin());
        const tokenBtn = actions.createEl('button', { text: '3 · Generate token', cls: 'mod-cta' });
        tokenBtn.addEventListener('click', () => void this.stepGenerateAndStore());

        this.logEl = this.contentEl.createDiv({ cls: 'claude-sub-log' });
        this.logEl.style.marginTop = '16px';
        this.logEl.style.padding = '8px 10px';
        this.logEl.style.fontFamily = 'var(--font-monospace, monospace)';
        this.logEl.style.fontSize = '12px';
        this.logEl.style.background = 'var(--background-secondary)';
        this.logEl.style.borderRadius = '4px';
        this.logEl.style.maxHeight = '200px';
        this.logEl.style.overflowY = 'auto';
        this.logEl.style.whiteSpace = 'pre-wrap';
        this.log('Ready. Start with step 1.');
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private async stepVerifyCli(): Promise<void> {
        this.log('Checking claude binary...');
        const configured = this.opts.settings.claudeBin;
        try {
            // Prefer configured path if it resolves; fall back to PATH lookup.
            const resolved = await whichClaude();
            if (resolved) {
                this.log(`OK — which claude → ${resolved}`);
                if (resolved !== configured) {
                    this.log(`Note: configured path is "${configured}". Update settings if needed.`);
                }
                return;
            }
            this.log('claude not found on PATH. Install with: brew install anthropic/claude-code/claude-code');
        } catch (err) {
            this.log(`Error: ${(err as Error).message}`);
        }
    }

    private async stepOpenLogin(): Promise<void> {
        try {
            this.log('Ensuring isolated config dir exists...');
            await ensureConfigDir(this.opts.settings.configDir);
            this.log(`Config dir: ${this.opts.settings.configDir}`);
            this.log('Opening Terminal.app with `claude auth login`...');
            await openLoginTerminal(this.opts.settings.claudeBin, this.opts.settings.configDir);
            this.log('Terminal launched. Authorize in the browser, then come back and click step 3.');
        } catch (err) {
            this.log(`Error: ${(err as Error).message}`);
        }
    }

    private async stepGenerateAndStore(): Promise<void> {
        const s = this.opts.settings;
        try {
            this.log('Running `claude setup-token` in isolated config...');
            const token = await generateToken(s.claudeBin, s.configDir);
            this.log(`Token acquired (prefix: ${token.slice(0, 14)}…). Writing to Keychain "${s.keychainService}"...`);
            await writeToken(s.keychainService, token);
            this.log('Keychain updated.');

            this.log('Logging out of isolated session so the default keychain slot stays empty...');
            await logoutIsolated(s.claudeBin, s.configDir);
            this.log('Isolated session logged out.');

            if (!this.opts.rotateOnly) {
                this.log('Writing wrapper script...');
                await writeWrapperScript({
                    claudeBin: s.claudeBin,
                    configDir: s.configDir,
                    keychainService: s.keychainService,
                    outputPath: s.wrapperPath
                });
                this.log(`Wrapper written to ${s.wrapperPath}`);

                this.log('Pointing O Terminal at wrapper...');
                try {
                    await pointOTerminalAtShell(this.app, expandedWrapperPath(s.wrapperPath));
                    this.log('O Terminal configured. Toggle the plugin off/on to pick up the change.');
                } catch (err) {
                    this.log(`O Terminal not configured automatically: ${(err as Error).message}`);
                    this.log('Install O Terminal first, then rerun this step — or set defaultShell manually.');
                }
            }

            this.log('Verifying token...');
            const readBack = await readToken(s.keychainService);
            if (!readBack) {
                this.log('Warning: could not read token back from Keychain. Macscreenreader permission prompt?');
            } else {
                const ok = await checkToken(s.claudeBin, s.configDir, readBack);
                this.log(ok ? '✓ Token works. You are set.' : '✗ `claude auth status` did not report loggedIn=true.');
            }

            new Notice('Claude Subscription setup complete.');
            await this.opts.onComplete();
        } catch (err) {
            this.log(`Error: ${(err as Error).message}`);
        }
    }

    private log(line: string): void {
        this.logEl.appendText(`${line}\n`);
        this.logEl.scrollTop = this.logEl.scrollHeight;
    }
}

function expandedWrapperPath(p: string): string {
    if (p.startsWith('~/')) {
        const home = process.env.HOME ?? '';
        return `${home}${p.slice(1)}`;
    }
    return p;
}
