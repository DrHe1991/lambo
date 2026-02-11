/**
 * Content Rewriter Module
 * Uses Groq (Llama 3.3 70B) to rewrite original tweets into platform-appropriate style
 */

import Groq from 'groq-sdk';
import { AI_CONFIG } from '../config.js';
import type { ExtractedTweet } from './vision.js';

// Lazy initialization of Groq client (to ensure dotenv is loaded first)
let groq: Groq | null = null;

function getGroqClient(): Groq {
  if (!groq) {
    groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }
  return groq;
}

export interface RewrittenContent {
  title: string;          // Title (if appropriate)
  content: string;        // Rewritten body text
  tags: string[];         // Suggested tags
  originalAuthor: string; // Original author (for attribution/reference)
  originalHandle: string; // Original author handle
}

/**
 * Rewrite a single tweet
 */
export async function rewriteTweet(tweet: ExtractedTweet): Promise<RewrittenContent | null> {
  console.log(`✍️ Rewriting tweet from: @${tweet.handle}`);

  try {
    const response = await getGroqClient().chat.completions.create({
      model: AI_CONFIG.model,
      max_tokens: AI_CONFIG.maxTokens,
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content: `你是一个专业的中文内容编辑。你的任务是将英文推文改写成适合中文社区阅读的文章。

要求：
1. 完整翻译并改写原文内容，不要遗漏重要信息
2. 用流畅的中文表达，不要生硬翻译
3. 保持专业但易懂的语气
4. 输出必须是有效的JSON格式`
        },
        {
          role: 'user',
          content: `请将以下推文改写成中文文章：

原文内容：
${tweet.content}

请用以下JSON格式返回（只返回JSON，不要其他文字）：
{
  "title": "吸引人的标题（10-20个中文字符）",
  "content": "改写后的正文内容（150-400个中文字符，完整表达原文观点）",
  "tags": ["标签1", "标签2", "标签3"],
  "originalAuthor": "${tweet.author || 'Unknown'}",
  "originalHandle": "${tweet.handle}"
}`
        }
      ],
    });

    // Parse response
    const textContent = response.choices[0]?.message?.content;
    if (!textContent) {
      throw new Error('Empty response from Groq');
    }

    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('❌ Could not extract JSON from response');
      console.log('Response content:', textContent);
      return null;
    }

    const rewritten = JSON.parse(jsonMatch[0]) as RewrittenContent;
    console.log(`✅ Rewrite complete:`);
    console.log(`   Title: ${rewritten.title}`);
    console.log(`   Content preview: ${rewritten.content.substring(0, 50)}...`);
    console.log(`   Tags: ${rewritten.tags.join(', ')}`);

    return rewritten;

  } catch (error) {
    console.error('❌ Rewrite failed:', error);
    return null;
  }
}

/**
 * Rewrite multiple tweets in batch
 */
export async function rewriteMultipleTweets(tweets: ExtractedTweet[]): Promise<RewrittenContent[]> {
  const results: RewrittenContent[] = [];

  for (const tweet of tweets) {
    const rewritten = await rewriteTweet(tweet);
    if (rewritten) {
      results.push(rewritten);
    }
    // 1 second delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return results;
}
