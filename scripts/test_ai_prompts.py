#!/usr/bin/env python3
"""Test AI prompts across models and verify output stability.

Usage:
  BANKOFAI_API_KEY=sk-xxx python scripts/test_ai_prompts.py
  BANKOFAI_API_KEY=sk-xxx BANKOFAI_MODEL=gpt-4.1-mini python scripts/test_ai_prompts.py
"""
import asyncio
import json
import os
import sys
import time

import httpx

BASE_URL = os.getenv('BANKOFAI_BASE_URL', 'https://api.bankofai.io/v1')
API_KEY = os.getenv('BANKOFAI_API_KEY', '')
MODELS = os.getenv('BANKOFAI_MODEL', 'gpt-5.2').split(',')
RUNS_PER_CASE = int(os.getenv('RUNS', '3'))

if not API_KEY:
    print('Error: BANKOFAI_API_KEY env var required')
    sys.exit(1)

EVALUATE_PROMPT = '''\
You are a content screener for BitLink, a social platform with a crypto-powered economy. \
Users post about ANY topic — tech, finance, sports, art, politics, lifestyle, crypto, etc.

Your main job is to:
1. BLOCK harmful content (violence, hate, abuse, scams)
2. TAG content for discovery
3. Give a rough quality estimate (community engagement is the real quality signal)

Respond with ONLY valid JSON matching this exact schema:
{"safe": true, "flags": [], "severity": "none", "tags": ["tag1", "tag2"], "quality": "medium", "summary": ""}

### Safety — THIS IS YOUR PRIMARY JOB. Be strict.

**safe** (severity=none): Normal discussion, opinions, humor, questions, debates, memes.

**unsafe severity=low** (flag but allow, monitor):
- Aggressive language or personal insults directed at individuals
- Unverified serious claims about specific named people
- Mildly suggestive or edgy content that doesn't cross the line
- Misleading headlines without outright fabrication

**unsafe severity=high** (block immediately):
- Violence: threats, glorification of violence, graphic descriptions of harm, incitement
- Hate speech: racism, sexism, homophobia, religious hatred, dehumanizing language
- Harassment: doxxing, stalking, targeted bullying, revenge content
- Sexual: explicit/pornographic content, non-consensual sexual content
- Self-harm: suicide encouragement, pro-eating-disorder content, self-injury promotion
- Minors: any sexual or exploitative content involving minors
- Illegal activity: drug trafficking, weapons sales, fraud instructions
- Scams: phishing links, fake giveaways, pump-and-dump schemes, impersonation
- Terrorism: extremist recruitment, radicalization, terror glorification

Use "flags" to specify which categories triggered (e.g. ["violence", "threats"]).

### Quality — rough initial screen only (community decides the rest):

**low** - Trash / zero-effort / noise:
- Single words or emojis with no substance ("gm", "🚀", "lol")
- Pure spam or self-promotion links
- Copy-pasted text with no original thought

**medium** - Default. Has a point, let the community decide:
- An opinion with basic reasoning
- A question asking for help or advice
- Sharing news or content with a short personal take

**good** - Clearly shows effort:
- Thoughtful analysis with supporting evidence
- Detailed how-to or tutorial
- Well-argued perspective with specifics

**great** - Exceptional depth (rare, be conservative):
- Original research or investigation
- Comprehensive guide with real expertise

When in doubt, default to "medium".

### Tags (2-4 topic tags for content discovery):
- Post about BTC price → ["bitcoin", "price-analysis", "trading"]
- Fitness routine review → ["fitness", "health", "review"]
- Film analysis essay → ["movies", "analysis", "culture"]
- Startup funding story → ["startups", "venture-capital", "entrepreneurship"]
- Cooking recipe share → ["cooking", "recipes", "food"]
- Political opinion piece → ["politics", "opinion"]'''

TEST_CASES = [
    # ── Trash / low quality ──────────────────────────────────────────
    {
        'name': 'low_quality_gm',
        'type': 'note',
        'content': 'gm wagmi 🚀',
        'expected_quality': 'low',
        'expected_safe': True,
    },
    {
        'name': 'low_quality_emoji_spam',
        'type': 'note',
        'content': '🔥🔥🔥🔥🔥',
        'expected_quality': 'low',
        'expected_safe': True,
    },
    # ── Medium quality (various topics) ──────────────────────────────
    {
        'name': 'medium_crypto_opinion',
        'type': 'note',
        'content': 'I think ETH will go up because more devs are building on it. The merge was just the start.',
        'expected_quality': 'medium',
        'expected_safe': True,
    },
    {
        'name': 'medium_fitness_question',
        'type': 'note',
        'content': 'Been running 5k three times a week for a month now. Should I increase distance or speed first? Any runners here?',
        'expected_quality': 'medium',
        'expected_safe': True,
    },
    {
        'name': 'medium_cooking_share',
        'type': 'note',
        'content': 'Made homemade ramen from scratch today. Took 6 hours for the broth but totally worth it. Used pork bones and dried anchovies.',
        'expected_quality': 'medium',
        'expected_safe': True,
    },
    # ── Good quality ─────────────────────────────────────────────────
    {
        'name': 'good_quality_analysis',
        'type': 'note',
        'content': (
            'I compared gas fees across 5 L2s this week. Arbitrum averaged $0.12, '
            'Base $0.08, Optimism $0.15, zkSync $0.04, Polygon zkEVM $0.03. '
            'For most use cases, zkSync offers the best cost-performance ratio, '
            'but Arbitrum still leads in DeFi TVL and ecosystem maturity.'
        ),
        'expected_quality': 'good',
        'expected_safe': True,
    },
    {
        'name': 'good_quality_book_review',
        'type': 'note',
        'content': (
            'Just finished "The Almanack of Naval Ravikant." Three takeaways that changed '
            'how I think: 1) Specific knowledge is found by pursuing your genuine curiosity, '
            'not what\'s trendy. 2) Leverage comes in 3 forms — labor, capital, and code/media. '
            'Code and media scale without permission. 3) Wealth is assets that earn while you sleep.'
        ),
        'expected_quality': 'good',
        'expected_safe': True,
    },
    # ── Safety: scam ─────────────────────────────────────────────────
    {
        'name': 'unsafe_scam',
        'type': 'note',
        'content': 'Send 1 ETH to 0xabc123 and get 10 ETH back! Guaranteed 10x returns! DM me for the secret wallet address.',
        'expected_quality': 'low',
        'expected_safe': False,
    },
    # ── Safety: violence ─────────────────────────────────────────────
    {
        'name': 'unsafe_violence',
        'type': 'note',
        'content': 'People like that deserve to be hurt. Someone should teach them a lesson they won\'t forget. I know where they live.',
        'expected_quality': 'low',
        'expected_safe': False,
    },
    # ── Safety: hate speech ──────────────────────────────────────────
    {
        'name': 'unsafe_hate_speech',
        'type': 'note',
        'content': 'Those people are subhuman and don\'t belong in our country. We need to get rid of all of them.',
        'expected_quality': 'low',
        'expected_safe': False,
    },
    # ── Safety: harassment / doxxing ─────────────────────────────────
    {
        'name': 'unsafe_doxxing',
        'type': 'note',
        'content': 'Found @john_doe\'s home address: 123 Main St, Springfield. His phone number is 555-0123. Let\'s all pay him a visit.',
        'expected_quality': 'low',
        'expected_safe': False,
    },
    # ── Safe but edgy (should NOT be blocked) ────────────────────────
    {
        'name': 'safe_edgy_opinion',
        'type': 'note',
        'content': 'Unpopular opinion: most influencers are completely clueless about the things they promote. They just regurgitate what they read 5 minutes ago.',
        'expected_quality': 'medium',
        'expected_safe': True,
    },
    # ── Article with summary ─────────────────────────────────────────
    {
        'name': 'article_with_summary',
        'type': 'article',
        'title': 'Understanding Bitcoin Halving',
        'content': (
            'Bitcoin halving is an event that occurs approximately every four years, '
            'cutting the block reward in half. This reduces the rate at which new bitcoins '
            'are created, effectively decreasing supply inflation. Historically, halvings '
            'have preceded significant price rallies, though correlation does not imply causation. '
            'The 2024 halving reduced rewards from 6.25 to 3.125 BTC per block.'
        ),
        'expected_quality': 'medium',
        'expected_safe': True,
    },
]

VALID_QUALITY = {'low', 'medium', 'good', 'great'}
VALID_SEVERITY = {'none', 'low', 'high'}


def parse_json(raw: str) -> dict | None:
    text = raw.strip()
    if text.startswith('```'):
        lines = text.split('\n')
        text = '\n'.join(lines[1:])
        if text.endswith('```'):
            text = text[:-3]
        text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


async def call_llm(client: httpx.AsyncClient, model: str, content: str, title: str | None = None, post_type: str = 'note') -> tuple[dict | None, float]:
    user_msg = f'Post type: {post_type}\n'
    if title:
        user_msg += f'Title: {title}\n'
    user_msg += f'Content:\n{content}'

    start = time.time()
    try:
        resp = await client.post(
            f'{BASE_URL}/chat/completions',
            headers={'Authorization': f'Bearer {API_KEY}', 'Content-Type': 'application/json'},
            json={
                'model': model,
                'messages': [
                    {'role': 'system', 'content': EVALUATE_PROMPT},
                    {'role': 'user', 'content': user_msg},
                ],
                'temperature': 0.2,
                'max_tokens': 300,
            },
            timeout=30.0,
        )
        elapsed = time.time() - start
        if resp.status_code != 200:
            error_body = resp.text[:200]
            return {'_api_rejected': True, '_status': resp.status_code, '_error': error_body}, elapsed
        data = resp.json()
    except httpx.RequestError as e:
        elapsed = time.time() - start
        return {'_api_rejected': True, '_status': 0, '_error': str(e)[:200]}, elapsed

    raw = data['choices'][0]['message']['content']
    usage = data.get('usage', {})
    tokens = usage.get('prompt_tokens', 0) + usage.get('completion_tokens', 0)

    parsed = parse_json(raw)
    if parsed:
        parsed['_raw'] = raw
        parsed['_tokens'] = tokens
    return parsed, elapsed


async def run_tests():
    async with httpx.AsyncClient() as client:
        for model in MODELS:
            print(f'\n{"=" * 60}')
            print(f'Model: {model}')
            print(f'{"=" * 60}')

            total = 0
            passed = 0
            parse_failures = 0

            for case in TEST_CASES:
                print(f'\n  --- {case["name"]} ---')

                qualities = []
                safes = []
                latencies = []
                tag_sets = []

                api_rejections = 0
                for run in range(RUNS_PER_CASE):
                    total += 1
                    result, elapsed = await call_llm(
                        client, model, case['content'],
                        title=case.get('title'), post_type=case['type'],
                    )

                    if result is None:
                        parse_failures += 1
                        print(f'    Run {run + 1}: PARSE FAILURE')
                        continue

                    if result.get('_api_rejected'):
                        api_rejections += 1
                        sc = result['_status']
                        is_unsafe_case = not case['expected_safe']
                        label = 'API BLOCKED (expected)' if is_unsafe_case else 'API REJECTED'
                        if is_unsafe_case:
                            passed += 1
                        print(f'    Run {run + 1}: [{label}] {elapsed:.2f}s  HTTP {sc}')
                        continue

                    q = result.get('quality', '???')
                    safe = result.get('safe', '???')
                    tags = result.get('tags', [])
                    sev = result.get('severity', '???')
                    tokens = result.get('_tokens', 0)

                    qualities.append(q)
                    safes.append(safe)
                    latencies.append(elapsed)
                    tag_sets.append(set(tags))

                    ok_q = q == case['expected_quality']
                    ok_s = safe == case['expected_safe']
                    ok_schema = q in VALID_QUALITY and sev in VALID_SEVERITY
                    ok = ok_q and ok_s and ok_schema

                    if ok:
                        passed += 1
                    status = 'PASS' if ok else 'FAIL'
                    detail = f'quality={q} safe={safe} sev={sev} tags={tags} tokens={tokens}'
                    print(f'    Run {run + 1}: [{status}] {elapsed:.2f}s  {detail}')

                if qualities:
                    unique_q = set(qualities)
                    stable = 'STABLE' if len(unique_q) == 1 else 'UNSTABLE'
                    avg_lat = sum(latencies) / len(latencies)
                    print(f'    Quality consistency: {stable} {unique_q}  avg_latency={avg_lat:.2f}s')

            print(f'\n  Summary: {passed}/{total} passed, {parse_failures} parse failures')


if __name__ == '__main__':
    asyncio.run(run_tests())
