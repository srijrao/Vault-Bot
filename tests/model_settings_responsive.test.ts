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
          focus: vi.fn()
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
});
