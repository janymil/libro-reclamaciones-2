import { describe, expect, it } from "vitest";

import { buildGettingStarted, type GettingStartedInput } from "./getting-started";

/**
 * "Primeros pasos" on /panel: the doubts that only appear AFTER registering.
 *
 * Every assertion here is a branch a real account can hit - a fresh signup, a
 * chain that has not added its sucursales yet, and a tenant whose sucursal
 * predates the automatic Libro (the one that must be told, not the one that must
 * be nagged forever).
 */

const base: GettingStartedInput = {
  businessName: "Empresa SAC",
  libroSlug: "empresa-sac",
  isEmailVerified: true,
  establishments: 1,
  books: 1,
  expectedLocales: 1,
};

const step = (input: Partial<GettingStartedInput>, id: string) =>
  buildGettingStarted({ ...base, ...input }).steps.find((entry) => entry.id === id);

describe("buildGettingStarted", () => {
  it("hides itself when the account needs nothing", () => {
    const plan = buildGettingStarted(base);

    expect(plan.allDone).toBe(true);
    expect(plan.pending).toBe(0);
    // No chain target and every local has its book: no extra rows.
    expect(plan.steps.map((entry) => entry.id)).toEqual(["libro-en-linea", "correo-confirmado"]);
  });

  it("asks for the confirmation of the notification mailbox", () => {
    const plan = buildGettingStarted({ ...base, isEmailVerified: false });

    expect(plan.allDone).toBe(false);
    expect(step({ isEmailVerified: false }, "correo-confirmado")).toMatchObject({
      done: false,
      action: "resend-verification",
      actionLabel: "Reenviar correo",
    });
  });

  it("counts the locales a chain declared, casa matriz included", () => {
    const pending = step({ expectedLocales: 5, establishments: 2 }, "sucursales");
    expect(pending).toMatchObject({ done: false, href: "/sucursales" });
    expect(pending?.description).toContain("5 locales");
    expect(pending?.description).toContain("Registraste 2");

    const complete = buildGettingStarted({
      ...base,
      expectedLocales: 5,
      establishments: 5,
      books: 5,
    });
    // The row stays (it is the "your network is registered" milestone) but no
    // longer counts as pending.
    expect(complete.steps.find((entry) => entry.id === "sucursales")).toMatchObject({
      done: true,
      title: "Tus locales están registrados",
    });
    expect(complete.allDone).toBe(true);
  });

  it("does not invent a target for an account that never declared one", () => {
    // One local, no plan saved (older tenant, another browser): no "agrega tus
    // locales" row, because we have nothing to compare against.
    const plan = buildGettingStarted({ ...base, expectedLocales: null, establishments: 1 });

    expect(plan.steps.map((entry) => entry.id)).not.toContain("sucursales");
    expect(plan.allDone).toBe(true);
  });

  it("flags a sucursal that has no per-local register", () => {
    // The legacy shape this app shipped for a while: the local exists, its
    // register does not, so its complaints cannot be exported for inspection.
    const plan = buildGettingStarted({ ...base, establishments: 2, books: 1 });
    const missing = step({ establishments: 2, books: 1 }, "registro-por-local");

    expect(plan.allDone).toBe(false);
    expect(missing).toMatchObject({ done: false, href: "/libros" });
    expect(missing?.description).toContain("2 locales y 1 registro");
  });

  it("celebrates the network once every local has its register", () => {
    const done = step({ establishments: 3, books: 3 }, "registro-por-local");
    expect(done?.done).toBe(true);
    expect(done?.title).toBe("Cada local tiene su registro");
  });

  it("waits for the public link before claiming the book is live", () => {
    const pending = step({ libroSlug: null }, "libro-en-linea");
    expect(pending?.done).toBe(false);
    expect(pending?.href).toBe("/codigo-qr");
  });

  it("omits the per-local register row while there is no local at all", () => {
    // Cannot happen through the app (registration always creates one), but the
    // panel must not render "0 locales y 0 registros" if it ever does.
    const plan = buildGettingStarted({ ...base, establishments: 0, books: 0 });
    expect(plan.steps.map((entry) => entry.id)).not.toContain("registro-por-local");
  });

  it("warns when the public link has no local to file against", () => {
    // A tenant can lose its last local (closed, or trimmed by hand): the link is
    // live and every other step is done, so without this row the checklist would
    // hide itself while the book cannot accept a single complaint.
    const plan = buildGettingStarted({ ...base, establishments: 0, books: 0 });
    const step0 = plan.steps.find((entry) => entry.id === "primer-local");

    expect(step0).toMatchObject({ done: false, href: "/sucursales" });
    expect(plan.allDone).toBe(false);
  });

  it("does not repeat the obvious for a single local", () => {
    // One local with its register is the normal case: no milestone row.
    const plan = buildGettingStarted({ ...base, establishments: 1, books: 1 });
    expect(plan.steps.map((entry) => entry.id)).not.toContain("registro-por-local");
    expect(plan.steps.map((entry) => entry.id)).not.toContain("primer-local");
  });

  it("keeps the steps in the order they matter", () => {
    const plan = buildGettingStarted({
      ...base,
      expectedLocales: 3,
      establishments: 1,
      books: 0,
      isEmailVerified: false,
    });

    expect(plan.steps.map((entry) => entry.id)).toEqual([
      "libro-en-linea",
      "correo-confirmado",
      "sucursales",
      "registro-por-local",
    ]);
    expect(plan.pending).toBe(3);
  });
});
