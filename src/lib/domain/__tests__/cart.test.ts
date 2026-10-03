import { describe, expect, it } from "vitest";
import {
  addCustomService,
  cartToLineInputs,
  cartToSaleItems,
  catalogQuantity,
  isPriceOverridden,
  removeLine,
  resetLinePrice,
  setLinePrice,
  setLineQuantity,
  toggleCatalogService,
  updateCustomService,
  validateCustomService,
  type CartLine,
} from "../cart";
import { calculateSaleTotals } from "../sale-calculations";

const pedicure = { id: "svc-pedicure", name: "Pedicure", priceCents: 1500 };
const manicure = { id: "svc-manicure", name: "Manicure", priceCents: 1000 };
const totals = (lines: CartLine[], discount?: Parameters<typeof calculateSaleTotals>[1]) =>
  calculateSaleTotals(cartToLineInputs(lines), discount);

describe("per-sale price override", () => {
  it("defaults to the catalog price and recalculates when overridden", () => {
    let cart = toggleCatalogService([], pedicure);
    expect(totals(cart).finalTotalCents).toBe(1500);
    cart = setLinePrice(cart, cart[0].key, 1000);
    expect(cart[0]).toMatchObject({ standardPriceCents: 1500, unitPriceCents: 1000 });
    expect(isPriceOverridden(cart[0])).toBe(true);
    expect(totals(cart).finalTotalCents).toBe(1000);
  });

  it("never changes the catalog price — the next client starts at $15 again", () => {
    const first = toggleCatalogService([], pedicure);
    setLinePrice(first, first[0].key, 1000);
    expect(pedicure.priceCents).toBe(1500);
    const nextClient = toggleCatalogService([], pedicure);
    expect(nextClient[0].unitPriceCents).toBe(1500);
  });

  it("can be reset to the standard price", () => {
    let cart = toggleCatalogService([], pedicure);
    cart = resetLinePrice(setLinePrice(cart, cart[0].key, 1000), cart[0].key);
    expect(cart[0].unitPriceCents).toBe(1500);
    expect(isPriceOverridden(cart[0])).toBe(false);
  });

  it("ignores negative or non-integer prices", () => {
    const cart = toggleCatalogService([], pedicure);
    expect(setLinePrice(cart, cart[0].key, -100)[0].unitPriceCents).toBe(1500);
    expect(setLinePrice(cart, cart[0].key, Number.NaN)[0].unitPriceCents).toBe(1500);
  });

  it("allows $0 (complimentary)", () => {
    const cart = toggleCatalogService([], pedicure);
    expect(totals(setLinePrice(cart, cart[0].key, 0)).finalTotalCents).toBe(0);
  });

  it("is separate from the sale discount — both can apply", () => {
    let cart = toggleCatalogService(toggleCatalogService([], pedicure), manicure);
    cart = setLinePrice(cart, cart[0].key, 1000); // Pedicure $15 → $10
    expect(totals(cart, { type: "FIXED", value: 500 })).toEqual({ subtotalCents: 2000, discountCents: 500, finalTotalCents: 1500 });
  });

  it("uses the charged price × quantity", () => {
    let cart = toggleCatalogService([], pedicure);
    cart = setLineQuantity(setLinePrice(cart, cart[0].key, 1200), cart[0].key, 3);
    expect(totals(cart).subtotalCents).toBe(3600);
    expect(catalogQuantity(cart, pedicure.id)).toBe(3);
  });

  it("sends the charged price to the server", () => {
    let cart = toggleCatalogService([], pedicure);
    cart = setLinePrice(cart, cart[0].key, 1000);
    expect(cartToSaleItems(cart)).toEqual([{ kind: "catalog", serviceId: pedicure.id, quantity: 1, unitPriceCents: 1000 }]);
  });
});

describe("custom services", () => {
  it("adds a custom service that totals like any other line", () => {
    const cart = addCustomService(toggleCatalogService([], manicure), { name: "  Nail Repair ", unitPriceCents: 800 });
    expect(cart[1]).toMatchObject({ kind: "custom", name: "Nail Repair", unitPriceCents: 800, estimatedCostCents: 0, quantity: 1 });
    expect(totals(cart).finalTotalCents).toBe(1800);
    expect(cartToSaleItems(cart)[1]).toEqual({ kind: "custom", name: "Nail Repair", quantity: 1, unitPriceCents: 800, estimatedCostCents: 0 });
  });

  it("can be edited before completing the sale", () => {
    let cart = addCustomService([], { name: "Nail Repair", unitPriceCents: 800 });
    cart = updateCustomService(cart, cart[0].key, { name: "Nail Repair (2 nails)", unitPriceCents: 1200, estimatedCostCents: 150, quantity: 2 });
    expect(cart[0]).toMatchObject({ name: "Nail Repair (2 nails)", unitPriceCents: 1200, estimatedCostCents: 150, quantity: 2 });
    expect(totals(cart).finalTotalCents).toBe(2400);
  });

  it("can be removed before completing the sale", () => {
    let cart = toggleCatalogService([], manicure);
    cart = addCustomService(cart, { name: "Nail Repair", unitPriceCents: 800 });
    const customKey = cart.find((l) => l.kind === "custom")!.key;
    cart = removeLine(cart, customKey);
    expect(cart).toHaveLength(1);
    expect(cart.some((l) => l.kind === "custom")).toBe(false);
    expect(totals(cart).finalTotalCents).toBe(1000);
    expect(cartToSaleItems(cart)).toEqual([{ kind: "catalog", serviceId: manicure.id, quantity: 1, unitPriceCents: 1000 }]);
  });

  it("validates name, price, cost and quantity", () => {
    expect(validateCustomService({ name: "Nail Repair", unitPriceCents: 800 }).ok).toBe(true);
    expect(validateCustomService({ name: "Free touch-up", unitPriceCents: 0 }).ok).toBe(true);
    const bad = (d: Parameters<typeof validateCustomService>[0]) => {
      const r = validateCustomService(d);
      return r.ok ? {} : r.errors;
    };
    expect(bad({ name: "   ", unitPriceCents: 800 })).toHaveProperty("name");
    expect(bad({ name: "Repair", unitPriceCents: null })).toHaveProperty("price");
    expect(bad({ name: "Repair", unitPriceCents: Number.NaN })).toHaveProperty("price");
    expect(bad({ name: "Repair", unitPriceCents: -1 })).toHaveProperty("price");
    expect(bad({ name: "Repair", unitPriceCents: 800, estimatedCostCents: -5 })).toHaveProperty("cost");
    expect(bad({ name: "Repair", unitPriceCents: 800, quantity: 0 })).toHaveProperty("quantity");
  });

  it("tapping a service card toggles only catalog lines", () => {
    let cart = addCustomService(toggleCatalogService([], manicure), { name: "Manicure touch-up", unitPriceCents: 300 });
    cart = toggleCatalogService(cart, manicure); // remove the catalog manicure
    expect(cart).toHaveLength(1);
    expect(cart[0].kind).toBe("custom");
  });
});
