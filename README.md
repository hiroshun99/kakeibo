# やりくり

家計簿。手取りと世帯の条件から14カテゴリへ予算を自動配分します。

- 日本語 / English
- JPY / MYR（作成後は変更不可）
- 住居・保険の実額による圧縮（調整済）
- 消化 80% 以上、または日次ペース超過で赤字アラート
- 月末の余りは貯蓄へ自動計上

公開リポジトリ: https://github.com/hiroshun99/kakeibo  
本番: https://kakeibo-shun-hirois-projects.vercel.app

## セットアップ

```bash
npm install
npm run dev
```

本番では `DATABASE_URL`（Postgres / Neon）が必要です。未設定時は埋め込み PGLite にフォールバックしますが、サーバーレス環境では永続しません。

サインインはメール＋パスワードです。確認メール用の SMTP がない環境では、確認・再設定リンクが画面内に表示されます。

## スクリプト

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm run build` | 本番ビルド＋マイグレーション |
| `npm run typecheck` | TypeScript 検査 |

## スタック

TanStack Start / React 19 / Tailwind v4 / Better Auth / Postgres
