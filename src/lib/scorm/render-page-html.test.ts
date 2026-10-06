import { describe, expect, it } from "vitest";
import {
  GENERATOR_ID,
  renderContentBlock,
  renderInteractionBlock,
  renderPageHtml,
  seededShuffleIndices,
  type Block,
} from "./render-page-html";

describe("seededShuffleIndices", () => {
  it("is deterministic for a given seed", () => {
    const a = seededShuffleIndices(8, "block_abc");
    const b = seededShuffleIndices(8, "block_abc");
    expect(a).toEqual(b);
  });

  it("differs between seeds", () => {
    const a = seededShuffleIndices(8, "block_abc");
    const b = seededShuffleIndices(8, "block_xyz");
    expect(a).not.toEqual(b);
  });

  it("is a permutation of 0..n-1", () => {
    const out = seededShuffleIndices(6, "seed");
    expect([...out].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("handles n of 0 and 1", () => {
    expect(seededShuffleIndices(0, "s")).toEqual([]);
    expect(seededShuffleIndices(1, "s")).toEqual([0]);
  });
});

function block(partial: Partial<Block> & Pick<Block, "type" | "category" | "data">): Block {
  return { id: "blk1", order: 0, ...partial } as Block;
}

describe("matching render is reversible", () => {
  it("maps each shuffled right item back to its original pair index", () => {
    const pairs = [
      { left: "L0", right: "R0" },
      { left: "L1", right: "R1" },
      { left: "L2", right: "R2" },
      { left: "L3", right: "R3" },
    ];
    const html = renderInteractionBlock(
      block({ id: "m1", category: "interaction", type: "matching", data: { question: "Q", pairs } })
    );

    const rightItems = [...html.matchAll(/<li class="match-item match-right" data-index="(\d+)">([^<]*)<\/li>/g)];
    expect(rightItems).toHaveLength(4);

    // Reversing with data-index must recover the original pairing exactly.
    for (const [, idx, text] of rightItems) {
      expect(text).toBe(pairs[Number(idx)].right);
    }
  });

  it("produces the same markup on every render", () => {
    const data = {
      question: "Q",
      pairs: Array.from({ length: 5 }, (_, i) => ({ left: `L${i}`, right: `R${i}` })),
    };
    const b = block({ id: "m2", category: "interaction", type: "matching", data });
    expect(renderInteractionBlock(b)).toBe(renderInteractionBlock(b));
  });
});

describe("embedded_html content block", () => {
  it("renders nothing: a preserved page is a page, not a block", () => {
    expect(
      renderContentBlock(
        block({ category: "content", type: "embedded_html", data: { bundleUrl: "x" } })
      )
    ).toBe("");
  });
});

describe("page markers", () => {
  const page = () =>
    renderPageHtml({
      courseTitle: "C",
      pageTitle: "P",
      blocks: [
        block({ id: "b1", category: "content", type: "text", data: { text: "<p>hi</p>" } }),
        block({
          id: "b2",
          order: 1,
          category: "interaction",
          type: "true_false",
          data: { question: "Q", correct: true },
        }),
      ],
    });

  it("declares the generator and sidecar location", () => {
    const html = page();
    expect(html).toContain(`<meta name="generator" content="${GENERATOR_ID}" />`);
    expect(html).toContain('content="scormcraft/course.json"');
  });

  it("stamps data-sc-* on each block root without adding a wrapper", () => {
    const html = page();
    expect(html).toContain('data-sc-block="b1"');
    expect(html).toContain('data-sc-cat="content"');
    expect(html).toContain('data-sc-type="text"');
    expect(html).toContain('data-sc-type="true_false"');
    // Injected into the existing root element, not a new <div>: the markers
    // sit between the tag name and the original attributes.
    expect(html).toContain('<div data-sc-block="b1" data-sc-cat="content" data-sc-type="text" class="content-text reveal">');
  });
});
