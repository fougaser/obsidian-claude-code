import { App, PluginSettingTab, Setting } from 'obsidian';
import type ClaudeSubscriptionPlugin from './main';

export class ClaudeSubscriptionSettingTab extends PluginSettingTab {
    private readonly plugin: ClaudeSubscriptionPlugin;

    constructor(app: App, plugin: ClaudeSubscriptionPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Claude Subscription' });

        new Setting(containerEl)
            .setName('Run setup assistant')
            .setDesc('Walks through login, token generation, Keychain storage, wrapper script, and O Terminal wiring.')
            .addButton(button =>
                button.setButtonText('Open setup').setCta().onClick(() => {
                    this.plugin.openSetup();
                })
            );

        new Setting(containerEl).setName('Paths').setHeading();

        new Setting(containerEl)
            .setName('Claude binary')
            .setDesc('Absolute path to the official `claude` executable. Run `which claude` in your shell to confirm.')
            .addText(text =>
                text
                    .setPlaceholder('/opt/homebrew/bin/claude')
                    .setValue(this.plugin.settings.claudeBin)
                    .onChange(async value => {
                        await this.plugin.updateSettings({ claudeBin: value.trim() || '/opt/homebrew/bin/claude' });
                    })
            );

        new Setting(containerEl)
            .setName('Config directory')
            .setDesc('Isolated CLAUDE_CONFIG_DIR for this setup. Keeps sessions / history separate from the default ~/.claude.')
            .addText(text =>
                text
                    .setPlaceholder('~/.claude-personal')
                    .setValue(this.plugin.settings.configDir)
                    .onChange(async value => {
                        await this.plugin.updateSettings({ configDir: value.trim() || '~/.claude-personal' });
                    })
            );

        new Setting(containerEl)
            .setName('Keychain service name')
            .setDesc('Name of the macOS Keychain generic-password entry holding the OAuth token.')
            .addText(text =>
                text
                    .setPlaceholder('Claude-Personal-Token')
                    .setValue(this.plugin.settings.keychainService)
                    .onChange(async value => {
                        await this.plugin.updateSettings({ keychainService: value.trim() || 'Claude-Personal-Token' });
                    })
            );

        new Setting(containerEl)
            .setName('Wrapper script path')
            .setDesc('Where to write the shell wrapper O Terminal will run as its default shell.')
            .addText(text =>
                text
                    .setPlaceholder('~/bin/claude-personal')
                    .setValue(this.plugin.settings.wrapperPath)
                    .onChange(async value => {
                        await this.plugin.updateSettings({ wrapperPath: value.trim() || '~/bin/claude-personal' });
                    })
            );

        new Setting(containerEl).setName('Maintenance').setHeading();

        new Setting(containerEl)
            .setName('Rotate token')
            .setDesc('Generate a fresh long-lived token and update the Keychain entry. Old token is invalidated server-side.')
            .addButton(button =>
                button.setButtonText('Rotate').onClick(() => {
                    this.plugin.openSetup({ rotateOnly: true });
                })
            );

        new Setting(containerEl)
            .setName('Check health')
            .setDesc('Verify binary, Keychain entry, wrapper, and O Terminal wiring.')
            .addButton(button =>
                button.setButtonText('Check').onClick(() => {
                    this.plugin.runHealthCheck();
                })
            );
    }
}
