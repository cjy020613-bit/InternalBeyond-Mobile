# InternalBeyond Mobile — Friends Template

This branch is a noncommercial friend-ready template based on InternalBeyond-Mobile.

Required Notice: Copyright © 2025-2026 Sui (https://github.com/Sui-IB)

Please keep the repository `LICENSE` file and the Required Notice above when redistributing this template. The upstream project is licensed under PolyForm Noncommercial 1.0.0; personal, hobby, study, and other noncommercial uses are permitted under that license. Commercial use is not granted by this template.

## What this branch keeps

- CY blue/glass chat styling
- Native upstream avatars and message grouping
- Mutual paw interactions
- Editable shared action / body target / count lexicon
- Fast streamed interaction rendering
- Dynamic Codex model picker
- ChatGPT/Codex device login through the gateway
- OB bridge hooks for future long-term memory integration

## What this branch removes from defaults

- The original owner's Railway gateway URL
- The original private pairing token
- The original `莹莹 / 澈` identity defaults
- The original relationship/persona defaults
- Any private chat or memory data (those are not stored in the repository)

On first launch the app asks for the local user's name, AI name, relationship, and optional persona text.

## Frontend deployment

1. Fork this repository.
2. Use the `release/friends-template` branch as the source you copy/merge into your own `main` branch.
3. Keep `.github/workflows/pages.yml` and enable GitHub Pages with GitHub Actions.
4. After deployment, open your Pages URL. The first-run setup asks for your names and relationship.

## Gateway deployment

Each person should deploy their own gateway. Do not share somebody else's gateway address or pairing token.

Recommended Railway setup:

- Source: your own fork of this repository
- Root directory: `gateway`
- Start/build: use the included `gateway/Dockerfile`
- Environment variable `CY_GATEWAY_TOKEN`: create a long random private string
- Environment variable `CY_ALLOWED_ORIGINS`: your GitHub Pages origin, for example `https://YOURNAME.github.io`
- Environment variable `CY_DATA_DIR`: `/app/data`

For persistent ChatGPT/Codex login, mount a Railway Volume at `/app/data`.

After Railway gives you a public domain:

1. Open the app.
2. Open the subscription/Codex settings.
3. Enter your own Railway gateway URL and `CY_GATEWAY_TOKEN`.
4. Tap `登录 ChatGPT` and complete the official device-code login with your own ChatGPT account.
5. The model picker then loads the models available to that account from `/v1/models`.

## Privacy

The browser never needs another person's ChatGPT password. Device-code authentication happens through OpenAI's official login flow. The gateway pairing token protects the private gateway and should not be committed to GitHub, posted in screenshots, or shared with friends.

## Updating from CY

The friend template intentionally keeps the underlying CY interaction system close to the main branch. Machine actor IDs may remain internal IDs such as `yingying` and `chen`; the friends-template layer replaces visible names and hidden interaction identity text with the user's own first-run profile.
