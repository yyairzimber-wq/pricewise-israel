import { DEMO_BRANCHES } from "../../data/demo/branches";
import { distanceKm } from "../../services/geo";
import type { BranchProvider, BranchQuery } from "../types";

export class DemoBranchProvider implements BranchProvider {
  readonly id = "demo";
  readonly isDemo = true;

  async getBranches(q: BranchQuery) {
    let list = DEMO_BRANCHES;
    if (q.chainIds) list = list.filter((b) => q.chainIds!.includes(b.chainId));
    if (q.near) {
      const near = q.near;
      list = list
        .map((b) => ({ b, d: distanceKm(near, b) }))
        .filter((x) => !q.radiusKm || x.d <= q.radiusKm)
        .sort((a, b) => a.d - b.d)
        .map((x) => x.b);
    }
    return list.slice(0, q.limit ?? 50);
  }
}
