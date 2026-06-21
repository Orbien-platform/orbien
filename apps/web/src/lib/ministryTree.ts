// Shared helpers for the volunteers/ministries hierarchy.
// GET /volunteers/ministries returns root nodes with `children` nested
// recursively — these helpers work directly on that shape.

export interface MinistryTreeNode {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  parent_ministry_id?: string | null;
  children: MinistryTreeNode[];
}

export interface FlatMinistryOption {
  id: string;
  name: string;
  color?: string | null;
  depth: number;
}

export function flattenMinistryTree(
  nodes: MinistryTreeNode[],
  depth = 0
): FlatMinistryOption[] {
  const out: FlatMinistryOption[] = [];
  for (const node of nodes) {
    out.push({ id: node.id, name: node.name, color: node.color, depth });
    if (node.children?.length) {
      out.push(...flattenMinistryTree(node.children, depth + 1));
    }
  }
  return out;
}

export function findMinistryNode(
  nodes: MinistryTreeNode[],
  id: string
): MinistryTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children?.length) {
      const found = findMinistryNode(node.children, id);
      if (found) return found;
    }
  }
  return null;
}
