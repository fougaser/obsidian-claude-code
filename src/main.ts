import { Notice, Plugin } from 'obsidian';
import { ClaudeSubscriptionSettingTab } from './settingsTab';
import { SetupModal } from './setupModal';
import { checkToken } from './claudeCli';
import { readToken } from './keychain';
import { inspectOTerminal } from './oTerminal';
import { expandHome, whichClaude } from './shell';
import { ClaudeSubscriptionSettings, DEFAULT_SETTINGS, mergeSettings } from './settings';
import * as fs from 'fs/promises';

export default class ClaudeSubscriptionPlugin extends Plugin {
    settings: ClaudeSubscriptionSettings = DEFAULT_SETTINGS;

    async onload(): Promise<void> {
        const stored = (await this.loadData()) as Partial<ClaudeSubscriptionSettings> | null;
        this.settings = mergeSettings(stored);

        this.addSettingTab(new ClaudeSubscriptionSettingTab(this.app, this));

        this.addCommand({
            id: 'claude-subscription-setup',
            name: 'Run setup assistant',
            callback: () => this.openSetup()
        });
        this.addCommand({
            id: 'claude-subscription-rotate',
            name: 'Rotate token',
            callback: () => this.openSetup({ rotateOnly: true })
        });
        this.addCommand({
            id: 'claude-subscription-health',
            name: 'Check health',
            callback: () => this.runHealthCheck()
        });
    }

    async onunload(): Promise<void> {
        // nothing to tear down
    }

    async updateSettings(patch: Partial<ClaudeSubscriptionSettings>): Promise<void> {
        this.settings = { ...this.settings, ...patch };
        await this.saveData(this.settings);
    }

    openSetup(opts: { rotateOnly?: boolean } = {}): void {
        new SetupModal(this.app, {
            settings: this.settings,
            rotateOnly: opts.rotateOnly,
            onComplete: async () => {
                await this.updateSettings({ setupComplete: true });
            }
        }).open();
    }

    async runHealthCheck(): Promise<void> {
        const s = this.settings;
        const lines: string[] = [];
        const cliPath = await whichClaude();
        lines.push(cliPath ? `✓ claude: ${cliPath}` : '✗ claude not found on PATH');

        try {
            await fs.access(expandHome(s.configDir));
            lines.push(`✓ config dir: ${s.configDir}`);
        } catch {
            lines.push(`✗ config dir missing: ${s.configDir}`);
        }

        const token = await readToken(s.keychainService);
        if (!token) {
            lines.push(`✗ keychain: no entry for "${s.keychainService}"`);
        } else {
            lines.push(`✓ keychain: "${s.keychainService}" present`);
            const ok = await checkToken(s.claudeBin, s.configDir, token);
            lines.push(ok ? '✓ token is valid (claude auth status → loggedIn: true)' : '✗ token invalid or `claude auth status` failed');
        }

        try {
            await fs.access(expandHome(s.wrapperPath));
            lines.push(`✓ wrapper: ${s.wrapperPath}`);
        } catch {
            lines.push(`✗ wrapper missing: ${s.wrapperPath}`);
        }

        const oterm = await inspectOTerminal(this.app);
        if (!oterm.installed) {
            lines.push('✗ O Terminal not installed');
        } else if (oterm.currentShell && oterm.currentShell === expandHome(s.wrapperPath)) {
            lines.push(`✓ O Terminal defaultShell: ${oterm.currentShell}`);
        } else if (oterm.currentShell) {
            lines.push(`⚠ O Terminal defaultShell is "${oterm.currentShell}" (expected ${s.wrapperPath})`);
        } else {
            lines.push('⚠ O Terminal installed but defaultShell not set');
        }

        new Notice(lines.join('\n'), 10_000);
    }
}
