# Token Tails Client

Next.js 16 website, Phaser 4 games, and the Capacitor 7 web bundle for iOS, Android, and the
Telegram Mini App. Full documentation: [docs/CLIENT.md](../docs/CLIENT.md),
[docs/GAMES.md](../docs/GAMES.md), [docs/MOBILE.md](../docs/MOBILE.md).

```bash
npm install
npm run dev                # http://localhost:3000, needs NEXT_PUBLIC_BE_URL in .env.development
npm run build              # web build plus sitemap
npm run build:app          # mobile bundle (re-enable output: "export" in next.config.js first)
npm run app:android        # sync and open Android Studio
npm run app:ios            # sync and open Xcode
npm test
```

Local notes: `docs/ANDROID_GOOGLE_PLAY_AUTOMATION.md` for Play releases,
`docs/MATCH3_GAME_MODE_EXECUTION_PLAN.md` for the Paw Match design history, `progress.md` for
the Paw Match work log.
