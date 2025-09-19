// Mock types for Obsidian API to use in tests
export class Notice {
    constructor(message: string) {}
}

export class App {}

export class Plugin {
    app: App;
    settings: any;
    
    async loadData(): Promise<any> {
        return {};
    }
    
    async saveData(data: any): Promise<void> {}
}

export class PluginSettingTab {
    app: App;
    containerEl: any;
    
    constructor(app: App, plugin: any) {
        this.app = app;
        this.containerEl = {
            empty: () => {},
            createEl: () => {},
        };
    }
}

export class Setting {
    constructor(containerEl: any) {}
    
    setName(name: string): this {
        return this;
    }
    
    setDesc(desc: string): this {
        return this;
    }
    
    addText(callback: (text: any) => void): this {
        callback({
            setPlaceholder: () => this,
            setValue: () => this,
            onChange: () => this,
            inputEl: { type: '' },
        });
        return this;
    }
    
    addTextArea(callback: (text: any) => void): this {
        callback({
            setPlaceholder: () => this,
            setValue: () => this,
            onChange: () => this,
        });
        return this;
    }
    
    addSlider(callback: (slider: any) => void): this {
        callback({
            setLimits: () => this,
            setValue: () => this,
            setDynamicTooltip: () => this,
            onChange: () => this,
        });
        return this;
    }
}

export interface Editor {
    getSelection(): string;
    replaceSelection(text: string): void;
    getCursor(string?: string): { line: number; ch: number };
    replaceRange(text: string, from: any, to: any): void;
}

export interface MarkdownView {}

export class ItemView {
    containerEl: any;
    app: App;
    leaf: any;
    
    constructor(leaf: any) {
        this.leaf = leaf;
        this.containerEl = {
            empty: () => {},
            createEl: () => ({}),
            addClass: () => {},
            removeClass: () => {},
            find: () => ({}),
            appendChild: () => {},
        };
    }
    
    getViewType(): string {
        return 'mock-view';
    }
    
    getDisplayText(): string {
        return 'Mock View';
    }
    
    async onOpen(): Promise<void> {}
    
    async onClose(): Promise<void> {}
}
