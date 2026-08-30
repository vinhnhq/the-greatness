/**
 * The Sapo back-link, and the HTML reduction the seed runs descriptions
 * through.
 *
 * Both are small, and both are the kind of small that is wrong silently: a URL
 * builder that emits `//admin/...` for a store URL someone pasted with a
 * trailing slash still *looks* like a link, and a stripper that drops the
 * newline before removing tags turns a list into one run-on sentence that
 * nobody reads closely enough to notice.
 */

import { afterEach, describe, expect, it } from "vitest";

import { htmlToText } from "@/db/seed-sapo";
import {
  sapoCategoryUrl,
  sapoProductListUrl,
  sapoProductUrl,
} from "@/lib/sapo";

const ENV = "NEXT_PUBLIC_SAPO_STORE_URL";

afterEach(() => {
  delete process.env[ENV];
});

describe("sapoProductUrl", () => {
  it("points at the Sapo admin row for an imported product", () => {
    expect(sapoProductUrl("89071306")).toBe(
      "https://the-greatness.mysapo.net/admin/products/89071306",
    );
  });

  it("is null for a product created here", () => {
    // The link component renders nothing for null, which is the whole
    // mechanism by which a locally-created product shows no Sapo affordance.
    expect(sapoProductUrl(null)).toBeNull();
  });

  it("honours an overridden store, without doubling its trailing slash", () => {
    process.env[ENV] = "https://other.mysapo.net/";
    expect(sapoProductUrl("1")).toBe(
      "https://other.mysapo.net/admin/products/1",
    );
  });

  it("falls back to the default when the override is blank", () => {
    process.env[ENV] = "   ";
    expect(sapoProductUrl("1")).toBe(
      "https://the-greatness.mysapo.net/admin/products/1",
    );
  });

  it("escapes an id rather than splicing it into the path", () => {
    expect(sapoProductUrl("a/b")).toBe(
      "https://the-greatness.mysapo.net/admin/products/a%2Fb",
    );
  });
});

describe("sapoCategoryUrl and sapoProductListUrl", () => {
  it("addresses a collection", () => {
    expect(sapoCategoryUrl("4347514")).toBe(
      "https://the-greatness.mysapo.net/admin/collections/4347514",
    );
  });

  it("is null without an id", () => {
    expect(sapoCategoryUrl(null)).toBeNull();
  });

  it("addresses the catalogue itself", () => {
    expect(sapoProductListUrl()).toBe(
      "https://the-greatness.mysapo.net/admin/products",
    );
  });
});

describe("htmlToText", () => {
  it("keeps the words and drops the markup", () => {
    expect(htmlToText("<p>Bàn ủi <strong>hơi nước</strong></p>")).toBe(
      "Bàn ủi hơi nước",
    );
  });

  it("turns block ends into line breaks, so a list is still a list", () => {
    expect(htmlToText("<ul><li>Một</li><li>Hai</li></ul>")).toBe("Một\nHai");
  });

  it("keeps paragraphs apart but collapses a run of blank lines", () => {
    expect(htmlToText("<p>A</p><p></p><p></p><p>B</p>")).toBe("A\n\nB");
  });

  it("decodes the entities the source actually contains", () => {
    // `&nbsp;` is everywhere in this catalogue — pasted out of Word.
    expect(
      htmlToText("<p>1&nbsp;&amp;&nbsp;2 &lt;3&gt; &quot;4&quot;</p>"),
    ).toBe('1 & 2 <3> "4"');
  });

  it("decodes a numeric entity", () => {
    expect(htmlToText("<p>caf&#233;</p>")).toBe("café");
  });

  it("removes a script block whole, not just its tags", () => {
    // One newline, not two: a paragraph boundary is a single break here, and
    // the blank line in the case above comes from the empty paragraphs, not
    // from `</p>`. Worth pinning — it is the difference between a readable
    // description and one with a blank line between every sentence.
    expect(htmlToText("<p>A</p><script>alert('x')</script><p>B</p>")).toBe(
      "A\nB",
    );
  });

  it("is empty for markup carrying no text", () => {
    expect(htmlToText("<div><br/></div>")).toBe("");
  });
});
