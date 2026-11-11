---
name: playwright
description: Playwright browser automation for E2E testing, scraping, form filling, screenshots, and web interaction via MCP Browser tools
license: MIT
metadata:
  version: "1.0.0"
---

# Playwright Browser Automation

Playwright automation via the built-in **Claude Browser MCP** (`mcp__Claude_Browser__preview_*` tools). No separate Playwright install needed — uses the desktop app's browser instance.

## When to Use

- E2E testing: "Test the login flow", "Run E2E tests for checkout"
- Scraping: "Extract product data from example.com"
- Form interaction: "Fill and submit the registration form"
- Visual verification: "Take screenshots of dashboard in mobile/desktop"
- Debugging: "Check console errors on page load", "Inspect network requests"
- Accessibility: "Verify page structure via accessibility tree"

## Quick Start

```bash
# No install needed — uses built-in browser
# Just invoke the skill:
Skill("playwright", "navigate to https://example.com and verify title")
```

## Available MCP Tools

| Tool | Purpose |
|------|---------|
| `preview_start` | Start dev server from `.claude/launch.json` |
| `preview_snapshot` | Accessibility tree (best for verification — token-efficient) |
| `preview_click` | Click elements by CSS selector |
| `preview_fill` | Fill inputs, textareas, selects |
| `preview_eval` | Run JavaScript in page context |
| `preview_screenshot` | Screenshots (JPEG, configurable scale) |
| `preview_network` | List/inspect network requests |
| `preview_console_logs` | Console output (errors, warnings, logs) |
| `preview_inspect` | Element styles, computed properties, bounding box |
| `preview_resize` | Viewport emulation (mobile/tablet/desktop) |
| `preview_stop` | Stop server, free resources |

## Common Patterns

### Start a Dev Server
```js
await mcp__Claude_Browser__preview_start({name: "web"});
// Returns {serverId, url}
```

### Navigate & Verify Content
```js
const snapshot = await mcp__Claude_Browser__preview_snapshot({serverId});
// snapshot = accessibility tree — search for role, name, text
```

### Fill Form & Submit
```js
await mcp__Claude_Browser__preview_fill({serverId, selector: '#email', value: 'user@test.com'});
await mcp__Claude_Browser__preview_fill({serverId, selector: '#password', value: 'secret'});
await mcp__Claude_Browser__preview_click({serverId, selector: 'button[type="submit"]'});
```

### Run Custom JavaScript
```js
await mcp__Claude_Browser__preview_eval({serverId, expression: `
  const links = Array.from(document.querySelectorAll('a')).map(a => a.href);
  console.log('Links:', links);
`});
```

### Screenshot for Visual Record
```js
await mcp__Claude_Browser__preview_screenshot({serverId, scale: 0.5});
```

### Responsive Testing
```js
await mcp__Claude_Browser__preview_resize({serverId, preset: "mobile"});  // 375x812
await mcp__Claude_Browser__preview_resize({serverId, preset: "tablet"}); // 768x1024
await mcp__Claude_Browser__preview_resize({serverId, preset: "desktop"}); // clear emulation
```

### Inspect Network Request
```js
const requests = await mcp__Claude_Browser__preview_network({serverId, filter: "failed"});
// Or get response body for specific request
const response = await mcp__Claude_Browser__preview_network({serverId, requestId: "abc123"});
```

### Check Console Errors
```js
const logs = await mcp__Claude_Browser__preview_console_logs({serverId, level: "error"});
```

## Full E2E Example

```js
// 1. Start app server
const {serverId} = await mcp__Claude_Browser__preview_start({name: "web"});

// 2. Login
await mcp__Claude_Browser__preview_fill({serverId, selector: 'input[name="email"]', value: 'user@test.com'});
await mcp__Claude_Browser__preview_fill({serverId, selector: 'input[name="password"]', value: 'pass123'});
await mcp__Claude_Browser__preview_click({serverId, selector: 'button:has-text("Sign in")'});

// 3. Verify dashboard loaded
const snapshot = await mcp__Claude_Browser__preview_snapshot({serverId});
// Check snapshot for expected elements (e.g., "Dashboard", "Welcome user")

// 4. Screenshot
await mcp__Claude_Browser__preview_screenshot({serverId, scale: 0.5});

// 5. Check for console errors
const errors = await mcp__Claude_Browser__preview_console_logs({serverId, level: "error"});

// 6. Cleanup
await mcp__Claude_Browser__preview_stop({serverId});
```

## Tips

- **Prefer `preview_snapshot` over screenshots** — accessibility tree is precise, token-efficient, and machine-readable
- **Use `preview_eval` for multi-step logic** — runs in page context, returns JSON
- **Always `preview_stop` when done** — frees browser resources
- **`preview_inspect` for visual verification** — returns computed styles, dimensions (better than screenshots for CSS)
- **`.claude/launch.json`** — configure your dev servers there (name, command, port, optional url)

## Launch Config Example (`.claude/launch.json`)

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "web",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "port": 3000
    },
    {
      "name": "api",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "api"],
      "port": 4000
    }
  ]
}
```

## Provenance

This skill wraps the **Claude Desktop App's built-in Browser MCP** (`mcp__Claude_Browser__preview_*`). No external Playwright installation required — the desktop app manages the browser instance.