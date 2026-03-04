export interface ClaudeResponse {
  content: { type: string; text: string }[];
}

export interface GeminiResponse {
  candidates: { content: { parts: { text: string }[] } }[];
}

export interface OpenAIResponse {
  choices: { message: { role: string; content: string } }[];
}
