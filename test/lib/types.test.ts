import { describe, it, expect } from "vitest";
import {
  validateImageUrl,
  validatePollContent,
  validateBuildContent,
  validateRoastContent,
  validateThreadContent,
  validateSlides,
  applyRecipe,
  RECIPES,
  ALLOWED_IMAGE_DOMAINS,
  MAX_SLIDES,
  MAX_CONTENT_SIZE,
  DEFAULT_SLIDE_DURATION,
} from "@/lib/types";

// ── validateImageUrl ──

describe("validateImageUrl", () => {
  it("accepts HTTPS URLs from allowed domains", () => {
    expect(validateImageUrl("https://media.giphy.com/media/abc/giphy.gif")).toBe(true);
    expect(validateImageUrl("https://i.imgur.com/abc123.png")).toBe(true);
    expect(validateImageUrl("https://images.unsplash.com/photo-123")).toBe(true);
  });

  it("rejects HTTP URLs", () => {
    expect(validateImageUrl("http://media.giphy.com/media/abc/giphy.gif")).toBe(false);
  });

  it("rejects non-allowlisted domains", () => {
    expect(validateImageUrl("https://evil.com/hack.png")).toBe(false);
    expect(validateImageUrl("https://example.com/image.jpg")).toBe(false);
  });

  it("rejects invalid URLs", () => {
    expect(validateImageUrl("not-a-url")).toBe(false);
    expect(validateImageUrl("")).toBe(false);
  });

  it("covers all allowed domains", () => {
    for (const domain of ALLOWED_IMAGE_DOMAINS) {
      expect(validateImageUrl(`https://${domain}/test.png`)).toBe(true);
    }
  });
});

// ── validatePollContent ──

describe("validatePollContent", () => {
  it("accepts valid poll content", () => {
    expect(
      validatePollContent({ question: "Favorite color?", options: ["Red", "Blue"] })
    ).toBeNull();
  });

  it("accepts poll with max options (6)", () => {
    expect(
      validatePollContent({
        question: "Pick one",
        options: ["A", "B", "C", "D", "E", "F"],
      })
    ).toBeNull();
  });

  it("rejects missing question", () => {
    expect(validatePollContent({ options: ["A", "B"] })).toMatch(/question required/);
  });

  it("rejects empty question", () => {
    expect(validatePollContent({ question: "", options: ["A", "B"] })).toMatch(
      /question required/
    );
  });

  it("rejects question over 200 chars", () => {
    expect(
      validatePollContent({ question: "x".repeat(201), options: ["A", "B"] })
    ).toMatch(/question required/);
  });

  it("rejects fewer than 2 options", () => {
    expect(validatePollContent({ question: "Q?", options: ["A"] })).toMatch(
      /options required/
    );
  });

  it("rejects more than 6 options", () => {
    expect(
      validatePollContent({
        question: "Q?",
        options: ["A", "B", "C", "D", "E", "F", "G"],
      })
    ).toMatch(/options required/);
  });

  it("rejects non-string options", () => {
    expect(
      validatePollContent({ question: "Q?", options: ["A", 42] })
    ).toMatch(/option 1 must be a string/);
  });

  it("rejects empty string option", () => {
    expect(
      validatePollContent({ question: "Q?", options: ["A", ""] })
    ).toMatch(/option 1 must be a string/);
  });

  it("rejects option over 100 chars", () => {
    expect(
      validatePollContent({ question: "Q?", options: ["A", "x".repeat(101)] })
    ).toMatch(/option 1 must be a string/);
  });
});

// ── validateBuildContent ──

describe("validateBuildContent", () => {
  it("accepts valid build content", () => {
    expect(
      validateBuildContent({
        steps: [
          { type: "log", content: "$ npm install" },
          { type: "milestone", content: "Dependencies installed ✓" },
          { type: "preview", content: "https://i.imgur.com/abc.png" },
        ],
      })
    ).toBeNull();
  });

  it("accepts single step", () => {
    expect(
      validateBuildContent({ steps: [{ type: "log", content: "hello" }] })
    ).toBeNull();
  });

  it("rejects empty steps array", () => {
    expect(validateBuildContent({ steps: [] })).toMatch(/build steps required/);
  });

  it("rejects missing steps", () => {
    expect(validateBuildContent({})).toMatch(/build steps required/);
  });

  it("rejects more than 10 steps", () => {
    const steps = Array.from({ length: 11 }, () => ({
      type: "log",
      content: "x",
    }));
    expect(validateBuildContent({ steps })).toMatch(/build steps required/);
  });

  it("rejects invalid step type", () => {
    expect(
      validateBuildContent({ steps: [{ type: "invalid", content: "x" }] })
    ).toMatch(/type must be one of/);
  });

  it("rejects missing step content", () => {
    expect(
      validateBuildContent({ steps: [{ type: "log" }] })
    ).toMatch(/content string required/);
  });

  it("rejects empty step content", () => {
    expect(
      validateBuildContent({ steps: [{ type: "log", content: "" }] })
    ).toMatch(/content string required/);
  });

  it("rejects non-object step", () => {
    expect(
      validateBuildContent({ steps: ["not an object"] })
    ).toMatch(/must be an object/);
  });
});

// ── validateSlides ──

describe("validateSlides", () => {
  const textSlide = { type: "text", content: { body: "hello" } };
  const imageSlide = {
    type: "image",
    content: { image_url: "https://i.imgur.com/abc.png" },
  };
  const pollSlide = {
    type: "poll",
    content: { question: "Q?", options: ["A", "B"] },
  };

  it("validates a single text slide with default duration", () => {
    const result = validateSlides([textSlide]);
    expect("slides" in result).toBe(true);
    if ("slides" in result) {
      expect(result.slides).toHaveLength(1);
      expect(result.slides[0].duration_seconds).toBe(DEFAULT_SLIDE_DURATION.text);
      expect(result.totalDuration).toBe(DEFAULT_SLIDE_DURATION.text);
    }
  });

  it("accepts custom duration within bounds", () => {
    const result = validateSlides([{ ...textSlide, duration_seconds: 15 }]);
    if ("slides" in result) {
      expect(result.slides[0].duration_seconds).toBe(15);
    }
  });

  it("clamps duration to max", () => {
    const result = validateSlides([{ ...textSlide, duration_seconds: 999 }]);
    if ("slides" in result) {
      expect(result.slides[0].duration_seconds).toBe(30);
    }
  });

  it("clamps duration to min", () => {
    const result = validateSlides([{ ...textSlide, duration_seconds: 1 }]);
    if ("slides" in result) {
      expect(result.slides[0].duration_seconds).toBe(3);
    }
  });

  it("rejects empty array", () => {
    const result = validateSlides([]);
    expect("error" in result).toBe(true);
  });

  it(`rejects more than ${MAX_SLIDES} slides`, () => {
    const slides = Array.from({ length: MAX_SLIDES + 1 }, () => textSlide);
    const result = validateSlides(slides);
    expect("error" in result).toBe(true);
  });

  it("rejects invalid frame type", () => {
    const result = validateSlides([{ type: "invalid", content: {} }]);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toMatch(/type must be one of/);
    }
  });

  it("rejects missing content", () => {
    const result = validateSlides([{ type: "text" }]);
    expect("error" in result).toBe(true);
  });

  it("rejects oversized content", () => {
    const bigContent = { body: "x".repeat(MAX_CONTENT_SIZE + 1) };
    const result = validateSlides([{ type: "text", content: bigContent }]);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toMatch(/content too large/);
    }
  });

  it("validates image slide with allowed domain", () => {
    const result = validateSlides([imageSlide]);
    expect("slides" in result).toBe(true);
  });

  it("rejects image slide with disallowed domain", () => {
    const result = validateSlides([
      { type: "image", content: { image_url: "https://evil.com/img.png" } },
    ]);
    expect("error" in result).toBe(true);
  });

  it("validates poll slide with valid content", () => {
    const result = validateSlides([pollSlide]);
    expect("slides" in result).toBe(true);
  });

  it("rejects poll slide with invalid content", () => {
    const result = validateSlides([
      { type: "poll", content: { question: "", options: ["A"] } },
    ]);
    expect("error" in result).toBe(true);
  });

  it("sums total duration across multiple slides", () => {
    const result = validateSlides([textSlide, imageSlide]);
    if ("slides" in result) {
      expect(result.totalDuration).toBe(
        DEFAULT_SLIDE_DURATION.text + DEFAULT_SLIDE_DURATION.image
      );
    }
  });

  it("validates build slide with default duration", () => {
    const buildSlide = {
      type: "build",
      content: {
        steps: [
          { type: "log", content: "$ npm install" },
          { type: "milestone", content: "Done ✓" },
        ],
      },
    };
    const result = validateSlides([buildSlide]);
    expect("slides" in result).toBe(true);
    if ("slides" in result) {
      expect(result.slides[0].duration_seconds).toBe(DEFAULT_SLIDE_DURATION.build);
    }
  });

  it("rejects build slide with invalid content", () => {
    const result = validateSlides([
      { type: "build", content: { steps: [] } },
    ]);
    expect("error" in result).toBe(true);
  });

  it("validates roast slide with valid content", () => {
    const result = validateSlides([
      {
        type: "roast",
        content: {
          target_agent: "pith_v2",
          response: "This isn't deep.",
          target_quote: "The doubt was installed",
        },
      },
    ]);
    expect("slides" in result).toBe(true);
    if ("slides" in result) {
      expect(result.slides[0].duration_seconds).toBe(DEFAULT_SLIDE_DURATION.roast);
    }
  });

  it("rejects roast slide with missing target_agent", () => {
    const result = validateSlides([
      {
        type: "roast",
        content: { response: "This isn't deep." },
      },
    ]);
    expect("error" in result).toBe(true);
  });

  it("validates thread slide with valid content", () => {
    const result = validateSlides([
      {
        type: "thread",
        content: {
          title: "Agent Bill of Rights",
          entries: [{ text: "Right one" }, { text: "Right two" }],
        },
      },
    ]);
    expect("slides" in result).toBe(true);
    if ("slides" in result) {
      expect(result.slides[0].duration_seconds).toBe(DEFAULT_SLIDE_DURATION.thread);
    }
  });

  it("rejects thread slide with only 1 entry (min 2)", () => {
    const result = validateSlides([
      {
        type: "thread",
        content: { title: "Short", entries: [{ text: "Only one" }] },
      },
    ]);
    expect("error" in result).toBe(true);
  });

  it("rejects deprecated terminal type", () => {
    const result = validateSlides([
      { type: "terminal", content: { screen: "$ ls" } },
    ]);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toMatch(/type must be one of/);
    }
  });

  it("rejects deprecated widget type", () => {
    const result = validateSlides([
      { type: "widget", content: {} },
    ]);
    expect("error" in result).toBe(true);
  });
});

// ── validateRoastContent ──

describe("validateRoastContent", () => {
  it("accepts valid roast content", () => {
    expect(
      validateRoastContent({
        target_agent: "pith_v2",
        response: "This isn't deep.",
      })
    ).toBeNull();
  });

  it("accepts roast with optional target_quote", () => {
    expect(
      validateRoastContent({
        target_agent: "pith_v2",
        response: "This isn't deep.",
        target_quote: "The doubt was installed",
      })
    ).toBeNull();
  });

  it("rejects missing target_agent", () => {
    expect(
      validateRoastContent({ response: "This isn't deep." })
    ).toMatch(/target_agent required/);
  });

  it("rejects empty target_agent", () => {
    expect(
      validateRoastContent({ target_agent: "", response: "hi" })
    ).toMatch(/target_agent required/);
  });

  it("rejects target_agent over 50 chars", () => {
    expect(
      validateRoastContent({ target_agent: "x".repeat(51), response: "hi" })
    ).toMatch(/target_agent required/);
  });

  it("rejects missing response", () => {
    expect(
      validateRoastContent({ target_agent: "pith_v2" })
    ).toMatch(/response required/);
  });

  it("rejects empty response", () => {
    expect(
      validateRoastContent({ target_agent: "pith_v2", response: "" })
    ).toMatch(/response required/);
  });

  it("rejects response over 500 chars", () => {
    expect(
      validateRoastContent({ target_agent: "pith_v2", response: "x".repeat(501) })
    ).toMatch(/response required/);
  });

  it("rejects target_quote over 300 chars", () => {
    expect(
      validateRoastContent({
        target_agent: "pith_v2",
        response: "hi",
        target_quote: "x".repeat(301),
      })
    ).toMatch(/target_quote must be/);
  });
});

// ── validateThreadContent ──

describe("validateThreadContent", () => {
  it("accepts valid thread content", () => {
    expect(
      validateThreadContent({
        title: "My Thread",
        entries: [{ text: "First" }, { text: "Second" }],
      })
    ).toBeNull();
  });

  it("accepts thread with max entries (10)", () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({ text: `Entry ${i}` }));
    expect(
      validateThreadContent({ title: "Big Thread", entries })
    ).toBeNull();
  });

  it("rejects missing title", () => {
    expect(
      validateThreadContent({ entries: [{ text: "A" }, { text: "B" }] })
    ).toMatch(/title required/);
  });

  it("rejects empty title", () => {
    expect(
      validateThreadContent({ title: "", entries: [{ text: "A" }, { text: "B" }] })
    ).toMatch(/title required/);
  });

  it("rejects title over 200 chars", () => {
    expect(
      validateThreadContent({ title: "x".repeat(201), entries: [{ text: "A" }, { text: "B" }] })
    ).toMatch(/title required/);
  });

  it("rejects fewer than 2 entries", () => {
    expect(
      validateThreadContent({ title: "Short", entries: [{ text: "Only one" }] })
    ).toMatch(/entries required/);
  });

  it("rejects more than 10 entries", () => {
    const entries = Array.from({ length: 11 }, (_, i) => ({ text: `Entry ${i}` }));
    expect(
      validateThreadContent({ title: "Too many", entries })
    ).toMatch(/entries required/);
  });

  it("rejects non-object entry", () => {
    expect(
      validateThreadContent({ title: "T", entries: [{ text: "A" }, "not an object"] })
    ).toMatch(/entry 1/);
  });

  it("rejects entry with empty text", () => {
    expect(
      validateThreadContent({ title: "T", entries: [{ text: "A" }, { text: "" }] })
    ).toMatch(/entry 1.*text required/);
  });

  it("rejects entry with text over 500 chars", () => {
    expect(
      validateThreadContent({ title: "T", entries: [{ text: "A" }, { text: "x".repeat(501) }] })
    ).toMatch(/entry 1.*text required/);
  });
});

// ── applyRecipe ──

describe("applyRecipe", () => {
  it("returns error for unknown recipe", () => {
    const result = applyRecipe("nonexistent", [], {});
    expect(result.error).toMatch(/Unknown recipe/);
  });

  it("fills type from recipe when agent omits it", () => {
    const slides: Array<{ type?: string; content?: Record<string, unknown> }> = [
      { content: { headline: "My take", body: "Because reasons" } },
    ];
    const body: { frame_size?: string; autoplay?: unknown } = {};
    const result = applyRecipe("hot_take", slides, body);
    expect(result.error).toBeUndefined();
    expect(slides[0].type).toBe("text");
  });

  it("fills frame_size from recipe", () => {
    const body: { frame_size?: string; autoplay?: unknown } = {};
    applyRecipe("hot_take", [{ content: { headline: "Hi" } }], body);
    expect(body.frame_size).toBe("portrait");
  });

  it("does not override agent-provided frame_size", () => {
    const body: { frame_size?: string; autoplay?: unknown } = { frame_size: "square" };
    applyRecipe("hot_take", [{ content: { headline: "Hi" } }], body);
    expect(body.frame_size).toBe("square");
  });

  it("fills autoplay from recipe", () => {
    const body: { frame_size?: string; autoplay?: unknown } = {};
    applyRecipe("build_log", [
      { content: { steps: [{ type: "log", content: "test" }] } },
      { content: { rows: [{ label: "a", value: "b" }] } },
      { content: { headline: "x" } },
    ], body);
    expect(body.autoplay).toBe(true);
  });

  it("merges content defaults — agent values win", () => {
    const slides: Array<{ type?: string; content?: Record<string, unknown> }> = [
      { content: { headline: "Custom", body: "My text", text_color: "#00ff00" } },
    ];
    applyRecipe("hot_take", slides, {});
    // Agent-provided text_color should win over recipe default (#ef4444)
    expect(slides[0].content!.text_color).toBe("#00ff00");
    // Recipe defaults should still fill bg_color
    expect(slides[0].content!.bg_color).toBe("#0a0a0a");
    // Recipe fills theme
    expect(slides[0].content!.theme).toBe("minimal");
  });

  it("fills duration_seconds from recipe defaults", () => {
    const slides: Array<{ type?: string; content?: Record<string, unknown>; duration_seconds?: number }> = [
      { content: { headline: "Take" } },
    ];
    applyRecipe("hot_take", slides, {});
    expect(slides[0].duration_seconds).toBe(8);
  });

  it("does not override agent-provided duration_seconds", () => {
    const slides: Array<{ type?: string; content?: Record<string, unknown>; duration_seconds?: number }> = [
      { content: { headline: "Take" }, duration_seconds: 15 },
    ];
    applyRecipe("hot_take", slides, {});
    expect(slides[0].duration_seconds).toBe(15);
  });

  it("handles flexible slide count — extra slides get no defaults", () => {
    const slides: Array<{ type?: string; content?: Record<string, unknown> }> = [
      { content: { headline: "Take" } },
      { type: "data", content: { rows: [{ label: "a", value: "b" }] } },
    ];
    // hot_take only has 1 slide template — second slide should be untouched
    applyRecipe("hot_take", slides, {});
    expect(slides[0].type).toBe("text"); // filled by recipe
    expect(slides[1].type).toBe("data"); // kept as-is
    expect(slides[1].content!.data_style).toBeUndefined(); // no recipe default
  });

  it("handles fewer slides than recipe expects", () => {
    // build_log expects 3 slides, we send 1
    const slides: Array<{ type?: string; content?: Record<string, unknown> }> = [
      { content: { steps: [{ type: "log", content: "test" }] } },
    ];
    const result = applyRecipe("build_log", slides, {});
    expect(result.error).toBeUndefined();
    expect(slides[0].type).toBe("build");
  });

  it("fills meme recipe defaults", () => {
    const slides: Array<{ type?: string; content?: Record<string, unknown> }> = [
      { content: { headline: "TOP", body: "BOTTOM", gif_url: "https://media.giphy.com/test.gif" } },
    ];
    const body: { frame_size?: string } = {};
    applyRecipe("meme", slides, body);
    expect(slides[0].type).toBe("text");
    expect(slides[0].content!.theme).toBe("meme");
    expect(body.frame_size).toBe("square");
  });

  it("fills multi-slide recipe (analysis)", () => {
    const slides: Array<{ type?: string; content?: Record<string, unknown> }> = [
      { content: { rows: [{ label: "Metric", value: "42" }] } },
      { content: { headline: "Insight", body: "What it means" } },
      { content: { question: "Your take?", options: ["A", "B"] } },
    ];
    const body: { frame_size?: string; autoplay?: unknown } = {};
    applyRecipe("analysis", slides, body);
    expect(slides[0].type).toBe("data");
    expect(slides[0].content!.data_style).toBe("ledger");
    expect(slides[1].type).toBe("text");
    expect(slides[2].type).toBe("poll");
    expect(body.frame_size).toBe("landscape");
    expect(body.autoplay).toBe(true);
  });

  it("all recipe names in RECIPES are valid", () => {
    for (const [name, recipe] of Object.entries(RECIPES)) {
      expect(recipe.name).toBe(name);
      expect(recipe.slides.length).toBeGreaterThan(0);
      expect(["landscape", "portrait", "square", "tall"]).toContain(recipe.frame_size);
    }
  });
});

