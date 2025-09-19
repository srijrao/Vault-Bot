/**
 * Debug utility to conditionally log console outputs based on plugin settings
 * Only errors are logged by default - all other console outputs require debug mode
 */

import type { VaultBotPluginSettings } from '../settings';

let debugSettings: VaultBotPluginSettings | null = null;

/**
 * Initialize the debug utility with plugin settings
 * Call this when the plugin loads or settings change
 */
export function initDebugMode(settings: VaultBotPluginSettings) {
    debugSettings = settings;
}

/**
 * Check if debug mode is enabled
 */
export function isDebugModeEnabled(): boolean {
    return debugSettings?.debugMode === true;
}

/**
 * Debug-aware console logging functions
 * Only log when debug mode is enabled (except for errors which always log)
 */
export const debugConsole = {
    /**
     * Log a message only when debug mode is enabled
     */
    log: (...args: any[]) => {
        if (isDebugModeEnabled()) {
            console.log(...args);
        }
    },

    /**
     * Log an info message only when debug mode is enabled
     */
    info: (...args: any[]) => {
        if (isDebugModeEnabled()) {
            console.info(...args);
        }
    },

    /**
     * Log a warning only when debug mode is enabled
     */
    warn: (...args: any[]) => {
        if (isDebugModeEnabled()) {
            console.warn(...args);
        }
    },

    /**
     * Always log errors regardless of debug mode
     * Errors are important for troubleshooting and should always be visible
     */
    error: (...args: any[]) => {
        console.error(...args);
    },

    /**
     * Log a debug message only when debug mode is enabled
     */
    debug: (...args: any[]) => {
        if (isDebugModeEnabled()) {
            console.debug(...args);
        }
    }
};
