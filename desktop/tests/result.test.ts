import { describe, expect, it } from "vitest";

import { WorkspaceError } from "../src/workspace/paths";
import {
  argContent,
  argString,
  argVersion,
  toResult,
} from "../src/workspace/result";

describe("toResult", () => {
  it("envuelve el valor", async () => {
    expect(await toResult(async () => 5)).toEqual({ ok: true, value: 5 });
  });

  it("conserva el código de WorkspaceError", async () => {
    const r = await toResult(async () => {
      throw new WorkspaceError("EXISTS", "Ya existe.");
    });
    expect(r).toEqual({
      ok: false,
      error: { code: "EXISTS", message: "Ya existe." },
    });
  });

  it("traduce errores del sistema sin exponer rutas", async () => {
    const mk = (code: string) =>
      toResult(async () => {
        throw Object.assign(new Error("EPERM: C:/Users/secreto/x"), { code });
      });
    for (const code of ["EPERM", "EBUSY", "ENOSPC", "XXXX"]) {
      const r: any = await mk(code);
      expect(r.ok).toBe(false);
      expect(r.error.code).toBe("IO_ERROR");
      expect(r.error.message).not.toContain("secreto");
    }
  });
});

describe("validadores de argumentos IPC", () => {
  it("argString exige string y longitud máxima", () => {
    expect(argString("a", "x")).toBe("a");
    expect(() => argString(1, "x")).toThrow(WorkspaceError);
    expect(() => argString({}, "x")).toThrow(WorkspaceError);
    expect(() => argString("a".repeat(5000), "x")).toThrow(WorkspaceError);
  });

  it("argContent exige string", () => {
    expect(argContent("{}")).toBe("{}");
    expect(() => argContent(null)).toThrow(WorkspaceError);
  });

  it("argVersion acepta null o una versión bien formada", () => {
    const hash = "a".repeat(64);
    expect(argVersion(null)).toBeNull();
    expect(argVersion(undefined)).toBeNull();
    expect(argVersion({ mtimeMs: 1, size: 2, hash })).toEqual({
      mtimeMs: 1,
      size: 2,
      hash,
    });
    for (const bad of [
      {},
      { mtimeMs: "1", size: 2, hash },
      { mtimeMs: 1, size: 2, hash: "zz" },
      "x",
      5,
    ]) {
      expect(() => argVersion(bad)).toThrow(WorkspaceError);
    }
  });
});
