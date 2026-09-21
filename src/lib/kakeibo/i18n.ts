import type { Locale } from "./types.ts";

const DICT = {
  appName: { ja: "Wariai", en: "Wariai" },
  tagline: { ja: "家計を、わりあてる。", en: "Put income in its place." },
  authFailed: {
    ja: "メールアドレスまたはパスワードが正しくありません",
    en: "Email or password is incorrect",
  },
  unverified: {
    ja: "メールアドレスの確認が完了していません",
    en: "Please verify your email",
  },
  futureDate: {
    ja: "未来の日付は登録できません",
    en: "Future dates are not allowed",
  },
  saveFailed: {
    ja: "保存できませんでした。通信を確認してください",
    en: "Could not save. Check your connection",
  },
  essentialOverflow: {
    ja: "必須費が手取りを超えています。他カテゴリを最大限圧縮します",
    en: "Essential costs exceed income. Other categories will be reduced",
  },
  shortageBanner: {
    ja: "必須費が大きく、予算合計が手取りを超えています",
    en: "Budgets exceed take-home pay due to essential costs",
  },
  email: { ja: "メールアドレス", en: "Email" },
  password: { ja: "パスワード", en: "Password" },
  passwordConfirm: { ja: "パスワード（確認）", en: "Confirm password" },
  currentPassword: { ja: "現在のパスワード", en: "Current password" },
  newPassword: { ja: "新しいパスワード", en: "New password" },
  signIn: { ja: "ログイン", en: "Log in" },
  signUp: { ja: "新規登録", en: "Create account" },
  signOut: { ja: "ログアウト", en: "Log out" },
  forgotPassword: { ja: "パスワードを忘れた", en: "Forgot password" },
  resetPassword: { ja: "パスワードを再設定", en: "Reset password" },
  sendReset: { ja: "リセットリンクを送る", en: "Send reset link" },
  resetSent: {
    ja: "送信しました。届いている場合はリンクから再設定できます。",
    en: "If an account exists, a reset link is on its way.",
  },
  haveAccount: { ja: "すでにアカウントがある", en: "Already have an account" },
  noAccount: { ja: "アカウントを作る", en: "Create an account" },
  checkEmailTitle: { ja: "確認メールを送りました", en: "Check your email" },
  checkEmailBody: {
    ja: "届いたリンクを開いて登録を完了してください。リンクの有効期限は24時間です。",
    en: "Open the link we sent to finish signing up. It expires in 24 hours.",
  },
  openVerifyLink: { ja: "確認リンクを開く", en: "Open confirmation link" },
  openResetLink: { ja: "再設定リンクを開く", en: "Open reset link" },
  resend: { ja: "確認メールを再送", en: "Resend confirmation" },
  resent: { ja: "再送しました", en: "Sent again" },
  verifiedTitle: { ja: "メールを確認しました", en: "Email confirmed" },
  verifiedBody: {
    ja: "このまま初期設定を続けられます。",
    en: "You can continue setup now.",
  },
  verifying: { ja: "メールを確認しています…", en: "Confirming your email…" },
  continueSetup: { ja: "初期設定へ進む", en: "Continue setup" },
  verifyInvalid: {
    ja: "リンクが無効か、期限切れです。",
    en: "This link is invalid or has expired.",
  },
  continueToLogin: { ja: "ログインへ", en: "Go to log in" },
  language: { ja: "言語", en: "Language" },
  currency: { ja: "通貨", en: "Currency" },
  currencyLocked: {
    ja: "通貨は作成後に変更できません",
    en: "Currency cannot be changed after setup",
  },
  netIncome: { ja: "手取り月収", en: "Take-home pay" },
  householdSize: { ja: "世帯人数", en: "Household size" },
  housingType: { ja: "住居種別", en: "Housing" },
  rent: { ja: "賃貸", en: "Rent" },
  own: { ja: "持ち家", en: "Own" },
  hasCar: { ja: "車の有無", en: "Car" },
  carYes: { ja: "あり", en: "Yes" },
  carNo: { ja: "なし", en: "No" },
  housingActual: { ja: "住居費の実額", en: "Actual housing cost" },
  insuranceActual: { ja: "保険料の実額", en: "Actual insurance cost" },
  next: { ja: "次へ", en: "Next" },
  back: { ja: "戻る", en: "Back" },
  save: { ja: "保存", en: "Save" },
  cancel: { ja: "キャンセル", en: "Cancel" },
  continueAnyway: { ja: "このまま進む", en: "Continue anyway" },
  goHome: { ja: "ホームへ", en: "Go to home" },
  budgetReview: { ja: "今月の予算", en: "This month’s budget" },
  ratio: { ja: "構成比", en: "Share" },
  amount: { ja: "金額", en: "Amount" },
  adjusted: { ja: "調整済", en: "Adjusted" },
  override: { ja: "実額", en: "Actual" },
  shortage: { ja: "不足", en: "Shortfall" },
  home: { ja: "ホーム", en: "Home" },
  history: { ja: "履歴", en: "History" },
  settings: { ja: "設定", en: "Settings" },
  recordExpense: { ja: "支出を記録", en: "Log expense" },
  editExpense: { ja: "支出を編集", en: "Edit expense" },
  delete: { ja: "削除", en: "Delete" },
  category: { ja: "カテゴリ", en: "Category" },
  date: { ja: "日付", en: "Date" },
  memo: { ja: "メモ", en: "Memo" },
  memoPlaceholder: { ja: "任意（100文字まで）", en: "Optional (max 100)" },
  remaining: { ja: "残", en: "Left" },
  spent: { ja: "支出", en: "Spent" },
  budget: { ja: "予算", en: "Budget" },
  income: { ja: "手取り", en: "Income" },
  totalSpent: { ja: "支出合計", en: "Spent" },
  leftover: { ja: "残額", en: "Remaining" },
  autoBadge: { ja: "自動", en: "Auto" },
  leftoverMemo: { ja: "前月余り", en: "Previous month leftover" },
  emptyHistory: { ja: "この月の記録はまだありません", en: "No entries this month" },
  passwordHint: {
    ja: "8文字以上、英字と数字を各1文字以上",
    en: "8+ characters, with a letter and a number",
  },
  passwordMismatch: { ja: "パスワードが一致しません", en: "Passwords do not match" },
  required: { ja: "入力してください", en: "This field is required" },
  saved: { ja: "保存しました", en: "Saved" },
  deleted: { ja: "削除しました", en: "Deleted" },
  changePassword: { ja: "パスワード変更", en: "Change password" },
  passwordChanged: { ja: "パスワードを変更しました", en: "Password updated" },
  household: { ja: "世帯", en: "Household" },
  onboardingTitle: { ja: "家計の初期設定", en: "Set up your household" },
  stepOf: { ja: "{n} / {total}", en: "{n} of {total}" },
  people: { ja: "人", en: "people" },
  peopleOne: { ja: "人", en: "person" },
  single: { ja: "独身", en: "Single" },
  couple: { ja: "夫婦", en: "Couple" },
  family3: { ja: "3人家族", en: "Family of 3" },
  family4: { ja: "4人家族", en: "Family of 4+" },
  loading: { ja: "読み込み中…", en: "Loading…" },
  thisMonth: { ja: "今月", en: "This month" },
  overBudget: { ja: "超過", en: "Over" },
  continue: { ja: "続ける", en: "Continue" },
  verifyCta: {
    ja: "確認メールのリンクを開くと、記録を開始できます。",
    en: "Open the confirmation link to start recording.",
  },
} as const;

export type MsgKey = keyof typeof DICT;

export function t(locale: Locale, key: MsgKey): string {
  return DICT[key][locale];
}

export function tf(locale: Locale, key: MsgKey, vars: Record<string, string | number>): string {
  let s = t(locale, key);
  for (const [k, v] of Object.entries(vars)) {
    s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}
