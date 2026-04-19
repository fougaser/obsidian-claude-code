export interface ClaudeSubscriptionSettings {
    claudeBin: string;
    configDir: string;
    keychainService: string;
    wrapperPath: string;
    setupComplete: boolean;
}

export const DEFAULT_SETTINGS: ClaudeSubscriptionSettings = {
    claudeBin: '/opt/homebrew/bin/claude',
    configDir: '~/.claude-personal',
    keychainService: 'Claude-Personal-Token',
    wrapperPath: '~/bin/claude-personal',
    setupComplete: false
};

export function mergeSettings(stored: Partial<ClaudeSubscriptionSettings> | null): ClaudeSubscriptionSettings {
    return {
        claudeBin: typeof stored?.claudeBin === 'string' && stored.claudeBin.length > 0 ? stored.claudeBin : DEFAULT_SETTINGS.claudeBin,
        configDir: typeof stored?.configDir === 'string' && stored.configDir.length > 0 ? stored.configDir : DEFAULT_SETTINGS.configDir,
        keychainService:
            typeof stored?.keychainService === 'string' && stored.keychainService.length > 0
                ? stored.keychainService
                : DEFAULT_SETTINGS.keychainService,
        wrapperPath:
            typeof stored?.wrapperPath === 'string' && stored.wrapperPath.length > 0 ? stored.wrapperPath : DEFAULT_SETTINGS.wrapperPath,
        setupComplete: stored?.setupComplete === true
    };
}
