import { describe, expect, it } from "vitest";

import {
  INITIAL_STATUS,
  UNSUPPORTED_STATUS,
  friendlyError,
  reduceUpdate,
} from "../src/updateState";

describe("reduceUpdate", () => {
  it("flujo normal: buscar → hay versión → descarga → lista", () => {
    let s = reduceUpdate(INITIAL_STATUS, { type: "check" });
    expect(s.state).toBe("checking");
    s = reduceUpdate(s, { type: "available", version: "0.2.0" });
    expect(s).toEqual({ state: "downloading", version: "0.2.0", percent: 0 });
    s = reduceUpdate(s, { type: "progress", percent: 41.6 });
    expect(s).toEqual({ state: "downloading", version: "0.2.0", percent: 42 });
    s = reduceUpdate(s, { type: "downloaded", version: "0.2.0" });
    expect(s).toEqual({ state: "ready", version: "0.2.0" });
  });

  it("sin novedades", () => {
    expect(
      reduceUpdate({ state: "checking" }, { type: "not-available" }).state,
    ).toBe("up-to-date");
  });

  it("el porcentaje se mantiene entre 0 y 100", () => {
    const s = reduceUpdate(INITIAL_STATUS, { type: "progress", percent: 250 });
    expect(s.percent).toBe(100);
    expect(
      reduceUpdate(INITIAL_STATUS, { type: "progress", percent: -5 }).percent,
    ).toBe(0);
  });

  it("una actualización lista no se pisa con una nueva búsqueda ni con un error", () => {
    const ready = { state: "ready", version: "0.2.0" } as const;
    expect(reduceUpdate(ready, { type: "check" })).toEqual(ready);
    expect(reduceUpdate(ready, { type: "error", message: "x" })).toEqual(ready);
    expect(reduceUpdate(ready, { type: "not-available" })).toEqual(ready);
  });

  it("en desarrollo (unsupported) nada cambia el estado", () => {
    expect(reduceUpdate(UNSUPPORTED_STATUS, { type: "check" })).toEqual(
      UNSUPPORTED_STATUS,
    );
  });

  it("un error vuelve a permitir buscar", () => {
    const s = reduceUpdate(
      { state: "checking" },
      { type: "error", message: "net::ERR_INTERNET_DISCONNECTED" },
    );
    expect(s.state).toBe("error");
    expect(reduceUpdate(s, { type: "check" }).state).toBe("checking");
  });
});

describe("friendlyError", () => {
  it("traduce los fallos comunes sin mostrar textos técnicos", () => {
    expect(friendlyError("net::ERR_INTERNET_DISCONNECTED")).toMatch(/conexión/);
    expect(
      friendlyError(new Error("getaddrinfo ENOTFOUND github.com")),
    ).toMatch(/conexión/);
    expect(
      friendlyError("Cannot find latest.yml in the latest release"),
    ).toMatch(/versión publicada/);
    expect(friendlyError("HTTP 403 rate limit exceeded")).toMatch(/limitó/);
    expect(friendlyError("algo raro")).toMatch(/No se pudo buscar/);
  });
});
