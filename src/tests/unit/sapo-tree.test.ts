/**
 * Reconstructing the category tree Sapo has nowhere to store.
 *
 * Both halves are the kind of parsing that fails quietly. The menu reader can
 * pick up the site footer's links and report six extra roots that look
 * plausible; the creation-order reader can file a category under whichever
 * group happened to come last. So the tests here are mostly about the ways
 * each half is wrong, not the way it is right.
 */

import { describe, expect, it } from "vitest";

import {
  buildCategoryTree,
  leavesByCreationOrder,
  parseMenuLevels,
} from "@/lib/sapo-tree";

/**
 * A faithful reduction of the real `#menu-popup` block: two roots, three
 * children between them, and — deliberately — a run of footer links after the
 * menu closes, which is what made an earlier positional parser report the
 * roots a second time as their own grandchildren.
 */
const MENU = `
<div class="wolf-menu-root" id="menu-popup">
  <div id="main-menu-container" class="menu-container">
    <div id="nav-level-1" class="menu-panel active">
      <ul class="menu-list">
        <li><a href="/thiet-bi-gia-dinh" class="nav-link nav-link-1" data-target="thiet-bi-gia-dinh-thiet-bi-gia-dinh-menu"><span>THIẾT BỊ GIA ĐÌNH</span></a></li>
        <li><a href="/nha-thong-minh" class="nav-link nav-link-1" data-target="nha-thong-minh-nha-thong-minh-menu"><span>NHÀ THÔNG MINH</span></a></li>
      </ul>
    </div>
    <div id="thiet-bi-gia-dinh-thiet-bi-gia-dinh-menu" class="menu-panel">
      <ul class="menu-list">
        <li><a class="nav-link nav-link-2" href="/quat-thiet-bi-lam-mat" data-target="thiet-bi-gia-dinh-quat-thiet-bi-lam-mat-menu"><span>Quạt &amp; Thiết bị làm mát</span></a></li>
        <li><a class="nav-link nav-link-2" href="/cham-soc-khong-khi" data-target="thiet-bi-gia-dinh-cham-soc-khong-khi-menu"><span>Chăm sóc không khí</span></a></li>
      </ul>
    </div>
    <div id="nha-thong-minh-nha-thong-minh-menu" class="menu-panel">
      <ul class="menu-list">
        <li><a class="nav-link nav-link-2" href="/an-ninh-thong-minh" data-target="nha-thong-minh-an-ninh-thong-minh-menu"><span>An ninh thông minh</span></a></li>
      </ul>
    </div>
  </div>
</div>
<footer>
  <a href="/thiet-bi-gia-dinh">THIẾT BỊ GIA ĐÌNH</a>
  <a href="/nha-thong-minh">NHÀ THÔNG MINH</a>
  <a href="/gioi-thieu">Về Greatness</a>
</footer>
`;

describe("parseMenuLevels", () => {
  it("reads the roots from the level-1 panel", () => {
    expect(parseMenuLevels(MENU).roots).toEqual([
      "thiet-bi-gia-dinh",
      "nha-thong-minh",
    ]);
  });

  it("reads each mid-level's parent out of its data-target", () => {
    expect([...parseMenuLevels(MENU).parentOf]).toEqual([
      ["quat-thiet-bi-lam-mat", "thiet-bi-gia-dinh"],
      ["cham-soc-khong-khi", "thiet-bi-gia-dinh"],
      ["an-ninh-thong-minh", "nha-thong-minh"],
    ]);
  });

  it("ignores the footer, which repeats the roots as bare links", () => {
    const { roots, parentOf } = parseMenuLevels(MENU);
    // The footer would otherwise make each root its own descendant.
    for (const root of roots) expect(parentOf.has(root)).toBe(false);
    expect(parentOf.has("gioi-thieu")).toBe(false);
  });

  it("throws when the menu block is absent rather than returning nothing", () => {
    expect(() => parseMenuLevels("<html><body>no menu</body></html>")).toThrow(
      /menu-popup/,
    );
  });

  it("throws when a mid-level's data-target names an unknown root", () => {
    const broken = MENU.replace(
      'data-target="nha-thong-minh-an-ninh-thong-minh-menu"',
      'data-target="khong-co-that-an-ninh-thong-minh-menu"',
    );
    expect(() => parseMenuLevels(broken)).toThrow(/an-ninh-thong-minh/);
  });
});

/** Ids ascend in tree order: each mid-level is followed by its own leaves. */
const COLLECTIONS = [
  { sourceId: 100, slug: "san-pham-noi-bat" },
  { sourceId: 101, slug: "thiet-bi-gia-dinh" },
  { sourceId: 102, slug: "nha-thong-minh" },
  { sourceId: 103, slug: "quat-thiet-bi-lam-mat" },
  { sourceId: 104, slug: "quat-dung" },
  { sourceId: 105, slug: "quat-tran" },
  { sourceId: 106, slug: "cham-soc-khong-khi" },
  { sourceId: 107, slug: "may-loc-khong-khi" },
  { sourceId: 108, slug: "an-ninh-thong-minh" },
  { sourceId: 109, slug: "camera-trong-nha" },
];

const LEVELS = parseMenuLevels(MENU);

describe("leavesByCreationOrder", () => {
  it("files each leaf under the mid-level that precedes it", () => {
    const leaves = leavesByCreationOrder(COLLECTIONS, LEVELS);
    expect(leaves.get("quat-thiet-bi-lam-mat")).toEqual([
      "quat-dung",
      "quat-tran",
    ]);
    expect(leaves.get("cham-soc-khong-khi")).toEqual(["may-loc-khong-khi"]);
    expect(leaves.get("an-ninh-thong-minh")).toEqual(["camera-trong-nha"]);
  });

  it("does not file anything under a root", () => {
    // A root resets the run; the standalone that precedes it is not a leaf.
    const leaves = leavesByCreationOrder(COLLECTIONS, LEVELS);
    expect(leaves.has("thiet-bi-gia-dinh")).toBe(false);
  });

  it("reports a collection that never followed a mid-level as unfiled", () => {
    const { unfiled } = buildCategoryTree(COLLECTIONS, MENU);
    expect(unfiled).toEqual(["san-pham-noi-bat"]);
  });

  it("treats a collection created after every block as unfiled, not as a leaf of the last group", () => {
    // The trap: creation order is a one-time reconstruction. Anything added
    // later gets the highest id and would otherwise land under whichever
    // mid-level came last.
    const withNewOne = [
      ...COLLECTIONS,
      { sourceId: 999, slug: "quat-usb-moi" },
    ];
    const { unfiled, parents } = buildCategoryTree(withNewOne, MENU, {
      knownMaxSourceId: 109,
    });
    expect(unfiled).toContain("quat-usb-moi");
    expect(parents["quat-usb-moi"]).toBeUndefined();
  });
});

describe("buildCategoryTree", () => {
  it("reconciles to every collection exactly once", () => {
    const tree = buildCategoryTree(COLLECTIONS, MENU);
    const counted =
      tree.roots.length +
      Object.keys(tree.parents).length +
      tree.unfiled.length;
    expect(counted).toBe(COLLECTIONS.length);
  });

  it("gives every non-root a parent that exists", () => {
    const tree = buildCategoryTree(COLLECTIONS, MENU);
    const known = new Set(COLLECTIONS.map((c) => c.slug));
    for (const parent of Object.values(tree.parents)) {
      expect(known.has(parent)).toBe(true);
    }
  });

  it("gives no category two parents", () => {
    const tree = buildCategoryTree(COLLECTIONS, MENU);
    // An object cannot express a duplicate key, so the count is the assertion:
    // every child appears once across roots, parents and unfiled.
    const seen = [...tree.roots, ...Object.keys(tree.parents), ...tree.unfiled];
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("throws when the menu names a collection the catalogue does not have", () => {
    const missing = COLLECTIONS.filter((c) => c.slug !== "cham-soc-khong-khi");
    expect(() => buildCategoryTree(missing, MENU)).toThrow(
      /cham-soc-khong-khi/,
    );
  });

  it("reports depth so a caller can assert the shape it expected", () => {
    const tree = buildCategoryTree(COLLECTIONS, MENU);
    expect(tree.counts).toEqual({ roots: 2, mid: 3, leaves: 4, unfiled: 1 });
  });
});
