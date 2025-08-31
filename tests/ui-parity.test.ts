import { describe, it, expect, beforeEach, vi } from 'vitest';

// Parity test ensures both Settings and Side Panel render identical shared UI

type Ctx = 'settings' | 'side';

// Logs captured across renders
const headers: Record<Ctx, string[]> = { settings: [], side: [] };
const fieldNames: Record<Ctx, string[]> = { settings: [], side: [] };
const emptyCounts: Record<Ctx, number> = { settings: 0, side: 0 };
const dropdownHandlers: Record<Ctx, Array<(val: string) => any>> = { settings: [], side: [] };

// Active context flag to attribute Setting calls
let activeCtx: Ctx = 'settings';

// Mock containers for Settings and Side Panel
const settingsContainer = {
  createEl: vi.fn((tag: string, opts?: any) => {
    if (tag === 'h2' && opts?.text) headers.settings.push(opts.text);
    return settingsContainer;
  }),
  empty: vi.fn(() => { emptyCounts.settings += 1; }),
};

const sideContainer = {
  createEl: vi.fn((tag: string, opts?: any) => {
    if (tag === 'h2' && opts?.text) headers.side.push(opts.text);
    return sideContainer;
  }),
  empty: vi.fn(() => { emptyCounts.side += 1; }),
};

// Create a combined obsidian mock that can satisfy both settings.ts and side_panel.ts
vi.mock('obsidian', () => {
  class MockItemView {
    containerEl: any;
    leaf: any;
    constructor(leaf: any) {
      this.leaf = leaf;
      this.containerEl = { children: [null, sideContainer] };
    }
  }

  class MockPluginSettingTab {
    app: any;
    containerEl: any;
    constructor(app: any, plugin: any) {
      this.app = app;
      this.containerEl = settingsContainer;
    }
  }

  const Setting = vi.fn(() => {
    const setting = {
      setName: vi.fn((name: string) => { fieldNames[activeCtx].push(name); return setting; }),
      setDesc: vi.fn(() => setting),
      addText: vi.fn((cb: any) => {
        const text = {
          setPlaceholder: vi.fn().mockReturnThis(),
          setValue: vi.fn().mockReturnThis(),
          onChange: vi.fn().mockReturnThis(),
          inputEl: { style: {} },
        };
        cb(text);
        return setting;
      }),
      addTextArea: vi.fn((cb: any) => {
        const textArea = {
          setPlaceholder: vi.fn().mockReturnThis(),
          setValue: vi.fn().mockReturnThis(),
          onChange: vi.fn().mockReturnThis(),
          inputEl: { rows: 4, style: {} },
        };
        cb(textArea);
        return setting;
      }),
      addSlider: vi.fn((cb: any) => {
        const slider = {
          setLimits: vi.fn().mockReturnThis(),
          setValue: vi.fn().mockReturnThis(),
          setDynamicTooltip: vi.fn().mockReturnThis(),
          onChange: vi.fn().mockReturnThis(),
        };
        cb(slider);
        return setting;
      }),
      addDropdown: vi.fn((cb: any) => {
        const dropdown = {
          addOption: vi.fn(() => dropdown),
          setValue: vi.fn(() => dropdown),
          onChange: vi.fn((handler: (val: string) => any) => { dropdownHandlers[activeCtx].push(handler); return dropdown; }),
        };
        cb(dropdown);
        return setting;
      }),
      addToggle: vi.fn((cb: any) => {
        const toggle = {
          setValue: vi.fn().mockReturnThis(),
          onChange: vi.fn().mockReturnThis(),
        };
        cb(toggle);
        return setting;
      }),
      addButton: vi.fn((cb: any) => {
        const btn = {
          setButtonText: vi.fn().mockReturnThis(),
          setTooltip: vi.fn().mockReturnThis(),
          setCta: vi.fn().mockReturnThis(),
          setWarning: vi.fn().mockReturnThis(),
          onClick: vi.fn().mockReturnThis(),
        };
        cb(btn);
        return setting;
      }),
    } as any;
    return setting;
  });

  return {
    ItemView: MockItemView,
    PluginSettingTab: MockPluginSettingTab,
    Setting,
    Notice: vi.fn(),
  Modal: class { constructor(public app?: any) {} open() {} close() {} onOpen() {} onClose() {} },
  } as any;
});

// Mock other dependencies used in settings.ts
vi.mock('../src/archiveCalls', () => ({ zipOldAiCalls: vi.fn() }));
vi.mock('../src/prompt_modal', () => ({ openAiBotConfigModal: vi.fn() }));
vi.mock('../src/aiprovider', async (importOriginal) => {
  const actual = await importOriginal() as any;
  class MockAIProviderWrapper {
    settings: any;
    constructor(settings: any) { this.settings = settings; }
    validateApiKey = vi.fn().mockResolvedValue({ valid: true });
  }
  return { ...actual, AIProviderWrapper: MockAIProviderWrapper };
});

describe('Shared Model Settings UI parity', () => {
  let VaultBotSettingTab: any;
  let AiBotSidePanel: any;
  let DEFAULT_SETTINGS: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    headers.settings = []; headers.side = [];
    fieldNames.settings = []; fieldNames.side = [];
    emptyCounts.settings = 0; emptyCounts.side = 0;
    dropdownHandlers.settings = []; dropdownHandlers.side = [];

    // Import after mocks are set
    ({ VaultBotSettingTab, DEFAULT_SETTINGS } = await import('../src/settings'));
    ({ AiBotSidePanel } = await import('../src/side_panel'));
  });

  function newPlugin() {
    const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    return { app: {}, settings, saveSettings: vi.fn().mockResolvedValue(undefined) } as any;
  }

  it('renders identical header text in both views', () => {
    const plugin = newPlugin();

    // Settings
    activeCtx = 'settings';
    const settingTab = new VaultBotSettingTab({}, plugin);
    settingTab.display();

    // Side Panel
    activeCtx = 'side';
    const panel = new AiBotSidePanel({} as any, plugin);
    panel.onOpen();

    expect(headers.settings).toContain('AI Bot Model Settings');
    expect(headers.side).toContain('AI Bot Model Settings');
  });

  it('renders same core fields for OpenAI in both views', () => {
    const plugin = newPlugin();
    plugin.settings.apiProvider = 'openai';

    activeCtx = 'settings';
    const settingTab = new VaultBotSettingTab({}, plugin);
    settingTab.display();

    activeCtx = 'side';
    const panel = new AiBotSidePanel({} as any, plugin);
    panel.onOpen();

    const expected = ['Provider', 'Model', 'System Prompt', 'Temperature'];
    expected.forEach((name) => {
      expect(fieldNames.settings).toContain(name);
      expect(fieldNames.side).toContain(name);
    });
  });

  it('renders same fields for OpenRouter in both views', () => {
    const plugin = newPlugin();
    plugin.settings.apiProvider = 'openrouter';

    activeCtx = 'settings';
    const settingTab = new VaultBotSettingTab({}, plugin);
    settingTab.display();

    activeCtx = 'side';
    const panel = new AiBotSidePanel({} as any, plugin);
    panel.onOpen();

    const expected = ['Provider', 'Model', 'System Prompt', 'Temperature', 'Site URL (Optional)', 'Site Name (Optional)'];
    expected.forEach((name) => {
      expect(fieldNames.settings).toContain(name);
      expect(fieldNames.side).toContain(name);
    });
  });

  it('provider switch triggers re-render in both views', async () => {
    const plugin = newPlugin();
    plugin.settings.apiProvider = 'openai';

    // Settings
    activeCtx = 'settings';
    const settingTab = new VaultBotSettingTab({}, plugin);
    settingTab.display();
    expect(dropdownHandlers.settings.length).toBeGreaterThan(0);
  const lastSettingsHandler = dropdownHandlers.settings[dropdownHandlers.settings.length - 1];
  await lastSettingsHandler?.('openrouter');
    // After switching provider, we expect at least one empty() call (re-render)
    expect(emptyCounts.settings).toBeGreaterThan(0);
    expect(fieldNames.settings).toContain('Site URL (Optional)');

    // Side Panel
    activeCtx = 'side';
    const panel = new AiBotSidePanel({} as any, plugin);
    await panel.onOpen();
    expect(dropdownHandlers.side.length).toBeGreaterThan(0);
  const lastSideHandler = dropdownHandlers.side[dropdownHandlers.side.length - 1];
  await lastSideHandler?.('openai');
    expect(emptyCounts.side).toBeGreaterThan(0);
    expect(fieldNames.side).toContain('Temperature');
  });

  it('initializes provider defaults when missing (both views)', () => {
    const plugin = newPlugin();
    // Remove both provider blocks to test defaults
  (plugin.settings.aiProviderSettings as any).openai = undefined;
  (plugin.settings.aiProviderSettings as any).openrouter = undefined;

    activeCtx = 'settings';
    const settingTab = new VaultBotSettingTab({}, plugin);
    settingTab.display();
    // Defaults should have rendered OpenAI fields by default provider
    expect(fieldNames.settings).toContain('Model');
    expect(fieldNames.settings).toContain('System Prompt');

    activeCtx = 'side';
    const panel = new AiBotSidePanel({} as any, plugin);
    panel.onOpen();
    expect(fieldNames.side).toContain('Model');
    expect(fieldNames.side).toContain('System Prompt');
  });
});
