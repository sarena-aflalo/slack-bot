const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildPrompt(question, docs) {
  const docSections = docs
    .map(
      (doc, i) =>
        `--- Document ${i + 1}: "${doc.name}" ---\n${doc.content}`
    )
    .join('\n\n');

  return `You are a helpful assistant. Answer the user's question using ONLY the documents provided below.

Rules:
- Base your answer strictly on the document content. Do not invent information.
- If the documents don't contain enough information to answer the question, say so clearly.
- Be concise and direct.
- When you reference information from a specific document, note it inline with the document name in parentheses, e.g. (Source: "Document Name").
- At the end of your response, list which documents you actually used to answer. Format this as a JSON block on the last line only, like: SOURCES_USED:["Document Name 1","Document Name 2"]
  If you used no documents, write SOURCES_USED:[]

Documents:
${docSections}

User question: ${question}`;
}

async function askClaude(question, docs) {
  const prompt = buildPrompt(question, docs);

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const rawText = message.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  // Parse out the SOURCES_USED line
  const sourcesMatch = rawText.match(/SOURCES_USED:(\[.*?\])\s*$/s);
  let usedNames = [];
  if (sourcesMatch) {
    try {
      usedNames = JSON.parse(sourcesMatch[1]);
    } catch {
      usedNames = [];
    }
  }

  const answer = rawText.replace(/SOURCES_USED:\[.*?\]\s*$/s, '').trim();

  const docMap = Object.fromEntries(docs.map(d => [d.name, d]));
  const sources = usedNames
    .map(name => docMap[name])
    .filter(Boolean)
    .map(d => ({ name: d.name, url: d.url }));

  return { answer, sources };
}

module.exports = { askClaude };
