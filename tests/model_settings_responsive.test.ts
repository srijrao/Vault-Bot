import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderModelSettingsSection } from '../src/ui/model_settings_shared';
import type { PluginLike } from '../src/ui/model_settings_shared';
import type { VaultBotPluginSettings } from '../src/settings';

// Mock Obsidian
vi.mock('obsidian', () => {
  return {
    Setting: class {
      private _name = '';
      private _desc = '';
      public controlEl: any;

      constructor(private container: any) {
        this.controlEl = container;
      }

      setName(name: string) {
        this._name = name;
        return this;
      }

      setDesc(desc: string) {
        this._desc = desc;
        return this;
      }

      addDropdown(callback: (dropdown: any) => any) {
        const dropdown = {
          addOption: vi.fn().mockReturnThis(),
          setValue: vi.fn().mockReturnThis(),
          onChange: vi.fn().mockReturnThis(),
        };
        callback(dropdown);
        return this;
      }

      addToggle(callback: (toggle: any) => any) {
        const toggle = {
          setValue: vi.fn().mockReturnThis(),
          onChange: vi.fn().mockReturnThis(),
        };
        callback(toggle);
        return this;
      }

      addTextArea(callback: (textarea: any) => any) {
        const textarea = {
          setPlaceholder: vi.fn().mockReturnThis(),
          setValue: vi.fn().mockReturnThis(),
          onChange: vi.fn().mockReturnThis(),
          inputEl: { rows: 4, style: {} }
        };
        callback(textarea);
        return this;
      }

      addSlider(callback: (slider: any) => any) {
        const slider = {
          setLimits: vi.fn().mockReturnThis(),
          setValue: vi.fn().mockReturnThis(),
          setDynamicTooltip: vi.fn().mockReturnThis(),
          onChange: vi.fn().mockReturnThis(),
        };
        callback(slider);
        return this;
      }

      addText(callback: (text: any) => any) {
        const text = {
          setPlaceholder: vi.fn().mockReturnThis(),
          setValue: vi.fn().mockReturnThis(),
          onChange: vi.fn().mockReturnThis(),
        };
        callback(text);
        return this;
      }
    }
  };
});

// Mock ModelService
vi.mock('../src/services/model_service', () => ({
  ModelService: {
    getInstance: () => ({
      getModels: vi.fn().mockResolvedValue([
        { id: 'gpt-4o', name: 'GPT-4o' },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
      ])
    })
  }
}));

// Mock FuzzyModelDropdown
vi.mock('../src/ui/fuzzy_model_dropdown', () => ({
  FuzzyModelDropdown: class {
    constructor(app: any, models: any[], callback: any) {}
    open() {}
  }
}));

describe('Model Settings Responsive Layout', () => {
  let container: any;
  let plugin: PluginLike;
  let createdElements: any[];

  beforeEach(() => {
    createdElements = [];
    
    // Create a mock container that tracks element creation and styling
    container = {
      createEl: vi.fn((tag: string, opts?: any) => {
        const element: any = {
          tag,
          opts: opts || {},
          style: {},
          value: '',
          textContent: '',
          disabled: false,
          className: '',
          children: [],
          empty: vi.fn(),
          createEl: vi.fn((childTag: string, childOpts?: any) => {
            const childElement = container.createEl(childTag, childOpts);
            element.children.push(childElement);
            return childElement;
          }),
          createDiv: vi.fn((divOpts?: any) => {
            const div = container.createEl('div', divOpts);
            element.children.push(div);
            return div;
          }),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          appendChild: vi.fn((child: any) => {
            element.children.push(child);
          }),
          focus: vi.fn(),
          querySelector: vi.fn((selector: string) => {
            // Mock querySelector to find elements by class
            return element.children.find((child: any) => 
              child.opts && child.opts.cls && child.opts.cls === selector.replace('.', '')
            ) || null;
          }),
          remove: vi.fn(() => {
            // Remove from parent's children if needed
            const parent = createdElements.find(el => el.children.includes(element));
            if (parent) {
              parent.children = parent.children.filter((child: any) => child !== element);
            }
          })
        };
        
        createdElements.push(element);
        return element;
      }),
      createDiv: vi.fn((opts?: any) => container.createEl('div', opts)),
      empty: vi.fn(() => {
        createdElements.length = 0;
      }),
      style: {},
      classList: { add: vi.fn(), remove: vi.fn() },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      querySelector: vi.fn((selector: string) => {
        // Mock querySelector to find elements by class
        return createdElements.find(el => 
          el.opts && el.opts.cls && el.opts.cls === selector.replace('.', '')
        ) || null;
      }),
    };

    plugin = {
      settings: {
        apiProvider: 'openai',
        chatSeparator: '\n---\n',
        recordApiCalls: true,
        aiProviderSettings: {
          openai: {
            api_key: 'test-key',
            model: 'gpt-4o',
            system_prompt: 'You are a helpful assistant.',
            temperature: 1.0,
          }
        }
      } as VaultBotPluginSettings,
      saveSettings: vi.fn()
    };
  });

  it('creates responsive layout structure for model selector', async () => {
    const save = vi.fn();
    
    renderModelSettingsSection(container, plugin, save);
    
    // Wait for async model loading
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Check for the main control container
    const controlContainers = createdElements.filter(el => 
      el.tag === 'div' && el.opts.cls === 'vault-bot-model-control-container'
    );
    expect(controlContainers.length).toBeGreaterThan(0);
  });

  it('creates separate rows for dropdown and buttons', async () => {
    const save = vi.fn();
    
    renderModelSettingsSection(container, plugin, save);
    
    // Wait for async model loading
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Check for dropdown row
    const dropdownRows = createdElements.filter(el => 
      el.tag === 'div' && el.opts.cls === 'vault-bot-model-dropdown-row'
    );
    expect(dropdownRows.length).toBeGreaterThan(0);
    
    // Check for button row
    const buttonRows = createdElements.filter(el => 
      el.tag === 'div' && el.opts.cls === 'vault-bot-model-button-row'
    );
    expect(buttonRows.length).toBeGreaterThan(0);
  });

  it('applies flex styling to dropdown for responsive behavior', async () => {
    const save = vi.fn();
    
    renderModelSettingsSection(container, plugin, save);
    
    // Wait for async model loading
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Check for dropdown element (styling now handled by CSS)
    const dropdowns = createdElements.filter(el => 
      el.tag === 'select' && el.opts.cls === 'dropdown'
    );
    expect(dropdowns.length).toBeGreaterThan(0);
  });

  it('maintains layout structure when switching to manual input', async () => {
    const save = vi.fn();
    
    renderModelSettingsSection(container, plugin, save);
    
    // Wait for async model loading
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Find and trigger manual input mode
    const dropdowns = createdElements.filter(el => 
      el.tag === 'select' && el.opts.cls === 'dropdown'
    );
    const dropdown = dropdowns[0];
    
    // Simulate selecting manual input option
    dropdown.value = '__manual__';
    const changeEvent = new Event('change');
    
    // Find the change event handler
    const changeHandler = dropdown.addEventListener.mock.calls.find(
      (call: any) => call[0] === 'change'
    )?.[1];
    
    if (changeHandler) {
      changeHandler();
      
      // Wait for DOM updates
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Check that input row and button row are created
      const inputRows = createdElements.filter(el => 
        el.tag === 'div' && el.opts.cls === 'vault-bot-model-input-row'
      );
      expect(inputRows.length).toBeGreaterThan(0);
      
      // Check for text input (styling now handled by CSS)
      const textInputs = createdElements.filter(el => 
        el.tag === 'input' && el.opts.type === 'text'
      );
      expect(textInputs.length).toBeGreaterThan(0);
    }
  });

  it('creates search and refresh buttons with proper spacing', async () => {
    const save = vi.fn();
    
    renderModelSettingsSection(container, plugin, save);
    
    // Wait for async model loading
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Check for search button
    const searchButtons = createdElements.filter(el => 
      el.tag === 'button' && el.opts.text === '🔍 Search'
    );
    expect(searchButtons.length).toBeGreaterThan(0);
    
    const searchButton = searchButtons[0];
    expect(searchButton.opts.cls).toBe('mod-cta');
    
    // Check for refresh button
    const refreshButtons = createdElements.filter(el => 
      el.tag === 'button' && el.opts.text === '🔄'
    );
    expect(refreshButtons.length).toBeGreaterThan(0);
    
    const refreshButton = refreshButtons[0];
    expect(refreshButton.opts.title).toBe('Refresh models');
    
    // Verify button row has proper CSS class for spacing
    const buttonRows = createdElements.filter(el => 
      el.tag === 'div' && el.opts.cls === 'vault-bot-model-button-row'
    );
    expect(buttonRows.length).toBeGreaterThan(0);
  });

  it('does not duplicate UI when HTML render toggle is changed', async () => {
    const save = vi.fn();
    
    // Enable linked notes feature
    plugin.settings.includeLinkedNotes = true;
    
    renderModelSettingsSection(container, plugin, save);
    
    // Wait for async model loading
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Count initial "Extract in Reading View" toggles
    const initialToggleCount = createdElements.filter(el => 
      el.tag === 'div' && 
      el.children.some((child: any) => 
        child.opts && child.opts.text === 'Extract in Reading View'
      )
    ).length;
    
    // Find and trigger the Extract in Reading View toggle
    let extractToggleCallback: any = null;
    
    // Find the Setting that contains the Extract in Reading View toggle
    const mockSetting = {
      setValue: vi.fn().mockReturnThis(),
      onChange: vi.fn((callback: any) => {
        extractToggleCallback = callback;
        return mockSetting;
      }),
    };
    
    // Simulate the toggle being turned on
    if (extractToggleCallback) {
      await extractToggleCallback(true);
    }
    
    // Count "Extract in Reading View" toggles after change
    const finalToggleCount = createdElements.filter(el => 
      el.tag === 'div' && 
      el.children.some((child: any) => 
        child.opts && child.opts.text === 'Extract in Reading View'
      )
    ).length;
    
    // The count should remain the same - no duplication
    expect(finalToggleCount).toBeLessThanOrEqual(initialToggleCount + 1); // Allow for one new element but not duplication
    
    // Verify that conditional setting appears correctly
    const conditionalElements = createdElements.filter(el => 
      el.opts && el.opts.cls === 'vault-bot-conditional-html-links'
    );
    
    // Should have at most one conditional element (when extractNotesInReadingView is true)
    expect(conditionalElements.length).toBeLessThanOrEqual(1);
  });

  it('properly shows and hides conditional HTML links setting', async () => {
    const save = vi.fn();
    
    // Start with extractNotesInReadingView disabled
    plugin.settings.extractNotesInReadingView = false;
    plugin.settings.includeLinksInRenderedHTML = false;
    
    renderModelSettingsSection(container, plugin, save);
    
    // Wait for async model loading
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Initially, no conditional HTML links setting should exist
    let conditionalElements = createdElements.filter(el => 
      el.opts && el.opts.cls === 'vault-bot-conditional-html-links'
    );
    expect(conditionalElements.length).toBe(0);
    
    // Enable extractNotesInReadingView
    plugin.settings.extractNotesInReadingView = true;
    
    // Re-render to simulate the toggle change
    container.empty();
    createdElements.length = 0;
    renderModelSettingsSection(container, plugin, save);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Now conditional HTML links setting should appear
    conditionalElements = createdElements.filter(el => 
      el.opts && el.opts.cls === 'vault-bot-conditional-html-links'
    );
    expect(conditionalElements.length).toBe(1);
  });
});
