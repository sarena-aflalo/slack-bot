const { App } = require('@slack/bolt');
const { searchAndFetchDocuments } = require('./drive');
const { askClaude } = require('./claude');

function extractQuestion(text) {
  // Strip @mentions from the message
  return text.replace(/<@[A-Z0-9]+>/g, '').trim();
}

async function createSlackApp() {
  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
  });

  app.event('app_mention', async ({ event, say, client }) => {
    const question = extractQuestion(event.text);

    if (!question) {
      await say({
        thread_ts: event.ts,
        text: "Hi! Ask me anything and I'll search our Google Drive docs to find the answer.",
      });
      return;
    }

    // Acknowledge immediately with a loading message
    const loadingMsg = await say({
      thread_ts: event.ts,
      text: ':hourglass_flowing_sand: Searching the docs...',
    });

    try {
      const docs = await searchAndFetchDocuments(question);

      if (docs.length === 0) {
        await client.chat.update({
          channel: event.channel,
          ts: loadingMsg.ts,
          text: "I searched our Google Drive folder but couldn't find any relevant documents for your question.",
        });
        return;
      }

      const { answer, sources } = await askClaude(question, docs);

      const sourceLines = sources
        .map((s, i) => `${i + 1}. <${s.url}|${s.name}>`)
        .join('\n');

      const responseText =
        `${answer}\n\n` +
        (sources.length > 0 ? `*Sources:*\n${sourceLines}` : '');

      await client.chat.update({
        channel: event.channel,
        ts: loadingMsg.ts,
        text: responseText,
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: answer },
          },
          ...(sources.length > 0
            ? [
                {
                  type: 'context',
                  elements: [
                    {
                      type: 'mrkdwn',
                      text: `*Sources:* ${sources.map(s => `<${s.url}|${s.name}>`).join(' · ')}`,
                    },
                  ],
                },
              ]
            : []),
        ],
      });
    } catch (err) {
      console.error('Error handling mention:', err);
      await client.chat.update({
        channel: event.channel,
        ts: loadingMsg.ts,
        text: ':warning: Something went wrong while fetching an answer. Please try again.',
      });
    }
  });

  return app;
}

module.exports = { createSlackApp };
