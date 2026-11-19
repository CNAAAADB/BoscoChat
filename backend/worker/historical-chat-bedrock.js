// Dedicated inference-only Lambda. Deploy without VPC and grant access solely
// to an approved Bedrock model. No database/S3 permissions or public URL.
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

export async function handler(event) {
  const system = event?.system;
  const user = event?.user;
  const depth = event?.depth ?? 'research';
  if (!['research', 'auto', 'brief'].includes(depth)
    || typeof system !== 'string' || system.length < 40 || system.length > 3500
    || typeof user !== 'string' || user.length < 5 || user.length > 16000) {
    throw new Error('INVALID_CHAT_INFERENCE_REQUEST');
  }
  const client = new BedrockRuntimeClient({
    region: process.env.BOSCOCHAT_BEDROCK_REGION ?? 'us-east-1',
    maxAttempts: 2,
    retryMode: 'adaptive',
  });
  try {
    const response = await client.send(new ConverseCommand({
      modelId: process.env.BOSCOCHAT_BEDROCK_MODEL_ID ?? 'amazon.nova-pro-v1:0',
      system: [{ text: system }],
      messages: [{ role: 'user', content: [{ text: user }] }],
      inferenceConfig: { maxTokens: depth === 'research' ? 1300 : 650, temperature: 0.2 },
    }));
    if (!['end_turn', 'max_tokens'].includes(response.stopReason)) throw new Error('CHAT_MODEL_REJECTED');
    const answer = response.output?.message?.content?.filter((v) => typeof v.text === 'string')
      .map((v) => v.text).join('\n').trim();
    if (!answer) throw new Error('CHAT_EMPTY_MODEL_RESPONSE');
    return {
      status: 'ok',
      text: answer.slice(0, 6500),
      usage: {
        inputTokens: response.usage?.inputTokens ?? 0,
        outputTokens: response.usage?.outputTokens ?? 0,
      },
    };
  } finally {
    client.destroy();
  }
}
