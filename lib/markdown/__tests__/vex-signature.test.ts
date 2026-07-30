import { describe, it, expect } from "bun:test";
import {
  parseSignature,
  isArgumentLabel,
  indexArguments,
  returnTypes,
  tokenize,
} from "../vex-signature";

// ---------------------------------------------------------------------------
// parseSignature — every shape below is copied verbatim from a live page.
// ---------------------------------------------------------------------------
describe("parseSignature", () => {
  it("parses a plain signature", () => {
    const sig = parseSignature("int  addattrib(int geohandle, string attribclass, string name, <type>defvalue)");
    expect(sig).not.toBeNull();
    expect(sig!.returnType).toBe("int");
    expect(sig!.name).toBe("addattrib");
    expect(sig!.args).toEqual([
      { type: "int", name: "geohandle" },
      { type: "string", name: "attribclass" },
      { type: "string", name: "name" },
      { type: "<type>", name: "defvalue" },
    ]);
  });

  // The scraper drops the space between a union type and its argument name,
  // because SideFX renders the type as a superscript label above it. A greedy
  // \w+ pattern mis-reads this as type "int|stringchanne" + name "l".
  it("splits a union type that lost its space before the argument name", () => {
    const sig = parseSignature("float  chop(string filename, int|stringchannel, float|intsample)");
    expect(sig!.args).toEqual([
      { type: "string", name: "filename" },
      { type: "int|string", name: "channel" },
      { type: "float|int", name: "sample" },
    ]);
  });

  it("keeps the & on arguments the function writes back to", () => {
    const sig = parseSignature("float  xyzdist(<geometry>geometry, vector origin, int &prim, vector &uv)");
    expect(sig!.args[2]).toEqual({ type: "int", name: "&prim" });
    expect(sig!.args[3]).toEqual({ type: "vector", name: "&uv" });
  });

  it("handles array types on both the return and the arguments", () => {
    const sig = parseSignature("<type>[] usd_flattenedprimvar(<stage>stage, string primpath)");
    expect(sig!.returnType).toBe("<type>[]");
    expect(sig!.args[0]).toEqual({ type: "<stage>", name: "stage" });

    const arr = parseSignature("float  curvearclen(vector positions[], float uv1)");
    expect(arr!.args[0]).toEqual({ type: "vector", name: "positions[]" });
  });

  it("handles a union return type", () => {
    expect(parseSignature("float|vector|vector2 gxnoise(vector2 xy)")!.returnType)
      .toBe("float|vector|vector2");
  });

  it("marks the variadic argument", () => {
    const sig = parseSignature("vector|vector4 colormap(string filename, vector uvw, ...)");
    expect(sig!.args[2]).toEqual({ type: null, name: "...", variadic: true });
  });

  it("captures a default value", () => {
    const sig = parseSignature('void setattrib(int geohandle, string mode="set")');
    expect(sig!.args[1]).toEqual({ type: "string", name: "mode", defaultValue: '"set"' });
  });

  it("takes no argument list", () => {
    expect(parseSignature("int geoself()")!.args).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Rejections. A false positive here would restyle an unrelated page, so the
  // parser must decline anything that is not unmistakably a VEX signature.
  // ---------------------------------------------------------------------------
  it("rejects prose, calls without a return type, and unknown types", () => {
    expect(parseSignature("geohandle")).toBeNull();
    expect(parseSignature("addattrib(0, \"point\", \"foo\", 0)")).toBeNull();
    expect(parseSignature("Adds an attribute to a geometry.")).toBeNull();
    expect(parseSignature("hou.Node.createNode(node_type_name)")).toBeNull();
    // "widget" is not a VEX type, so this is not a VEX signature.
    expect(parseSignature("widget makeThing(int a)")).toBeNull();
  });

  it("rejects a signature with an argument it cannot read, rather than dropping it", () => {
    // Losing an argument silently would be worse than not transforming at all.
    expect(parseSignature("int f(int a, ??? b)")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("isArgumentLabel", () => {
  it("accepts the identifiers that head an argument description", () => {
    for (const s of ["geohandle", "&prim", "<geometry>", "attribute_name", "pnts[]"]) {
      expect(isArgumentLabel(s)).toBe(true);
    }
  });

  it("rejects prose and calls", () => {
    for (const s of ["One of detail", "geoself()", "a b"]) {
      expect(isArgumentLabel(s)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
describe("indexArguments", () => {
  const sigs = [
    parseSignature("float  xyzdist(<geometry>geometry, vector origin, int &prim)")!,
    parseSignature("float  xyzdist(<geometry>geometry, string primgroup, vector origin)")!,
  ];

  it("resolves a description label by name, with or without the &", () => {
    const ix = indexArguments(sigs);
    expect(ix.get("origin")!.type).toBe("vector");
    expect(ix.get("prim")!.name).toBe("&prim");
    expect(ix.get("&prim")!.type).toBe("int");
  });

  it("resolves a label written as the placeholder type", () => {
    // SideFX heads this description "<geometry>", not "geometry".
    const arg = indexArguments(sigs).get("<geometry>");
    expect(arg!.name).toBe("geometry");
  });

  it("picks up a type only declared on a later overload", () => {
    expect(indexArguments(sigs).get("primgroup")!.type).toBe("string");
  });
});

// ---------------------------------------------------------------------------
describe("returnTypes", () => {
  it("collapses repeats but keeps genuinely different returns", () => {
    const same = ["int  f(int a)", "int  f(int a, int b)"].map((s) => parseSignature(s)!);
    expect(returnTypes(same)).toEqual(["int"]);

    const varied = ["float  chop(string f)", "matrix  chop(string f)"].map((s) => parseSignature(s)!);
    expect(returnTypes(varied)).toEqual(["float", "matrix"]);
  });
});

// ---------------------------------------------------------------------------
describe("tokenize", () => {
  it("emits every part of the signature exactly once", () => {
    const sig = parseSignature("int  addattrib(int geohandle, <type>defvalue)")!;
    const tokens = tokenize(sig);
    expect(tokens.map((t) => t.text).join("")).toBe("int addattrib(int geohandle, <type> defvalue)");
    expect(tokens.find((t) => t.kind === "fn")!.text).toBe("addattrib");
    expect(tokens.filter((t) => t.kind === "type").map((t) => t.text)).toEqual(["int", "int", "<type>"]);
  });

  it("gives the & its own token so it can be coloured", () => {
    const sig = parseSignature("float  xyzdist(vector origin, int &prim)")!;
    const tokens = tokenize(sig);
    expect(tokens.some((t) => t.kind === "out" && t.text === "&")).toBe(true);
    expect(tokens.map((t) => t.text).join("")).toBe("float xyzdist(vector origin, int &prim)");
  });
});
