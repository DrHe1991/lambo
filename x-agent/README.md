# SatLine X Agent 🤖

Automatically fetch tweets from X (Twitter) influencers, recognize content with AI, and rewrite for your platform.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd x-agent
npm install
npx playwright install chromium
```

### 2. Configure Environment Variables

Copy `env.example` to `.env` and fill in your credentials:

```bash
cp env.example .env
```

Edit `.env`:

```env
# Your X (Twitter) account
X_USERNAME=your_twitter_username
X_PASSWORD=your_twitter_password

# Groq API Key (get from console.groq.com)
GROQ_API_KEY=gsk_xxxxx
GROQ_MODEL=llama-3.3-70b-versatile
```

### 3. Run

**Option 1: Step by step (recommended for debugging)**

```bash
# Step 1: Fetch Vitalik's latest tweet screenshots
npm run fetch

# Step 2: Recognize and rewrite content
npm run rewrite
```

**Option 2: One command**

```bash
npm run run
```

## 📁 Output

- **Screenshots**: Saved in `./screenshots/` directory
- **Rewritten results**: Saved in `./output/` directory, JSON format

## 📂 Project Structure

```
x-agent/
├── src/
│   ├── browser/
│   │   └── twitter.ts      # Playwright browser automation
│   ├── ai/
│   │   ├── vision.ts       # Groq Vision screenshot recognition
│   │   └── rewriter.ts     # Groq content rewriting
│   ├── config.ts           # Configuration (influencer list, etc.)
│   ├── fetch-vitalik.ts    # Fetch script
│   ├── rewrite-content.ts  # Rewrite script
│   └── index.ts            # Complete pipeline entry
├── screenshots/            # Screenshot storage
├── cookies/                # Login state storage
├── output/                 # Rewritten results output
├── env.example             # Environment variable template
└── package.json
```

## ⚙️ Configuration

Edit `src/config.ts` to modify:

### Influencer List

```typescript
export const INFLUENCERS: Influencer[] = [
  {
    handle: "VitalikButerin",  // X username
    name: "Vitalik Buterin",   // Display name
    category: "crypto",        // Category
    priority: 1                // Priority
  },
  // Add more...
];
```

### Fetch Settings

```typescript
export const FETCH_CONFIG = {
  delayBetweenAccounts: { min: 5000, max: 15000 }, // Delay between accounts
  pageLoadDelay: 3000,                              // Page load wait time
  tweetsPerAccount: 3                               // Tweets to fetch per account
};
```

### Browser Settings

```typescript
export const BROWSER_CONFIG = {
  headless: false,  // true=headless mode, false=show browser window
  slowMo: 100       // Delay between actions (milliseconds)
};
```

## 🔧 Troubleshooting

### Login Failed

1. Check if username and password are correct
2. X may require additional verification (phone/email), complete manually on first run
3. After successful login, cookies are saved to `./cookies/`, no need to login again

### Empty Screenshots

1. Make sure you can access x.com
2. Try setting `headless` to `false` to see what's happening
3. X's page structure may have changed, selectors may need updating

### API Call Failed

1. Check if GROQ_API_KEY is correct
2. Make sure account has sufficient balance
3. Watch for API rate limits

## ⚠️ Notes

1. **Account Risk**: Frequent use of automation tools may cause X account restrictions. Recommendations:
   - Use a secondary account
   - Control fetch frequency
   - Don't login from multiple devices simultaneously

2. **Copyright Issues**: Rewritten content still requires attention to copyright. Recommendations:
   - Rewrite thoroughly, don't just translate
   - Add your own opinions and commentary
   - Attribute content source (optional)

3. **API Cost**: Groq API has free quota and is extremely fast:
   - Uses Llama 3.3 70B for rewriting
   - Uses Llama 3.2 11B Vision for image recognition

## 🔜 Roadmap

- [ ] Add more influencer monitoring
- [ ] Support scheduled auto-run (cron)
- [ ] Integrate SatLine publishing API
- [ ] Add content deduplication
- [ ] Support Reddit, Zhihu, and other platforms
