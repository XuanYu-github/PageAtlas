export const CARD_W = 200;
export const CARD_H = 120;
export const GAP_X = 320;
export const GAP_Y = 280;

export interface GraphPoint {
  x: number;
  y: number;
}

export interface GraphEdgeData {
  source: string;
  target: string;
  type?: string;
  label?: string;
}

export interface GraphLayoutNode extends GraphPoint {
  id: string;
}

export interface KnowledgeGraphNode extends GraphLayoutNode {
  title: string;
  isInferred: boolean;
  page: number | null;
  cluster?: string;
  w?: number;
  h?: number;
  bgColor?: string;
}

export const getRandomPaperColor = (): string => {
  const papers = ['#ffffff', '#fdfbf7', '#fcfcfc'];
  return papers[Math.floor(Math.random() * papers.length)];
};

export function getDistance(p1: GraphPoint, p2: GraphPoint): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

export function getClosestPoints<T extends GraphLayoutNode>(
  srcNode: T,
  tgtNode: T
): {start: GraphPoint; end: GraphPoint} {
  const getAnchors = (node: T): GraphPoint[] => [
    {x: node.x + CARD_W / 2, y: node.y},
    {x: node.x + CARD_W / 2, y: node.y + CARD_H},
  ];

  const srcAnchors = getAnchors(srcNode);
  const tgtAnchors = getAnchors(tgtNode);

  let minDistance = Infinity;
  let bestPair = {start: srcAnchors[0], end: tgtAnchors[0]};

  srcAnchors.forEach((start) => {
    tgtAnchors.forEach((end) => {
      const dist = getDistance(start, end);
      if (dist < minDistance) {
        minDistance = dist;
        bestPair = {start, end};
      }
    });
  });

  return bestPair;
}

export function computeHierarchicalLayout<T extends GraphLayoutNode>(
  nodes: T[],
  edges: GraphEdgeData[],
  canvasWidth: number
): T[] {
  const adj = new Map<string, string[]>();

  nodes.forEach((node) => {
    adj.set(node.id, []);
  });

  edges.forEach((edge) => {
    const targets = adj.get(edge.source);
    if (targets) {
      targets.push(edge.target);
    }
  });

  const asapLevels = new Map<string, number>();
  nodes.forEach((node) => asapLevels.set(node.id, 0));

  for (let index = 0; index < 10; index += 1) {
    let changed = false;

    edges.forEach((edge) => {
      const srcLevel = asapLevels.get(edge.source) || 0;
      const tgtLevel = asapLevels.get(edge.target) || 0;

      if (srcLevel >= tgtLevel) {
        asapLevels.set(edge.target, srcLevel + 1);
        changed = true;
      }
    });

    if (!changed) break;
  }

  const finalLevels = new Map<string, number>();
  nodes.forEach((node) => {
    if ((adj.get(node.id) || []).length === 0) {
      finalLevels.set(node.id, asapLevels.get(node.id) || 0);
    } else {
      finalLevels.set(node.id, -1);
    }
  });

  for (let index = 0; index < 10; index += 1) {
    let changed = false;

    nodes.forEach((node) => {
      const targets = adj.get(node.id) || [];
      if (targets.length === 0) return;

      let minChildLevel = Infinity;
      targets.forEach((targetId) => {
        const childLevel = asapLevels.get(targetId);
        if (typeof childLevel === 'number' && childLevel < minChildLevel) {
          minChildLevel = childLevel;
        }
      });

      const anchorLevel = minChildLevel - 1;
      const baseLevel = asapLevels.get(node.id) || 0;
      const bestLevel = Math.max(baseLevel, anchorLevel);

      if (finalLevels.get(node.id) !== bestLevel) {
        finalLevels.set(node.id, bestLevel);
        asapLevels.set(node.id, bestLevel);
        changed = true;
      }
    });

    if (!changed) break;
  }

  const levelGroups: T[][] = [];
  nodes.forEach((node) => {
    let level = finalLevels.get(node.id);
    if (level === -1 || level === undefined) {
      level = asapLevels.get(node.id) || 0;
    }

    levelGroups[level] ||= [];
    levelGroups[level].push(node);
  });

  const compactGroups = levelGroups.filter((group): group is T[] => Array.isArray(group) && group.length > 0);

  compactGroups.forEach((group, levelIndex) => {
    const rowWidth = group.length * GAP_X;
    const startX = canvasWidth / 2 - rowWidth / 2;

    group.forEach((node, columnIndex) => {
      node.x = startX + columnIndex * GAP_X + (Math.random() - 0.5) * 40;
      node.y = 100 + levelIndex * GAP_Y;
    });
  });

  return nodes;
}
