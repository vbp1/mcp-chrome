# Agent Setup Prompt: Chrome MCP Server from Source

Use this prompt to instruct an AI agent to set up the Chrome MCP Server extension and native bridge from source code.

---

## Prompt

You are setting up **Chrome MCP Server** — a Chrome extension that exposes browser control via the Model Context Protocol (MCP). The project lives in a pnpm monorepo. Follow every step below in order.

### Prerequisites

| Requirement | Minimum version |
| ----------- | --------------- |
| Node.js     | 20.0.0+         |
| pnpm        | 8.0+            |
| Chrome      | any recent      |
| Git         | any recent      |

Rust and wasm-pack are **not** required unless you need to rebuild the `wasm-simd` package.

Before doing anything else, verify the prerequisites:

```bash
node -v   # must be >= 20
pnpm -v   # must be >= 8
```

If pnpm is missing, install it:

```bash
npm install -g pnpm
```

### Step 1 — Clone and install dependencies

```bash
git clone <repo-url> mcp-chrome
cd mcp-chrome
pnpm install
```

### Step 2 — Build packages in order

The shared package must be built first because every other package depends on it.

```bash
pnpm run build:shared
pnpm run build:native
pnpm run build:extension
```

### Step 3 — Load the extension in Chrome

1. Open `chrome://extensions/` in Chrome.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the directory: `app/chrome-extension/.output/chrome-mv3`
5. Note the **Extension ID** shown under the extension name.

The build uses a deterministic key so the ID should be `boikkdejnhfpdpojdjmhllpngplpnang`. If your ID differs, update `app/native-server/src/scripts/constant.ts`:

```typescript
export const EXTENSION_ID = '<your-actual-extension-id>';
```

Then rebuild: `pnpm run build:native`

### Step 4 — Register the native messaging host

Run from the repository root:

```bash
node app/native-server/dist/cli.js register --browser chrome
```

This creates a JSON manifest that tells Chrome where to find the native host process and which extension IDs are allowed to connect.

#### Where the manifest is written

| OS      | User-level path                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------ |
| Windows | `%APPDATA%\Google\Chrome\NativeMessagingHosts\com.chromemcp.nativehost.json`                     |
| macOS   | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.chromemcp.nativehost.json` |
| Linux   | `~/.config/google-chrome/NativeMessagingHosts/com.chromemcp.nativehost.json`                     |

For **Chromium**, replace `Google/Chrome` (or `google-chrome`) with `Chromium` (or `chromium`).

#### Platform-specific notes

**Windows**:

- A registry key is also created at `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.chromemcp.nativehost`.
- If you need system-level registration, run an elevated terminal and add `--system`.

**macOS**:

- After registration, **fully quit Chrome** (Cmd+Q) and reopen — closing the window is not enough.
- If you use a Node version manager (nvm, volta, fnm, asdf), the native messaging context may not find Node. Fix by setting the environment variable before registering:
  ```bash
  export CHROME_MCP_NODE_PATH=$(which node)
  node app/native-server/dist/cli.js register --browser chrome
  ```

**Linux**:

- Ensure the wrapper script is executable:
  ```bash
  chmod +x app/native-server/dist/run_host.sh
  ```

### Step 5 — Verify the installation

```bash
node app/native-server/dist/cli.js doctor
```

All checks should show `[OK]`. The **Connectivity** check will show `[WARN]` until you connect from the extension — this is normal.

Common issues and fixes:

| Symptom                                  | Fix                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| `Invalid manifest (path does not match)` | Re-run the register command from Step 4.                                     |
| `Node executable not found`              | Set `CHROME_MCP_NODE_PATH` env var to your node binary path and re-register. |
| `Extension ID mismatch`                  | Update `constant.ts` with your actual ID, rebuild native, re-register.       |
| Wrapper script permission denied (Unix)  | `chmod +x app/native-server/dist/run_host.sh`                                |

### Step 6 — Connect

1. Click the Chrome MCP Server extension icon or open the side panel.
2. Press **Connect**.
3. The status should change to **Connected / Service Running**.

### Step 7 — Configure an MCP client

The native server exposes MCP on `http://127.0.0.1:12306/mcp` (Streamable HTTP).

Example configuration for Claude Code (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "chrome-mcp": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:12306/mcp"
    }
  }
}
```

STDIO mode is also available via `app/native-server/dist/mcp/mcp-server-stdio.js`.

### Development mode

For hot-reload during development:

```bash
pnpm run dev
```

This watches all packages in parallel. After changing native server code, rebuild with `pnpm run build:native` and reconnect.

### Logs

Logs are stored in a user-writable directory:

| OS      | Path                                     |
| ------- | ---------------------------------------- |
| Windows | `%LOCALAPPDATA%\mcp-chrome-bridge\logs\` |
| macOS   | `~/Library/Logs/mcp-chrome-bridge/`      |
| Linux   | `~/.local/state/mcp-chrome-bridge/logs/` |

### Quick reference — all build commands

```bash
pnpm install              # Install dependencies
pnpm run build:shared     # Build shared types (must be first)
pnpm run build:native     # Build native server
pnpm run build:extension  # Build Chrome extension
pnpm run build            # Build all (excludes wasm-simd)
pnpm run dev              # Development with hot-reload
pnpm run lint             # Run ESLint
pnpm run format           # Run Prettier
pnpm run typecheck        # TypeScript type checking
```
