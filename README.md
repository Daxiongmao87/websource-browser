# Web Navigator

A dynamic command-line web automation tool with persistent browser sessions. Web Navigator provides a live JavaScript console interface to any website using Puppeteer, enabling real-time interaction, inspection, and automation.

## Overview

Web Navigator is designed around the philosophy of providing a **persistent live JavaScript console** into any website. Instead of writing rigid automation scripts, you start a browser session once and then interact dynamically with multiple commands while the browser stays open.

### Key Features

- **Persistent Browser Sessions**: Start a browser once, run multiple commands while it stays open
- **Dynamic JavaScript Execution**: Execute arbitrary JavaScript and get results back
- **Visual Inspection**: Take screenshots and inspect page elements
- **Selector Analysis**: Analyze page structure and available selectors
- **Session Management**: Manage multiple named browser sessions
- **Background Daemon**: Browser sessions run as background processes with automatic cleanup
- **Headless or GUI**: Run in headless mode or with visible browser window

## Installation

### Prerequisites

- Node.js (version 14 or higher)
- npm or yarn

### Setup

1. Ensure the script is executable:
```bash
chmod +x web-navigator
```

2. Install dependencies (Puppeteer):
```bash
npm install puppeteer
```

3. Optionally, symlink to your PATH for global access:
```bash
ln -s /path/to/web-navigator /usr/local/bin/web-navigator
```

## Quick Start

Web Navigator uses a **session-based workflow**. You must start a session first, then interact with it:

```bash
# 1. Start a session (browser opens and stays running)
./web-navigator --start

# 2. Navigate to a website
./web-navigator --navigate "https://example.com"

# 3. Interact with the page
./web-navigator --execute "document.title"
./web-navigator --view "h1"
./web-navigator --screenshot

# 4. Stop the session when done
./web-navigator --stop
```

## Core Concepts

### Sessions

- **Session**: A persistent browser instance that stays running between commands
- **Default Session**: If no `--session` name is specified, uses "default"  
- **Named Sessions**: Create multiple sessions for different websites/tasks
- **Background Daemon**: Sessions run as detached background processes
- **Auto-cleanup**: Sessions automatically shut down after 15 minutes of inactivity

### Workflow

1. **Start Session**: Launches a background browser daemon
2. **Execute Commands**: Run navigation, JavaScript, inspection commands  
3. **Session Persistence**: Browser stays open between commands
4. **Stop Session**: Explicitly close the browser when done

## Command Reference

### Session Management

```bash
# Start a session
./web-navigator --start [--session <name>]

# Stop a session  
./web-navigator --stop [--session <name>]

# List all sessions
./web-navigator --list-sessions

# Specify session name for any command
./web-navigator --navigate "https://example.com" --session my-session
```

### Navigation

```bash
# Navigate to URL
./web-navigator --navigate "https://example.com"

# Wait time after navigation (default: 2000ms)
./web-navigator --navigate "https://example.com" --wait 5000
```

### JavaScript Execution

```bash
# Execute JavaScript and get results
./web-navigator --execute "document.title"
./web-navigator --execute "document.querySelectorAll('a').length"
./web-navigator --execute "window.location.href"

# Complex JavaScript
./web-navigator --execute "
  Array.from(document.querySelectorAll('a'))
    .map(a => ({ text: a.textContent, href: a.href }))
    .slice(0, 5)
"
```

### Page Inspection

```bash
# View entire page content
./web-navigator --view

# View specific element
./web-navigator --view "h1"
./web-navigator --view "#main-content"
./web-navigator --view ".article-title"

# Analyze page selectors
./web-navigator --selectors

# Analyze selectors within element
./web-navigator --selectors "main"
./web-navigator --selectors "#content"
```

### Screenshots

```bash
# Take screenshot (auto-named)
./web-navigator --screenshot

# Take screenshot with specific filename
./web-navigator --screenshot "my-page.png"
```

### Output Formatting

```bash
# Pretty-printed JSON output
./web-navigator --execute "document.title" --format pretty

# Save output to file
./web-navigator --view "h1" --output element-info.json

# Combine formatting and output
./web-navigator --selectors --format pretty --output page-structure.json
```

### General Options

```bash
# Show help
./web-navigator --help

# Enable debug mode
./web-navigator --debug --start

# All commands support debug mode
./web-navigator --debug --execute "console.log('debug test')"
```

## Usage Examples

### Basic Web Scraping

```bash
# Start session and navigate
./web-navigator --start --session news
./web-navigator --navigate "https://news.ycombinator.com" --session news

# Extract headlines
./web-navigator --execute "
  Array.from(document.querySelectorAll('.titleline > a'))
    .slice(0, 10)
    .map(a => ({
      title: a.textContent,
      url: a.href
    }))
" --session news --format pretty

# Clean up
./web-navigator --stop --session news
```

### Form Interaction

```bash
# Navigate to a search page
./web-navigator --start
./web-navigator --navigate "https://google.com"

# Fill and submit form
./web-navigator --execute "document.querySelector('input[name=\"q\"]').value = 'Node.js'"
./web-navigator --execute "document.querySelector('form').submit()"

# Wait for results and take screenshot
./web-navigator --screenshot search-results.png
./web-navigator --stop
```

### Page Analysis Workflow

```bash
# Start session
./web-navigator --start --session analysis

# Navigate to target page
./web-navigator --navigate "https://example.com" --session analysis

# Get overview of page structure
./web-navigator --selectors --session analysis --format pretty

# Inspect specific sections
./web-navigator --view "header" --session analysis
./web-navigator --view "main" --session analysis
./web-navigator --selectors "main" --session analysis

# Extract specific data
./web-navigator --execute "
  {
    title: document.title,
    links: document.querySelectorAll('a').length,
    images: document.querySelectorAll('img').length,
    paragraphs: document.querySelectorAll('p').length
  }
" --session analysis --format pretty

# Take final screenshot
./web-navigator --screenshot final-state.png --session analysis
./web-navigator --stop --session analysis
```

### Multiple Sessions

```bash
# Start multiple sessions for different tasks
./web-navigator --start --session site1
./web-navigator --start --session site2

# Work with different sites simultaneously
./web-navigator --navigate "https://github.com" --session site1
./web-navigator --navigate "https://stackoverflow.com" --session site2

# Check session status
./web-navigator --list-sessions

# Work with each session independently
./web-navigator --execute "document.title" --session site1
./web-navigator --execute "document.title" --session site2

# Stop specific sessions
./web-navigator --stop --session site1
./web-navigator --stop --session site2
```

## Architecture

Web Navigator consists of several key components:

### WebNavigator (Main Class)
- Client interface that connects to browser sessions
- Handles command execution and output formatting
- Manages connections to session daemons

### SessionManager
- Manages session metadata and state files
- Located at `~/.local/lib/web-navigator/sessions/`
- Tracks session activity and health

### SessionDaemon
- Background process that runs the actual browser
- Automatic timeout after 15 minutes of inactivity
- Provides control server for client communication
- Handles graceful shutdown and cleanup

### Session Lifecycle
1. `--start` spawns a detached SessionDaemon process
2. SessionDaemon launches Chrome with remote debugging
3. Session file created with connection details
4. Client commands connect to existing daemon
5. Auto-cleanup or manual `--stop` terminates session

## Configuration

### Session Storage
Sessions are stored in: `~/.local/lib/web-navigator/sessions/`

Each session is a JSON file containing:
- WebSocket endpoint for browser connection
- Process ID of daemon
- Control port for communication
- Creation and activity timestamps

### Environment Variables
- `DEBUG=true` - Enable debug mode
- `WEB_NAVIGATOR_DAEMON=true` - Internal daemon flag
- `WEB_NAVIGATOR_SESSION_NAME` - Internal session name
- `WEB_NAVIGATOR_HEADLESS` - Internal headless setting

## Troubleshooting

### Common Issues

**Session doesn't start**
```bash
# Check if session exists and clean up
./web-navigator --list-sessions
./web-navigator --stop --session <name>

# Try starting with debug mode
./web-navigator --debug --start
```

**Command says "no active session"**
```bash
# Ensure session is started first
./web-navigator --start

# Check session status
./web-navigator --list-sessions
```

**JavaScript execution fails**
```bash
# Use debug mode to see detailed errors
./web-navigator --debug --execute "your-code-here"

# Check if page has loaded completely
./web-navigator --execute "document.readyState"
```

**Permission errors**
```bash
# Make sure script is executable
chmod +x web-navigator

# Check Node.js and npm permissions
npm list puppeteer
```

### Debug Mode

Enable verbose output with `--debug`:

```bash
./web-navigator --debug --start
./web-navigator --debug --navigate "https://example.com"
./web-navigator --debug --execute "document.title"
```

Debug mode shows:
- Session daemon startup details
- Browser connection information
- JavaScript execution traces
- Network and timing information

### Session Management

Clean up stuck sessions:

```bash
# List all sessions
./web-navigator --list-sessions

# Stop specific session
./web-navigator --stop --session <name>

# Manual cleanup if needed
rm ~/.local/lib/web-navigator/sessions/<name>.json
```

## Advanced Usage

### Automation Scripts

Web Navigator can be used in shell scripts:

```bash
#!/bin/bash
SESSION="automation-$(date +%s)"

# Start session
./web-navigator --start --session "$SESSION"

# Navigate and extract data
./web-navigator --navigate "https://example.com" --session "$SESSION"
DATA=$(./web-navigator --execute "document.title" --session "$SESSION")

echo "Page title: $DATA"

# Cleanup
./web-navigator --stop --session "$SESSION"
```

### JSON Processing

Combine with `jq` for advanced JSON processing:

```bash
# Extract specific fields
./web-navigator --execute "document.title" --format json | jq -r '.result'

# Process complex data
./web-navigator --selectors --format json | jq '.analysis.tagCounts'
```

### Background Monitoring

Since sessions run as background daemons, you can:

```bash
# Start long-running session
./web-navigator --start --session monitor

# Run periodic checks
while true; do
  ./web-navigator --execute "document.title" --session monitor
  sleep 60
done
```

## Security Considerations

- Web Navigator executes arbitrary JavaScript in web pages
- Be cautious when running JavaScript from untrusted sources  
- Sessions run with the same permissions as your user account
- Browser sessions may persist cookies and authentication
- Use headless mode when running on servers without displays

## Contributing

This is a single-file Node.js application. Key areas for contribution:
- Additional output formats
- Enhanced selector analysis
- Session sharing and import/export
- Integration with testing frameworks
- Performance optimizations

## License

[Add your license information here]

## Related Tools

- [Puppeteer](https://pptr.dev/) - The underlying browser automation library
- [Playwright](https://playwright.dev/) - Alternative browser automation
- [Selenium](https://selenium.dev/) - Cross-browser web automation