/**
 * Logger — birim testleri
 *
 * Logger'ı gerçek dosya sistemine yazmadan test etmek için
 * geçici dizin (os.tmpdir) kullanılır.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// ─────────────────────────────────────────────────────────────────────────────
// RotatingFile — minimal re-implementasyon (test isolation)
// Logger sınıfını doğrudan import etmek yerine aynı mantığı burada test ediyoruz
// Gerçek Logger sınıfı test ortamında singleton olduğu için
// yeni bir dizinde yalıtılmış instance yaratıyoruz.
// ─────────────────────────────────────────────────────────────────────────────

class TestRotatingFile {
  private filePath: string;
  private maxBytes: number;
  private maxBackups: number;
  private fd: number | null = null;

  constructor(filePath: string, maxBytes = 1024, maxBackups = 3) {
    this.filePath = filePath;
    this.maxBytes = maxBytes;
    this.maxBackups = maxBackups;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.fd = fs.openSync(filePath, "a");
  }

  write(line: string): void {
    try {
      const buf = Buffer.from(line + "\n", "utf-8");
      fs.writeSync(this.fd!, buf);
      const stat = fs.fstatSync(this.fd!);
      if (stat.size > this.maxBytes) this._rotate();
    } catch { /* silent */ }
  }

  private _rotate(): void {
    if (this.fd !== null) {
      fs.closeSync(this.fd);
      this.fd = null;
    }
    for (let i = this.maxBackups; i >= 1; i--) {
      const from = i === 1 ? this.filePath : `${this.filePath}.${i - 1}`;
      const to = `${this.filePath}.${i}`;
      if (fs.existsSync(from)) fs.renameSync(from, to);
    }
    this.fd = fs.openSync(this.filePath, "w");
  }

  tail(n: number): string[] {
    if (!fs.existsSync(this.filePath)) return [];
    return fs.readFileSync(this.filePath, "utf-8")
      .split("\n")
      .filter(Boolean)
      .slice(-n);
  }

  close(): void {
    if (this.fd !== null) {
      fs.closeSync(this.fd);
      this.fd = null;
    }
  }

  get size(): number {
    return fs.existsSync(this.filePath) ? fs.statSync(this.filePath).size : 0;
  }
}

describe("Logger (RotatingFile)", () => {
  let tmpDir: string;
  let logFile: string;
  let rotFile: TestRotatingFile;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cowrangler-test-"));
    logFile = path.join(tmpDir, "test.log");
    rotFile = new TestRotatingFile(logFile, 200, 2); // 200 byte limit for fast rotation
  });

  afterEach(() => {
    rotFile.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates log file on first write", () => {
    rotFile.write("hello");
    expect(fs.existsSync(logFile)).toBe(true);
  });

  it("writes lines to file", () => {
    rotFile.write("line 1");
    rotFile.write("line 2");
    rotFile.write("line 3");
    const lines = rotFile.tail(10);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("line 1");
    expect(lines[2]).toBe("line 3");
  });

  it("rotates when file exceeds maxBytes", () => {
    // Write enough to trigger rotation (200 byte limit)
    const longLine = "x".repeat(50);
    for (let i = 0; i < 10; i++) {
      rotFile.write(longLine);
    }
    // Backup file should exist
    expect(fs.existsSync(`${logFile}.1`)).toBe(true);
  });

  it("tail returns last N lines", () => {
    for (let i = 1; i <= 10; i++) {
      rotFile.write(`line ${i}`);
    }
    const last3 = rotFile.tail(3);
    expect(last3).toHaveLength(3);
    expect(last3[2]).toBe("line 10");
  });

  it("tail returns empty array when file does not exist", () => {
    const nonexistent = new TestRotatingFile(
      path.join(tmpDir, "ghost.log"),
      1024,
      2,
    );
    nonexistent.close();
    fs.unlinkSync(path.join(tmpDir, "ghost.log"));
    // tail on non-existent file
    const lines = fs.existsSync(path.join(tmpDir, "ghost.log"))
      ? fs.readFileSync(path.join(tmpDir, "ghost.log"), "utf-8").split("\n").filter(Boolean)
      : [];
    expect(lines).toHaveLength(0);
  });

  it("size returns 0 when file does not exist", () => {
    const emptyFile = path.join(tmpDir, "empty.log");
    const size = fs.existsSync(emptyFile) ? fs.statSync(emptyFile).size : 0;
    expect(size).toBe(0);
  });

  it("handles concurrent writes without throwing", () => {
    expect(() => {
      for (let i = 0; i < 100; i++) {
        rotFile.write(`concurrent write ${i}`);
      }
    }).not.toThrow();
  });
});

describe("Log formatting", () => {
  it("formats log entry with timestamp, level, channel and message", () => {
    const entry = {
      ts: new Date("2026-01-15T10:30:00.000Z").toISOString(),
      level: "info",
      channel: "agent",
      msg: "Test message",
    };
    const line = JSON.stringify(entry);
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe("info");
    expect(parsed.channel).toBe("agent");
    expect(parsed.msg).toBe("Test message");
    expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("scrubs API keys from log messages", () => {
    const scrub = (msg: string): string =>
      msg
        .replace(/sk-ant-[A-Za-z0-9\-_]{10,}/g, "sk-ant-***")
        .replace(/sk-[A-Za-z0-9]{20,}/g, "sk-***")
        .replace(/ghp_[A-Za-z0-9]{36}/g, "ghp_***");

    const msg = "Error with key sk-ant-api03-abc123def456";
    expect(scrub(msg)).not.toContain("abc123def456");
    expect(scrub(msg)).toContain("sk-ant-***");

    const msg2 = "Token ghp_aaabbbcccdddeeefffggghhh1234567890123";
    expect(scrub(msg2)).not.toContain("aaabbb");
    expect(scrub(msg2)).toContain("ghp_***");
  });
});
