import { chromium } from "playwright";
import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { heuristicClassifyPost } from "../src/extraction/classify.js";
import { extractPostFromElement, parseCount } from "../src/extraction/parsePost.js";
import { scrollFeed } from "../src/extraction/scroll.js";
import { buildSearchUrl } from "../src/extraction/urls.js";

// ---------------------------------------------------------------------------
// Unit: URL builder
// ---------------------------------------------------------------------------

describe("buildSearchUrl", () => {
  it("builds a content-search URL from the query", () => {
    const url = buildSearchUrl({ query: "React Native" });
    expect(url).toContain("linkedin.com/search/results/content/");
    expect(url).toContain("keywords=React+Native");
    expect(url).toContain("origin=GLOBAL_SEARCH_HEADER");
  });

  it("folds keywords and location into the query string", () => {
    const url = buildSearchUrl({
      query: "hiring",
      keywords: ["React Native", "Berlin"],
      location: "Germany",
    });
    const { searchParams } = new URL(url);
    expect(searchParams.get("keywords")).toContain("hiring");
    expect(searchParams.get("keywords")).toContain("React Native");
    expect(searchParams.get("keywords")).toContain("Berlin");
    expect(searchParams.get("keywords")).toContain("Germany");
  });

  it("ignores blank keywords", () => {
    const url = buildSearchUrl({ query: "engineer", keywords: ["", "  ", "backend"] });
    expect(new URL(url).searchParams.get("keywords")).toBe("engineer backend");
  });
});

// ---------------------------------------------------------------------------
// Unit: count parsing
// ---------------------------------------------------------------------------

describe("parseCount", () => {
  it("parses plain integers", () => {
    expect(parseCount("123 reactions")).toBe(123);
    expect(parseCount("0")).toBe(0);
    expect(parseCount("1,234")).toBe(1234);
  });
  it("parses K/M/B suffixes", () => {
    expect(parseCount("1.2K")).toBe(1200);
    expect(parseCount("12K+")).toBe(12000);
    expect(parseCount("3M")).toBe(3_000_000);
    expect(parseCount("1B")).toBe(1_000_000_000);
  });
  it("returns undefined for unparseable text", () => {
    expect(parseCount("See who reacted")).toBeUndefined();
    expect(parseCount(null)).toBeUndefined();
    expect(parseCount("")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Unit: heuristic classification
// ---------------------------------------------------------------------------

describe("heuristicClassifyPost", () => {
  it("flags posts with an explicit hiring verb", () => {
    const result = heuristicClassifyPost({
      text: "We're hiring a Senior React Native Engineer! Join our team in Berlin.",
    });
    expect(result).not.toBeNull();
    expect(result?.matchedBy).toBe("keyword");
    expect(result?.confidence).toBe(85);
    expect(result?.role).toBe("Senior React Native Engineer");
    expect(result?.skills).toContain("react native");
  });

  it("flags posts using apostrophe-free verbs and synonym topics", () => {
    const result = heuristicClassifyPost({
      text: "We are looking for a TypeScript backend engineer, remote friendly. DM me if interested.",
    });
    expect(result?.matchedBy).toBe("keyword");
    expect(result?.skills).toContain("typescript");
  });

  it("flags posts with only semantic signals when an opening is explicit", () => {
    const result = heuristicClassifyPost({
      text: "Our React Native squad has a role opening up for a mobile engineer; we use Expo every day.",
    });
    expect(result?.matchedBy).toBe("semantic");
    expect(result?.confidence).toBe(65);
    expect(result?.skills).toContain("react native");
  });

  it("rejects posts dominated by negative indicators", () => {
    const result = heuristicClassifyPost({
      text: "We recently hired our first React Native dev. Here is what the interview process was like.",
    });
    expect(result).toBeNull();
  });

  it("rejects topic chatter without hiring or opening signals", () => {
    const result = heuristicClassifyPost({
      text: "Great thread about React Native performance tips and animation best practices.",
    });
    expect(result).toBeNull();
  });

  it("rejects empty posts", () => {
    expect(heuristicClassifyPost({ text: "" })).toBeNull();
  });

  it("uses headline and company as additional signal", () => {
    const result = heuristicClassifyPost({
      text: "Join us and build the future of payments.",
      authorHeadline: "Staff Engineer at Acme",
      company: "Acme",
    });
    expect(result).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Browser-backed: DOM parsing + infinite scroll
// ---------------------------------------------------------------------------

const FIXTURE = `
<body>
  <article class="feed-shared-update-v2" data-urn="urn:li:activity:7123456789012345678">
    <div class="update-components-actor">
      <img class="update-components-actor__avatar" src="https://media.example/avatar.jpg">
      <div class="update-components-actor__meta">
        <a class="update-components-actor__meta-link" href="/in/jane-doe/" aria-label="Jane Doe">
          <span class="update-components-actor__name">Jane Doe</span>
          <span class="update-components-actor__description">Staff Engineer at Acme Inc</span>
        </a>
        <div class="update-components-actor__sub-description">2h</div>
      </div>
    </div>
    <a href="/feed/update/urn:li:activity:7123456789012345678/"></a>
    <div class="update-components-text">
      <div class="update-components-text__update"><span dir="ltr">We're hiring a Senior React Native Engineer! Join our team in Berlin. Must know TypeScript. Apply here.</span></div>
    </div>
    <div class="update-components-image">
      <img class="update-components-image__image" src="https://media.example/office.jpg">
    </div>
    <div class="social-details-social-counts">
      <button class="social-details-social-counts__item social-details-social-counts__reactions-count">123 reactions</button>
      <button class="social-details-social-counts__comments">12 comments</button>
      <button class="social-details-social-counts__reposts-count">1.2K reposts</button>
    </div>
  </article>

  <article class="feed-shared-update-v2" data-urn="urn:li:activity:7000000000000000001">
    <div class="update-components-actor__meta">
      <a class="update-components-actor__meta-link" href="/in/bob-smith/">
        <span class="update-components-actor__name">Bob Smith</span>
        <span class="update-components-actor__description">Founder @ Widgets</span>
      </a>
      <div class="update-components-actor__sub-description">1w • Edited</div>
    </div>
    <div class="update-components-text">
      <div class="update-components-text__update"><span dir="ltr">Excited to share our new product launch video.…see more</span></div>
    </div>
    <video class="update-components-video__player" src="https://media.example/launch.mp4"></video>
  </article>

  <article class="feed-shared-update-v2" data-urn="urn:li:activity:7000000000000000002">
    <div class="update-components-actor__meta">
      <a class="update-components-actor__meta-link" href="/in/recruiter-x/">
        <span class="update-components-actor__name">Recruiter X</span>
      </a>
      <div class="update-components-actor__sub-description">3h</div>
    </div>
    <div class="update-components-text">
      <div class="update-components-text__update"><span dir="ltr">We recently hired a great backend engineer. Hiring freeze for now.</span></div>
    </div>
  </article>

  <article class="feed-shared-update-v2" data-urn="urn:li:activity:7000000000000000003">
    <div class="update-components-text">
      <div class="update-components-text__update"><span dir="ltr">A post without author metadata.</span></div>
    </div>
  </article>
</body>
`;

const SCROLL_FIXTURE = `
<body>
  <div id="list"></div>
  <div class="artdeco-empty-state__message" id="end" style="display:none">End of results</div>
  <script>
    let n = 0;
    const TOTAL = 30;
    const END = 30;
    function add() {
      for (let i = 0; i < 10; i++) {
        const el = document.createElement('article');
        el.className = 'feed-shared-update-v2';
        el.setAttribute('data-urn', 'urn:li:activity:' + (n++));
        el.style.height = '300px';
        document.getElementById('list').appendChild(el);
      }
      if (n >= END) document.getElementById('end').style.display = 'block';
    }
    add();
    window.addEventListener('scroll', () => {
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 10) {
        add();
      }
    });
  </script>
</body>
`;

describe("extraction (browser)", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  it("parses a full LinkedIn post card into a RawPost", async () => {
    const page = await browser.newPage();
    await page.setContent(FIXTURE);

    const post = await extractPostFromElement(
      page.locator("article.feed-shared-update-v2").nth(0),
      { baseUrl: "https://www.linkedin.com/search/results/content/", searchQuery: "React Native" },
    );

    expect(post.liPostId).toBe("7123456789012345678");
    expect(post.url).toBe(
      "https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678/",
    );
    expect(post.authorName).toBe("Jane Doe");
    expect(post.authorProfileUrl).toBe("https://www.linkedin.com/in/jane-doe/");
    expect(post.authorHeadline).toBe("Staff Engineer at Acme Inc");
    expect(post.postedAtLabel).toBe("2h");
    expect(post.postedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(post.text).toContain("We're hiring a Senior React Native Engineer!");
    expect(post.images).toEqual(["https://media.example/office.jpg"]);
    expect(post.images).not.toContain("https://media.example/avatar.jpg");
    expect(post.likes).toBe(123);
    expect(post.comments).toBe(12);
    expect(post.reposts).toBe(1200);
    expect(post.searchQuery).toBe("React Native");
    await page.close();
  }, 30_000);

  it("falls back for sparse cards and strips collapse markers", async () => {
    const page = await browser.newPage();
    await page.setContent(FIXTURE);

    const post = await extractPostFromElement(
      page.locator("article.feed-shared-update-v2").nth(1),
      { baseUrl: "https://www.linkedin.com/search/results/content/", searchQuery: "React Native" },
    );

    expect(post.liPostId).toBe("7000000000000000001");
    expect(post.authorName).toBe("Bob Smith");
    expect(post.authorHeadline).toBe("Founder @ Widgets");
    expect(post.postedAtLabel).toBe("1w");
    expect(post.text).toBe("Excited to share our new product launch video.");
    expect(post.videoUrl).toBe("https://media.example/launch.mp4");
    expect(post.likes).toBeUndefined();
    await page.close();
  }, 30_000);

  it("handles cards without author or counts metadata", async () => {
    const page = await browser.newPage();
    await page.setContent(FIXTURE);

    const post = await extractPostFromElement(
      page.locator("article.feed-shared-update-v2").nth(3),
      { baseUrl: "https://www.linkedin.com/search/results/content/", searchQuery: "React Native" },
    );
    expect(post.text).toBe("A post without author metadata.");
    expect(post.authorName).toBeUndefined();
    expect(post.images).toEqual([]);
    await page.close();
  }, 30_000);

  it("scrolls to the end and reports reachedEnd", async () => {
    const page = await browser.newPage();
    await page.setContent(SCROLL_FIXTURE);

    const result = await scrollFeed(page, page.locator("article.feed-shared-update-v2"), {
      maxPages: 10,
      scrollTimeoutMs: 3_000,
      overallTimeoutMs: 30_000,
      pollIntervalMs: 200,
    });

    expect(result.reachedEnd).toBe(true);
    expect(result.pageCount).toBeGreaterThanOrEqual(2);
    expect(await page.locator("article.feed-shared-update-v2").count()).toBe(30);
    await page.close();
  }, 30_000);

  it("stops after repeated no-growth rounds", async () => {
    const page = await browser.newPage();
    await page.setContent(
      `<body><div id="list"><article class="feed-shared-update-v2" data-urn="urn:li:activity:1"></article></div></body>`,
    );

    const result = await scrollFeed(page, page.locator("article.feed-shared-update-v2"), {
      maxPages: 10,
      scrollTimeoutMs: 1_000,
      overallTimeoutMs: 30_000,
      pollIntervalMs: 200,
      maxIdleRounds: 2,
    });

    expect(result.reachedEnd).toBe(false);
    expect(result.pageCount).toBe(2);
    await page.close();
  }, 30_000);

  it("respects the maxPages cap when content keeps loading", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <body><div id="list"></div>
      <script>
        let n = 0;
        function add() {
          for (let i = 0; i < 10; i++) {
            const el = document.createElement('article');
            el.className = 'feed-shared-update-v2';
            el.setAttribute('data-urn', 'urn:li:activity:' + (n++));
            el.style.height = '300px';
            document.getElementById('list').appendChild(el);
          }
        }
        add();
        window.addEventListener('scroll', () => {
          if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 10) add();
        });
      </script></body>
    `);

    const result = await scrollFeed(page, page.locator("article.feed-shared-update-v2"), {
      maxPages: 2,
      scrollTimeoutMs: 3_000,
      overallTimeoutMs: 30_000,
      pollIntervalMs: 200,
    });

    expect(result.reachedEnd).toBe(false);
    expect(result.pageCount).toBe(2);
    expect(await page.locator("article.feed-shared-update-v2").count()).toBe(30);
    await page.close();
  }, 30_000);
});
