import { describe, it, expect } from "vitest";
import {
  validateImageUrl,
  validatePollContent,
  validateSlides,
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
});
