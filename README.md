# Yescode Stats

A VS Code extension that displays your Yescode subscription balance in the status bar.

## Features

- Displays the most critical balance metric (Daily or Weekly percentage) in the status bar
- Shows Pay-as-you-go balance when subscription is depleted
- Secure API key storage using VS Code SecretStorage
- Automatic refresh every 30 minutes
- Color-coded warnings (red for <20%, yellow for <50%)
- Detailed tooltip with full balance breakdown

## Setup

1. Install the extension
2. Run the command `Yescode: Set API Key` from the Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
3. Enter your Yescode API key
4. The balance will automatically appear in the status bar

## Commands

- `Yescode: Set API Key` - Store your API key securely
- `Yescode: Refresh Balance` - Manually refresh the balance display
- `Yescode: Show Balance` - Display the current balance

## Usage

The extension will automatically:
- Fetch your balance on startup
- Update every 30 minutes
- Show the most critical metric (lower percentage between daily and weekly)
- Switch to PAYG display when subscription balance is depleted

Click the status bar item to manually refresh the balance.

## Requirements

- VS Code 1.85.0 or higher
- Valid Yescode API key

## Development

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes
npm run watch

# Run the extension
Press F5 in VS Code to open Extension Development Host
```

## License

MIT
