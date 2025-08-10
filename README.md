# Vault Bot

A versatile AI assistant plugin for Obsidian that enables seamless interaction with AI models directly within your notes.

## Features

- **Text Selection AI Response**: Highlight any text in your notes and get AI-powered responses instantly
- **Streaming Responses**: Real-time streaming of AI responses for immediate feedback
- **Customizable Chat Separator**: Configure how AI conversations are formatted in your notes
- **Multiple AI Provider Support**: Currently supports OpenAI with extensible architecture for future providers
- **Configurable AI Settings**: Adjust model, temperature, system prompts, and other AI parameters
- **Response Control**: Start and stop AI responses at any time

## Commands

The plugin adds two commands to Obsidian:

- **Get Response**: Sends highlighted text to the AI and streams the response directly into your note
- **Stop Response**: Cancels an ongoing AI response generation

## How to Use

1. **Setup**: Configure your API key and AI provider settings in the plugin settings tab
2. **Get AI Response**:
   - Highlight any text in your note
   - Use the command palette (Ctrl/Cmd + P) and search for "Get Response"
   - Or assign a hotkey to the "Get Response" command
   - The AI will process your highlighted text and stream the response directly into your note
3. **Stop Response**: Use the "Stop Response" command to cancel an ongoing AI response

## Configuration

Access the plugin settings through Settings → Community Plugins → Vault Bot:

- **API Key**: Your OpenAI API key
- **API Provider**: Currently supports OpenAI (more providers coming soon)
- **Chat Separator**: The text used to separate your query from the AI response (default: `\n\n----\n\n`)
- **AI Provider Settings**:
  - **Model**: Choose your preferred OpenAI model (default: gpt-4o)
  - **System Prompt**: Customize the AI's behavior and personality
  - **Temperature**: Control response creativity (0.0 = deterministic, 2.0 = very creative)

## Installation

### From Obsidian Community Plugins (Recommended)

1. Open Obsidian Settings
2. Go to Community Plugins and disable Safe Mode
3. Click Browse and search for "Vault Bot"
4. Install and enable the plugin

### Manual Installation

1. Download the latest release from the [GitHub releases page](https://github.com/srijrao/Vault-Bot/releases)
2. Extract the files to your vault's plugins folder: `VaultFolder/.obsidian/plugins/vault-bot/`
3. Reload Obsidian and enable the plugin in settings

## Development

This plugin is built with TypeScript and uses modern development practices.

### Setup

- Ensure Node.js v16 or higher is installed (`node --version`)
- Clone this repository
- Run `npm install` to install dependencies
- Run `npm run dev` to start development mode with hot reloading

### Building

- Run `npm run build` to create a production build
- Run `npm test` to run the test suite

### Project Structure

```
src/
├── aiprovider.ts     # AI provider interfaces and implementations
├── command_handler.ts # Command handling and response streaming
└── settings.ts       # Plugin settings and configuration UI
```

## Contributing

Contributions are welcome! Please feel free to submit issues, feature requests, or pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built on the [Obsidian Plugin API](https://github.com/obsidianmd/obsidian-api)
- Uses OpenAI API for AI capabilities
- Inspired by the need for seamless AI integration in note-taking workflows

## Support

If you find this plugin helpful, consider:

- ⭐ Starring the repository
- 🐛 Reporting bugs or suggesting features
- 🤝 Contributing to the codebase

---

*Created by [srijrao](https://github.com/srijrao)*
