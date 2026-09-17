/**
 * The manifest behind `/brand` — every image and icon the storefront and the
 * thumbnails use, with where each came from and how good the copy is.
 *
 * Plain data, no I/O, so the page and a test can both read it. The files
 * themselves live in `public/brand/`; the category icon sprite is the one
 * the theme copy `vinhn-beta` inlines (`snippets/wolf-cat-icons.bwt`),
 * pulled from the storefront preview on 2026-09-17, since the theme is not
 * in this repo. Partner logos are the ones `tools/thumbnail-frame/` composes
 * into product photos; their quality notes say which ones still want a
 * vector from the distributor.
 */

export type LogoQuality = "vector" | "good" | "replace";

export type PartnerLogo = {
  readonly key: string;
  readonly name: string;
  readonly src: string;
  readonly source: string;
  readonly quality: LogoQuality;
  readonly note?: string;
};

export const PARTNER_LOGOS: readonly PartnerLogo[] = [
  {
    key: "kdk",
    name: "KDK",
    src: "/brand/logos/kdk.png",
    source: "Wikimedia Commons, KDK_logo.svg",
    quality: "vector",
  },
  {
    key: "sharp",
    name: "Sharp",
    src: "/brand/logos/sharp.png",
    source: "Wikimedia Commons, Logo_of_the_Sharp_Corporation.svg",
    quality: "vector",
  },
  {
    key: "bear",
    name: "Bear",
    src: "/brand/logos/bear.png",
    source: "bearappliance.com site logo",
    quality: "good",
  },
  {
    key: "lumias",
    name: "Lumias",
    src: "/brand/logos/lumias.png",
    source: "lumias.vn site logo",
    quality: "good",
    note: "Recoloured from white to dark; the site only serves the white mark.",
  },
  {
    key: "fujihome",
    name: "Fujihome",
    src: "/brand/logos/fujihome.png",
    source: "fujihomevn.com, 5 KB JPEG",
    quality: "replace",
    note: "Ask the distributor for a vector.",
  },
  {
    key: "joyoung",
    name: "Joyoung",
    src: "/brand/logos/joyoung.png",
    source: "seeklogo, 320 px PNG",
    quality: "replace",
    note: "Ask the distributor for a vector.",
  },
];

export type OwnMark = {
  readonly name: string;
  readonly src: string;
  readonly where: string;
  readonly size: string;
};

export const OWN_MARKS: readonly OwnMark[] = [
  {
    name: "Storefront logo",
    src: "/brand/greatness-logo.png",
    where: "Header of the-greatness.mysapo.net, still the orange export",
    size: "1815 × 522",
  },
  {
    name: "Checkout logo",
    src: "/brand/greatness-checkout-logo.png",
    where: "Sapo checkout page",
    size: "1290 × 1080",
  },
  {
    name: "Favicon",
    src: "/brand/greatness-favicon.png",
    where: "Browser tab",
    size: "96 × 95",
  },
];

/** The sprite: `<use href="/brand/category-icons.svg#cat-{slug}">`. */
export const ICON_SPRITE = "/brand/category-icons.svg";

/** Level-1 categories, in the order the homepage shows them. */
export const ROOT_ICON_SLUGS: readonly string[] = [
  "thiet-bi-gia-dinh",
  "quat-thiet-bi-lam-mat",
  "ve-sinh-nha-cua",
  "cham-soc-rang-mieng",
  "dien-gia-dung-nha-bep",
  "do-dung-nha-bep",
  "suc-khoe-lam-dep",
  "cong-nghe-phu-kien",
  "nha-thong-minh",
];

/** Level-2 categories that have an icon. Level 3 never gets one. */
export const CHILD_ICON_SLUGS: readonly string[] = [
  "cham-soc-khong-khi",
  "may-loc-nuoc-nuoc-uong",
  "cham-soc-quan-ao",
  "suoi-am",
  "diet-con-trung",
  "noi-com-dien",
  "noi-chien-thiet-bi-chien-nuong",
  "noi-dien-nau-da-nang",
  "lo-vi-song",
  "bep-dien",
  "may-xay-che-bien-thuc-pham",
  "may-ep-do-uong-dinh-duong",
  "pha-che-do-uong",
  "noi",
  "chao",
  "bo-noi-bo-chao",
  "dao-dung-cu-cat",
  "bao-quan-thuc-pham",
  "binh-ly-giu-nhiet",
  "dung-cu-nha-bep",
  "cham-soc-nam-gioi",
  "cham-soc-toc",
  "cham-soc-sac-dep",
  "theo-doi-suc-khoe",
  "massage-thu-gian",
  "may-tinh",
  "man-hinh",
  "thiet-bi-trinh-chieu",
  "am-thanh",
  "thiet-bi-deo-thong-minh",
  "sac-nang-luong",
  "cap-ket-noi",
  "hub-dock",
  "phu-kien-may-tinh",
  "an-ninh-thong-minh",
  "dien-thong-minh",
  "chieu-sang-thong-minh",
  "cam-bien-dieu-khien",
];

export const SERVICE_ICONS = [
  { id: "svc-1", label: "Giao hàng" },
  { id: "svc-2", label: "Đổi trả" },
  { id: "svc-3", label: "Chính hãng" },
  { id: "svc-4", label: "Thanh toán" },
] as const;

export type ThumbnailSample = {
  readonly src: string;
  readonly brand: string;
  readonly caption: string;
};

/** Variant G of the thumbnail frame — header row, no border. */
export const THUMBNAIL_SAMPLES: readonly ThumbnailSample[] = [
  { src: "/brand/samples/jaf-565.jpg", brand: "Joyoung", caption: "JAF-565" },
  { src: "/brand/samples/m40k-gy.jpg", brand: "KDK", caption: "m40k(gy)" },
  {
    src: "/brand/samples/ap5compact.jpg",
    brand: "Fujihome",
    caption: "AP5 Compact, banner stripped",
  },
  {
    src: "/brand/samples/ddg-d20p1.jpg",
    brand: "Bear",
    caption: "DDG-D20P1, grey backdrop flattened",
  },
  {
    src: "/brand/samples/jaf-565-sharp.jpg",
    brand: "Sharp",
    caption: "Blender, mislabelled JAF-565 (2)",
  },
  {
    src: "/brand/samples/lumias-trio.jpg",
    brand: "Lumias",
    caption: "Handheld trio",
  },
  {
    src: "/brand/samples/m40r-set.jpg",
    brand: "KDK",
    caption: "M40R set, caption stripped",
  },
];
