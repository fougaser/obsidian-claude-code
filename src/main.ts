import { addIcon, Notice, Plugin } from 'obsidian';
import { ClaudeSubscriptionSettingTab } from './settingsTab';
import { SetupModal } from './setupModal';
import { checkToken } from './claudeCli';
import { readToken } from './keychain';
import { inspectOTerminal } from './oTerminal';
import { expandHome, whichClaude } from './shell';
import { ClaudeSubscriptionSettings, DEFAULT_SETTINGS, mergeSettings } from './settings';
import * as fs from 'fs/promises';

const CLAUDE_ICON_ID = 'claude-code-logo';
const CLAUDE_ICON_SVG =
    '<path fill="currentColor" d="M50 6c2.2 23 9.6 30.8 38 42-28.4 11.2-35.8 19-38 42-2.2-23-9.6-30.8-38-42 28.4-11.2 35.8-19 38-42z"/>';
const O_TERMINAL_COMMAND_ID = 'o-terminal:open-terminal';

// xterm.js marks its root element with this class; matching on it is more
// robust than matching on O Terminal's workspace view data-type because it
// still works if the terminal is popped out, embedded, or re-themed.
const XTERM_ROOT_SELECTOR = '.xterm';

export default class ClaudeSubscriptionPlugin extends Plugin {
    settings: ClaudeSubscriptionSettings = DEFAULT_SETTINGS;

    async onload(): Promise<void> {
        const stored = (await this.loadData()) as Partial<ClaudeSubscriptionSettings> | null;
        this.settings = mergeSettings(stored);

        addIcon(CLAUDE_ICON_ID, CLAUDE_ICON_SVG);

        this.addSettingTab(new ClaudeSubscriptionSettingTab(this.app, this));

        this.addRibbonIcon(CLAUDE_ICON_ID, 'Open Claude Code terminal', () => {
            this.openClaudeTerminal();
        });

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
        this.addCommand({
            id: 'claude-subscription-open-terminal',
            name: 'Open Claude Code terminal',
            callback: () => this.openClaudeTerminal()
        });

        this.installTerminalKeyPassthrough();
    }

    // When the active event target is inside an xterm container, prevent
    // Obsidian's global hotkey manager from consuming any key events. The
    // listener runs in the capture phase on document, so xterm's own
    // target-phase listener still fires and sees the event normally.
    //
    // This is deliberately broad: the terminal should own every keystroke
    // while focused (Tab, arrows, ⌘T, ⌘K, ⌃C, etc.), matching how users
    // expect VS Code / Warp / iTerm terminals to behave. System-level
    // shortcuts (⌘W, ⌘Q) are wired through Electron's menu accelerators and
    // are not affected by DOM event propagation, so they still work.
    private terminalKeyHandler: ((e: KeyboardEvent) => void) | null = null;

    private installTerminalKeyPassthrough(): void {
        const handler = (e: KeyboardEvent): void => {
            const target = e.target as HTMLElement | null;
            if (!target || !target.closest(XTERM_ROOT_SELECTOR)) return;
            e.stopPropagation();
        };
        document.addEventListener('keydown', handler, { capture: true });
        this.terminalKeyHandler = handler;
    }

    private uninstallTerminalKeyPassthrough(): void {
        if (!this.terminalKeyHandler) return;
        document.removeEventListener(
            'keydown',
            this.terminalKeyHandler,
            { capture: true } as AddEventListenerOptions
        );
        this.terminalKeyHandler = null;
    }

    openClaudeTerminal(): void {
        const commands = (this.app as unknown as {
            commands?: { executeCommandById?: (id: string) => boolean };
        }).commands;
        const ran = commands?.executeCommandById?.(O_TERMINAL_COMMAND_ID) ?? false;
        if (!ran) {
            new Notice(
                'Could not open terminal. Make sure the "O Terminal" plugin is installed and enabled.',
                8000
            );
        }
    }

    async onunload(): Promise<void> {
        this.uninstallTerminalKeyPassthrough();
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
