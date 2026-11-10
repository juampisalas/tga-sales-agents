import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

type RpcMessage = {
  id?: number;
  result?: { isError?: boolean; content?: { text?: string }[] };
  error?: { message?: string };
};

export class ExtensionSearchReader {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (message: RpcMessage) => void; reject: (error: Error) => void }>();
  private starting: Promise<void> | null = null;

  async read(profileDirName: string): Promise<{ ok: true; snapshot: string } | { ok: false; reason: string }> {
    try {
      await this.ensure(profileDirName);
      const message = await this.request("tools/call", { name: "browser_snapshot", arguments: {} }, 45000);
      if (message.error) {
        return { ok: false, reason: message.error.message ?? "Playwright no pudo leer la pestaña." };
      }
      if (message.result?.isError) {
        const detail = message.result.content?.map((part) => part.text ?? "").join(" ").trim();
        return { ok: false, reason: detail || "Playwright no pudo leer la pestaña." };
      }
      const snapshot = message.result?.content?.map((part) => part.text ?? "").join("\n") ?? "";
      if (!snapshot.trim()) {
        return { ok: false, reason: "La pestaña conectada no devolvió contenido." };
      }
      return { ok: true, snapshot };
    } catch (error) {
      this.stop();
      const message = error instanceof Error ? error.message : "No se pudo leer Sales Navigator.";
      return { ok: false, reason: message };
    }
  }

  stop(): void {
    this.starting = null;
    const child = this.child;
    this.child = null;
    for (const waiter of this.pending.values()) {
      waiter.reject(new Error("Se cerró la conexión con Playwright."));
    }
    this.pending.clear();
    child?.kill("SIGTERM");
  }

  private async ensure(profileDirName: string): Promise<void> {
    if (this.child && this.child.exitCode === null && this.starting) {
      await this.starting;
      return;
    }
    this.stop();
    this.starting = this.start(profileDirName);
    await this.starting;
  }

  private start(profileDirName: string): Promise<void> {
    const child = spawn("npx", ["--yes", "@playwright/mcp@latest", "--extension", "--profile-dir-name", profileDirName], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-2000);
    });
    child.stdout.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString();
      let index = this.buffer.indexOf("\n");
      while (index !== -1) {
        const line = this.buffer.slice(0, index).trim();
        this.buffer = this.buffer.slice(index + 1);
        index = this.buffer.indexOf("\n");
        if (!line) {
          continue;
        }
        try {
          this.receive(JSON.parse(line) as RpcMessage);
        } catch {
          // Playwright may write a non-JSON line before the handshake.
        }
      }
    });
    child.on("exit", () => {
      if (this.child === child) {
        this.child = null;
        this.starting = null;
      }
    });
    return this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "tga-sales-commander", version: "0.1.0" },
    }, 20000).then((message) => {
      if (message.error) {
        throw new Error(message.error.message ?? (stderr || "Playwright no inició."));
      }
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    });
  }

  private request(method: string, params: unknown, timeoutMs: number): Promise<RpcMessage> {
    const child = this.child;
    if (!child) {
      return Promise.reject(new Error("No hay una conexión con Playwright."));
    }
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Playwright sigue en la página Welcome. En esa pestaña, clic en Allow & select y elegí Buscar | Sales Navigator."));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  private receive(message: RpcMessage): void {
    if (message.id === undefined) {
      return;
    }
    const waiter = this.pending.get(message.id);
    if (!waiter) {
      return;
    }
    this.pending.delete(message.id);
    waiter.resolve(message);
  }
}
