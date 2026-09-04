import { describe, expect, it } from "vitest";
import {
  findMinistryNode,
  flattenMinistryTree,
  type MinistryTreeNode,
} from "./ministryTree";

const tree: MinistryTreeNode[] = [
  {
    id: "1",
    name: "Louvor",
    children: [
      { id: "1.1", name: "Vocal", children: [] },
      {
        id: "1.2",
        name: "Instrumental",
        children: [{ id: "1.2.1", name: "Bateria", children: [] }],
      },
    ],
  },
  { id: "2", name: "Mídia", children: [] },
];

describe("flattenMinistryTree", () => {
  it("achata a árvore em pré-ordem com a profundidade correta", () => {
    expect(flattenMinistryTree(tree)).toEqual([
      { id: "1", name: "Louvor", color: undefined, depth: 0 },
      { id: "1.1", name: "Vocal", color: undefined, depth: 1 },
      { id: "1.2", name: "Instrumental", color: undefined, depth: 1 },
      { id: "1.2.1", name: "Bateria", color: undefined, depth: 2 },
      { id: "2", name: "Mídia", color: undefined, depth: 0 },
    ]);
  });

  it("retorna vazio para lista vazia", () => {
    expect(flattenMinistryTree([])).toEqual([]);
  });
});

describe("findMinistryNode", () => {
  it("encontra nó na raiz", () => {
    expect(findMinistryNode(tree, "2")?.name).toBe("Mídia");
  });

  it("encontra nó aninhado em qualquer profundidade", () => {
    expect(findMinistryNode(tree, "1.2.1")?.name).toBe("Bateria");
  });

  it("retorna null quando não encontra", () => {
    expect(findMinistryNode(tree, "inexistente")).toBeNull();
  });
});
