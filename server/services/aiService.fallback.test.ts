import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Provider fallback + the Groq "failed to generate JSON" retry.
 *
 * Both live in `chatCompletion`, the single entry point every feature uses. The
 * OpenAI SDK is mocked per constructor URL so the test can tell the primary
 * client from the fallback one.
 */
const h = vi.hoisted(() => {
  process.env.AI_API_KEY = "test-key";
  process.env.AI_FALLBACK_BASE_URL = "https://fallback.example/v1";
  process.env.AI_FALLBACK_API_KEY = "fallback-key";
  process.env.AI_FALLBACK_MODEL = "fallback-model";
  return { primary: vi.fn(), fallback: vi.fn() };
});

vi.mock("openai", () => ({
  default: class {
    chat: { completions: { create: typeof h.primary } };
    models = { list: vi.fn().mockResolvedValue({ data: [] }) };

    constructor(options: { baseURL?: string }) {
      this.chat = {
        completions: {
          create: options.baseURL?.includes("fallback") ? h.fallback : h.primary,
        },
      };
    }
  },
}));

const { chatCompletion } = await import("./aiService");

const success = {
  choices: [{ message: { content: '{"ok":true}' } }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

beforeEach(() => {
  h.primary.mockReset();
  h.fallback.mockReset();
});

describe("chatCompletion", () => {
  it("uses the fallback provider when the primary fails", async () => {
    h.primary.mockRejectedValue(new Error("primary down"));
    h.fallback.mockResolvedValue(success);

    const response = await chatCompletion({ model: "primary-model", messages: [] });

    expect(response).toEqual(success);
    expect(h.primary).toHaveBeenCalledTimes(1);
    expect(h.fallback).toHaveBeenCalledTimes(1);
    expect((h.fallback.mock.calls[0][0] as { model: string }).model).toBe("fallback-model");
  });

  it("retries without response_format when the provider cannot produce JSON", async () => {
    const jsonError = Object.assign(new Error("Failed to generate JSON"), { status: 400 });
    h.primary.mockRejectedValueOnce(jsonError).mockResolvedValueOnce(success);

    const response = await chatCompletion({
      model: "primary-model",
      messages: [],
      response_format: { type: "json_object" },
    });

    expect(response).toEqual(success);
    expect(h.primary).toHaveBeenCalledTimes(2);
    expect(h.fallback).not.toHaveBeenCalled();
    expect((h.primary.mock.calls[0][0] as { response_format?: unknown }).response_format).toBeDefined();
    expect((h.primary.mock.calls[1][0] as { response_format?: unknown }).response_format).toBeUndefined();
  });
});
