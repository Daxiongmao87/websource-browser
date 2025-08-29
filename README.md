# WebSource Browser

A dynamic command-line web page analysis tool with persistent browser sessions. WebSource Browser provides a live JavaScript console interface to any website using Puppeteer, enabling real-time interaction, inspection, and automation.

## Overview

WebSource Browser is designed around the philosophy of providing a **persistent live JavaScript console** into any website. Instead of writing rigid automation scripts, you start a browser session once and then interact dynamically with multiple commands while the browser stays open.

### Key Features

- **Persistent Browser Sessions**: Start a browser once, run multiple commands while it stays open
- **Dynamic JavaScript Execution**: Execute arbitrary JavaScript and get results back
- **Visual Inspection**: Take screenshots and inspect page elements
- **Selector Analysis**: Analyze page structure and available selectors
- **Session Management**: Manage multiple named browser sessions
- **Background Daemon**: Browser sessions run as background processes with automatic cleanup
- **Headless or GUI**: Run in headless mode or with visible browser window

## Installation

### Via npm (Recommended)

```bash
npm install -g websource-browser
```

### Prerequisites

- Node.js (version 18 or higher)
- npm

### From Source

If installing from source:

1. Clone or download the repository
2. Install dependencies:
```bash
npm install
```

3. Make executable and link globally:
```bash
chmod +x websource-browser
npm link
```

## Quick Start

WebSource Browser uses a **session-based workflow**. You must start a session first, then interact with it:

```bash
# 1. Start a session (browser opens and stays running)
websource-browser --start

# 2. Navigate to a website
websource-browser --navigate "https://example.com"

# 3. Interact with the page
websource-browser --execute "document.title"
websource-browser --view "h1"
websource-browser --screenshot

# 4. Stop the session when done
websource-browser --stop
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
websource-browser --start [--session <name>]

# Stop a session  
websource-browser --stop [--session <name>]

# List all sessions
websource-browser --list-sessions

# Specify session name for any command
websource-browser --navigate "https://example.com" --session my-session
```

### Navigation

```bash
# Navigate to URL
websource-browser --navigate "https://example.com"

# Wait time after navigation (default: 2000ms)
websource-browser --navigate "https://example.com" --wait 5000
```

### JavaScript Execution

```bash
# Execute JavaScript and get results
websource-browser --execute "document.title"
websource-browser --execute "document.querySelectorAll('a').length"
websource-browser --execute "window.location.href"

# Complex JavaScript
websource-browser --execute "
  Array.from(document.querySelectorAll('a'))
    .map(a => ({ text: a.textContent, href: a.href }))
    .slice(0, 5)
"
```

### Page Inspection

```bash
# View entire page content
websource-browser --view

# View specific element
websource-browser --view "h1"
websource-browser --view "#main-content"
websource-browser --view ".article-title"

# Analyze page selectors
websource-browser --selectors

# Analyze selectors within element
websource-browser --selectors "main"
websource-browser --selectors "#content"
```

### Screenshots

```bash
# Take screenshot (auto-named)
websource-browser --screenshot

# Take screenshot with specific filename
websource-browser --screenshot "my-page.png"
```

### Output Formatting

```bash
# Pretty-printed JSON output
websource-browser --execute "document.title" --format pretty

# Save output to file
websource-browser --view "h1" --output element-info.json

# Combine formatting and output
websource-browser --selectors --format pretty --output page-structure.json
```

### General Options

```bash
# Show help
websource-browser --help

# Enable debug mode
websource-browser --debug --start

# All commands support debug mode
websource-browser --debug --execute "console.log('debug test')"
```

## Usage Examples

### Basic Web Scraping

```bash
# Start session and navigate
websource-browser --start --session news
websource-browser --navigate "https://news.ycombinator.com" --session news

# Extract headlines
websource-browser --execute "
  Array.from(document.querySelectorAll('.titleline > a'))
    .slice(0, 10)
    .map(a => ({
      title: a.textContent,
      url: a.href
    }))
" --session news --format pretty

# Clean up
websource-browser --stop --session news
```

### Form Interaction

```bash
# Navigate to a search page
websource-browser --start
websource-browser --navigate "https://google.com"

# Fill and submit form
websource-browser --execute "document.querySelector('input[name=\"q\"]').value = 'Node.js'"
websource-browser --execute "document.querySelector('form').submit()"

# Wait for results and take screenshot
websource-browser --screenshot search-results.png
websource-browser --stop
```

### Page Analysis Workflow

```bash
# Start session
websource-browser --start --session analysis

# Navigate to target page
websource-browser --navigate "https://example.com" --session analysis

# Get overview of page structure
websource-browser --selectors --session analysis --format pretty

# Inspect specific sections
websource-browser --view "header" --session analysis
websource-browser --view "main" --session analysis
websource-browser --selectors "main" --session analysis

# Extract specific data
websource-browser --execute "
  {
    title: document.title,
    links: document.querySelectorAll('a').length,
    images: document.querySelectorAll('img').length,
    paragraphs: document.querySelectorAll('p').length
  }
" --session analysis --format pretty

# Take final screenshot
websource-browser --screenshot final-state.png --session analysis
websource-browser --stop --session analysis
```

### Multiple Sessions

```bash
# Start multiple sessions for different tasks
websource-browser --start --session site1
websource-browser --start --session site2

# Work with different sites simultaneously
websource-browser --navigate "https://github.com" --session site1
websource-browser --navigate "https://stackoverflow.com" --session site2

# Check session status
websource-browser --list-sessions

# Work with each session independently
websource-browser --execute "document.title" --session site1
websource-browser --execute "document.title" --session site2

# Stop specific sessions
websource-browser --stop --session site1
websource-browser --stop --session site2
```

## Architecture

WebSource Browser consists of several key components:

### WebNavigator (Main Class)
- Client interface that connects to browser sessions
- Handles command execution and output formatting
- Manages connections to session daemons

### SessionManager
- Manages session metadata and state files
- Located at `~/.local/lib/websource-browser/sessions/`
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
Sessions are stored in: `~/.local/lib/websource-browser/sessions/`

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
websource-browser --list-sessions
websource-browser --stop --session <name>

# Try starting with debug mode
websource-browser --debug --start
```

**Command says "no active session"**
```bash
# Ensure session is started first
websource-browser --start

# Check session status
websource-browser --list-sessions
```

**JavaScript execution fails**
```bash
# Use debug mode to see detailed errors
websource-browser --debug --execute "your-code-here"

# Check if page has loaded completely
websource-browser --execute "document.readyState"
```

**Permission errors**
```bash
# Make sure script is executable
chmod +x websource-browser

# Check Node.js and npm permissions
npm list puppeteer
```

### Debug Mode

Enable verbose output with `--debug`:

```bash
websource-browser --debug --start
websource-browser --debug --navigate "https://example.com"
websource-browser --debug --execute "document.title"
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
websource-browser --list-sessions

# Stop specific session
websource-browser --stop --session <name>

# Manual cleanup if needed
rm ~/.local/lib/websource-browser/sessions/<name>.json
```

## Advanced Usage

### Automation Scripts

WebSource Browser can be used in shell scripts:

```bash
#!/bin/bash
SESSION="automation-$(date +%s)"

# Start session
websource-browser --start --session "$SESSION"

# Navigate and extract data
websource-browser --navigate "https://example.com" --session "$SESSION"
DATA=$(websource-browser --execute "document.title" --session "$SESSION")

echo "Page title: $DATA"

# Cleanup
websource-browser --stop --session "$SESSION"
```

### JSON Processing

Combine with `jq` for advanced JSON processing:

```bash
# Extract specific fields
websource-browser --execute "document.title" --format json | jq -r '.result'

# Process complex data
websource-browser --selectors --format json | jq '.analysis.tagCounts'
```

### Background Monitoring

Since sessions run as background daemons, you can:

```bash
# Start long-running session
websource-browser --start --session monitor

# Run periodic checks
while true; do
  websource-browser --execute "document.title" --session monitor
  sleep 60
done
```

## Security Considerations

- WebSource Browser executes arbitrary JavaScript in web pages
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

MIT License - see [LICENSE](LICENSE) file for details.

## Related Tools

- [Puppeteer](https://pptr.dev/) - The underlying browser automation library
- [Playwright](https://playwright.dev/) - Alternative browser automation
- [Selenium](https://selenium.dev/) - Cross-browser web automation