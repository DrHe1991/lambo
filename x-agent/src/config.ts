/**
 * X Agent Configuration
 * 
 * IMPORTANT: Your X account must FOLLOW all these influencers!
 * The agent reads from your Following timeline, not individual profiles.
 */

export interface Influencer {
  handle: string;       // X username (without @) - MUST BE EXACT
  name: string;         // Display name (for reference)
  category: string;     // Category
}

// ============================================
// CRYPTO / WEB3 INFLUENCERS
// Verified handles - your account should follow these
// ============================================
export const CRYPTO_INFLUENCERS: Influencer[] = [
  // Founders & Core Figures
  {
    handle: "VitalikButerin",
    name: "Vitalik Buterin (Ethereum)",
    category: "crypto"
  },
  {
    handle: "cz_binance",
    name: "CZ (Binance)",
    category: "crypto"
  },
  {
    handle: "brian_armstrong",
    name: "Brian Armstrong (Coinbase)",
    category: "crypto"
  },
  {
    handle: "saylor",
    name: "Michael Saylor (MicroStrategy)",
    category: "crypto"
  },
  {
    handle: "balajis",
    name: "Balaji Srinivasan",
    category: "crypto"
  },
  
  // Thought Leaders
  {
    handle: "APompliano",
    name: "Anthony Pompliano",
    category: "crypto"
  },
  {
    handle: "aantonop",
    name: "Andreas Antonopoulos",
    category: "crypto"
  },
  {
    handle: "naval",
    name: "Naval Ravikant",
    category: "crypto"
  },
  {
    handle: "cdixon",
    name: "Chris Dixon (a16z)",
    category: "crypto"
  },
  {
    handle: "ErikVoorhees",
    name: "Erik Voorhees (ShapeShift)",
    category: "crypto"
  },
  
  // News & Analysis
  {
    handle: "DocumentingBTC",
    name: "Documenting Bitcoin",
    category: "crypto"
  },
  {
    handle: "WuBlockchain",
    name: "Wu Blockchain",
    category: "crypto"
  },
  {
    handle: "lookonchain",
    name: "Lookonchain (On-chain Analysis)",
    category: "crypto"
  },
  
  // DeFi & Project Founders
  {
    handle: "haaborinek",
    name: "Hayden Adams (Uniswap)",
    category: "crypto"
  },
  {
    handle: "StaniKulechov",
    name: "Stani Kulechov (Aave)",
    category: "crypto"
  },
  {
    handle: "aaborinek",
    name: "Anatoly Yakovenko (Solana)",
    category: "crypto"
  },
  {
    handle: "gavofyork",
    name: "Gavin Wood (Polkadot)",
    category: "crypto"
  },
];

// ============================================
// AI / TECH INFLUENCERS (for future expansion)
// ============================================
export const AI_INFLUENCERS: Influencer[] = [
  {
    handle: "sama",
    name: "Sam Altman (OpenAI)",
    category: "ai"
  },
  {
    handle: "ylecun",
    name: "Yann LeCun (Meta AI)",
    category: "ai"
  },
  {
    handle: "karpathy",
    name: "Andrej Karpathy",
    category: "ai"
  },
  {
    handle: "elonmusk",
    name: "Elon Musk",
    category: "ai"
  },
];

// ============================================
// ACTIVE INFLUENCER LIST
// ============================================
// Change this to include the influencers you want to track
// Make sure your X account follows all of them!

export const INFLUENCERS: Influencer[] = [
  ...CRYPTO_INFLUENCERS,
  // Uncomment to add AI influencers:
  // ...AI_INFLUENCERS,
];

console.log(`📊 Tracking ${INFLUENCERS.length} influencers`);

// Browser configuration
export const BROWSER_CONFIG = {
  headless: false,
  slowMo: 100,
  viewport: {
    width: 1280,
    height: 800
  }
};

// Fetch configuration
export const FETCH_CONFIG = {
  delayBetweenAccounts: {
    min: 8000,
    max: 20000
  },
  pageLoadDelay: 3000,
  screenshotDir: "./screenshots",
  tweetsPerAccount: 10,
  maxTweetAgeHours: 24,
  mediaDir: "./media",
};

// Groq API configuration
export const AI_CONFIG = {
  model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  maxTokens: 2000
};
