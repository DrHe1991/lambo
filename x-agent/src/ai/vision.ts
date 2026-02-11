/**
 * Groq Vision Module
 * Used to recognize content from tweet screenshots
 * 
 * Using meta-llama/llama-4-scout-17b-16e-instruct for vision tasks
 * (The older llama-3.2 vision models have been decommissioned)
 */

import Groq from 'groq-sdk';
import * as fs from 'fs';
import { AI_CONFIG } from '../config.js';

// Vision model - using Llama 4 Scout (multimodal)
const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

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

export interface ExtractedTweet {
  author: string;
  handle: string;
  content: string;
  timestamp: string;
  likes: string;
  retweets: string;
  replies: string;
  hasMedia: boolean;
  mediaDescription?: string;
  isAd?: boolean;  // Whether this is a promoted/ad tweet
}

/**
 * Extract tweet content from screenshot
 * Uses Groq's Llama 4 Scout model (multimodal)
 */
export async function extractTweetFromScreenshot(imagePath: string): Promise<ExtractedTweet | null> {
  console.log(`🔍 Recognizing screenshot: ${imagePath}`);

  try {
    // Read image and convert to base64
    const imageData = fs.readFileSync(imagePath);
    const base64Image = imageData.toString('base64');

    // Use vision-capable model (Llama 4 Scout)
    const response = await getGroqClient().chat.completions.create({
      model: VISION_MODEL,
      max_tokens: AI_CONFIG.maxTokens,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Image}`,
              },
            },
            {
              type: 'text',
              text: `Please carefully analyze this Twitter/X tweet screenshot and extract the following information in JSON format:

{
  "author": "User display name",
  "handle": "Username after @",
  "content": "Complete tweet text content (keep original, including emojis and links)",
  "timestamp": "Post time (if visible)",
  "likes": "Like count",
  "retweets": "Retweet count",
  "replies": "Reply count",
  "hasMedia": true/false (whether it contains images or videos),
  "mediaDescription": "If there's media, briefly describe the content",
  "isAd": true/false (whether this is a promoted/advertisement tweet - look for "Ad" or "Promoted" label)
}

Notes:
1. Return only JSON, no other text
2. If a field cannot be recognized, use empty string ""
3. The content field should be complete, do not omit or summarize
4. IMPORTANT: Check if there's an "Ad" or "Promoted" label in the tweet - if yes, set isAd to true`
            }
          ],
        }
      ],
    });

    // Parse response
    const textContent = response.choices[0]?.message?.content;
    if (!textContent) {
      throw new Error('Empty response from Groq');
    }

    // Try to parse JSON
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('❌ Could not extract JSON from response');
      console.log('Response content:', textContent);
      return null;
    }

    const extracted = JSON.parse(jsonMatch[0]) as ExtractedTweet;
    console.log(`✅ Successfully extracted tweet content:`);
    console.log(`   Author: @${extracted.handle}`);
    console.log(`   Content: ${extracted.content.substring(0, 50)}...`);

    return extracted;

  } catch (error) {
    console.error('❌ Recognition failed:', error);
    return null;
  }
}

/**
 * Process multiple screenshots in batch
 * Automatically filters out ads/promoted tweets
 */
export async function extractMultipleTweets(imagePaths: string[]): Promise<ExtractedTweet[]> {
  const results: ExtractedTweet[] = [];

  for (const imagePath of imagePaths) {
    const tweet = await extractTweetFromScreenshot(imagePath);
    if (tweet) {
      // Filter out ads
      if (tweet.isAd) {
        console.log(`⚠️ Skipping ad tweet from @${tweet.handle}`);
        continue;
      }
      results.push(tweet);
    }
    // 1 second delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return results;
}
