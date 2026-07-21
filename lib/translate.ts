import Anthropic from "@anthropic-ai/sdk";

const LANG_NAME = { ko: "Korean", ja: "Japanese" } as const;

export async function translateListing(input: {
  title: string; description: string; from: "ko" | "ja";
}): Promise<{ title: string; description: string } | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const to = input.from === "ko" ? "ja" : "ko";
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `Translate this secondhand marketplace listing from ${LANG_NAME[input.from]} to ${LANG_NAME[to]}. Keep the tone casual and natural for a marketplace. Reply with ONLY a JSON object {"title": "...", "description": "..."} and nothing else.\n\nTitle: ${input.title}\nDescription: ${input.description}`,
      }],
    });
    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;
    const jsonText = block.text.slice(block.text.indexOf("{"), block.text.lastIndexOf("}") + 1);
    const parsed = JSON.parse(jsonText);
    if (typeof parsed.title !== "string" || typeof parsed.description !== "string") return null;
    return { title: parsed.title, description: parsed.description };
  } catch {
    return null;
  }
}
