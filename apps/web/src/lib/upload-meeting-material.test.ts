import { describe, it, expect } from "vitest";
import { validateMaterialFile } from "./upload-meeting-material";

const file = (name: string, type: string, size = 10) => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

describe("validateMaterialFile", () => {
  it("aceita PDF, DOC e DOCX", () => {
    expect(validateMaterialFile(file("a.pdf", "application/pdf"))).toBeNull();
    expect(validateMaterialFile(file("a.doc", "application/msword"))).toBeNull();
    expect(
      validateMaterialFile(
        file("a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
      )
    ).toBeNull();
  });

  it("recusa outros tipos e arquivo acima de 50MB", () => {
    expect(validateMaterialFile(file("a.png", "image/png"))).toMatch(/PDF ou Word/);
    expect(validateMaterialFile(file("a.pdf", "application/pdf", 51 * 1024 * 1024))).toMatch(/50MB/);
  });
});
