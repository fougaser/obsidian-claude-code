import { Plugin } from 'obsidian';

/**
 * Claude Subscription — scaffold. Functional layers (Keychain token management,
 * isolated CLAUDE_CONFIG_DIR bootstrap, terminal integration) land in follow-ups.
 */
export default class ClaudeSubscriptionPlugin extends Plugin {
    async onload(): Promise<void> {
        console.log('Claude Subscription: plugin loaded (scaffold)');
    }

    async onunload(): Promise<void> {
        // nothing yet
    }
}
