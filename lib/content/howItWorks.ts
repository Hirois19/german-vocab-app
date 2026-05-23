/**
 * Long-form in-app guide content (the "How it works" screen).
 *
 * Kept out of the i18n string files on purpose: this is multi-paragraph
 * documentation, not short UI labels. The screen picks a language by the
 * active i18next locale and falls back to English.
 */

export interface GuideSection {
  heading: string;
  /** Optional intro paragraph shown above the bullets. */
  body?: string;
  /** Optional bullet list. */
  bullets?: string[];
  /** When true the screen renders the section with an emphasized style. */
  highlight?: boolean;
}

export interface GuideContent {
  title: string;
  intro: string;
  sections: GuideSection[];
}

const ja: GuideContent = {
  title: '使い方',
  intro:
    'このアプリは「SEKI 7×7メソッド」という固定スケジュール式の学習法で、ドイツ語の語彙を覚えます。各単語を決まった回数だけ復習する、シンプルで予測しやすい学習法です。7サイクルを終える頃には、覚えた単語の98%以上が定着します。',
  sections: [
    {
      heading: 'SEKI 7×7メソッドとは',
      body: '学習する単語数 W を決め、その全部を49日かけて7回ずつ復習します。',
      bullets: [
        '例: 350語を覚えたい場合、1日50語ずつ学習します（350 ÷ 7 = 50）。',
        '1日目は1〜50語、2日目は51〜100語…と進み、7日で350語を1周します。この7日間が1サイクル（1セット）です。',
        '同じ7日間のループを合計7サイクル繰り返します。デッキ全体で49日です。',
        '結果として、1つの単語を必ず7回復習します。難易度で回数は変わりません。',
        'スケジュールはセッション単位です。1日休んでも進度は戻らず、次に開いたとき同じDayから再開します。',
      ],
    },
    {
      heading: '5サイクル目まで続けること（いちばん大切）',
      highlight: true,
      body: 'このメソッドで最も大切なのは、結果が出なくても5サイクル目まで続けることです。',
      bullets: [
        '最初の4サイクルは、ほとんど覚えられないと感じるのが普通です。ここでやめてはいけません。',
        '5サイクル目あたりで定着率が急激に上がります。それまで覚えられなかった単語が、一気に定着し始めます。',
        '7サイクルを終える頃には、98%以上が定着します。',
        'ブレイクスルーは後半に来ます。途中でやめると、その効果を受け取れません。覚えられないと感じても続けてください。',
      ],
    },
    {
      heading: 'デッキを作る',
      body: '「全デッキ」タブから新しいデッキを作成します。作成時に次の3つを選びます。',
      bullets: [
        'レベル: A1, A2, B1, B2, C1 から1つ。',
        '7日間の学習語数 W。1日のバッチ数は W ÷ 7 です。',
        'トリアージモード（下記）。',
      ],
    },
    {
      heading: '知っている単語を仕分ける（トリアージ）',
      body: '既に知っている単語を学習対象から外す仕組みです。3つのボタンで判定し、「知らない」と判定した単語だけがデッキに入ります。',
      bullets: [
        '一括モード: 学習開始前に候補語をまとめて仕分けます。',
        '逐次モード: 各単語が初めて出たとき、その場で仕分けます。知っている単語が抜けると、次の候補が繰り上がります。',
        'ボタンは「完全にわかる」「知っている」「知らない」の3段階です。',
      ],
    },
    {
      heading: '毎日のセッション',
      body: '「今日」タブから今日のセッションを開始します。',
      bullets: [
        'カードのドイツ語を見て、めくると意味・例文・活用が出ます。',
        '3段階で自己評価します: YES（完全に覚えた）、HALF（意味を推測できた）、NO（わからなかった）。',
        '発音ボタンで読み上げ、タグボタンでその単語のタグを編集できます。',
        '割り当てられたバッチを1周するとセッション完了です。',
      ],
    },
    {
      heading: '苦手デッキ',
      body: '49日を完走すると、繰り返し間違えた単語が「苦手プール」に集まります。',
      bullets: [
        'NOが規定回数を超えた単語、または最終サイクルで定着しなかった単語が苦手と判定されます。',
        '苦手プールがW語たまると、新しい苦手デッキが自動生成されます。',
        '苦手デッキも同じ49日サイクルで再学習します。',
      ],
    },
    {
      heading: 'ダッシュボードのタブ',
      bullets: [
        '今日: 今日のセッションとアクティブなデッキ。',
        '進捗: レベル別のカバー率と、サイクルごとの定着状況。',
        '全デッキ: デッキの作成・切り替え。',
        'マスター履歴 / 品詞・タグ別 / 推移: 学習の分析。',
      ],
    },
    {
      heading: 'オフラインで使う',
      body: '通信がなくても学習できます。オフライン中の評価は端末に保存され、オンラインに戻ると自動で同期されます。画面上部のバッジで同期状況を確認できます。',
    },
  ],
};

const en: GuideContent = {
  title: 'How it works',
  intro:
    'This app teaches German vocabulary with the SEKI 7×7 method, a fixed-schedule study technique. Each word is reviewed a set number of times, so the plan is simple and predictable. By the end of the seventh cycle, over 98% of the words have stuck.',
  sections: [
    {
      heading: 'The SEKI 7×7 method',
      body: 'You choose how many words to learn, W, and review all of them 7 times over 49 days.',
      bullets: [
        'Example: to learn 350 words, you study 50 a day (350 ÷ 7 = 50).',
        'Day 1 covers words 1-50, day 2 covers 51-100, and so on. Seven days cover all 350. Those seven days are one cycle (one set).',
        'The same seven-day loop repeats 7 times. A full deck is 49 days.',
        'As a result every word is reviewed exactly 7 times, regardless of difficulty.',
        'The schedule is session-based. A missed day does not move the schedule; you resume from the same day next time.',
      ],
    },
    {
      heading: 'Keep going until cycle 5 (the most important point)',
      highlight: true,
      body: 'The single most important thing about this method is to keep going until cycle 5, even when it does not seem to be working.',
      bullets: [
        'For the first four cycles it is normal to feel that almost nothing is sticking. Do not stop here.',
        'Around cycle 5, retention rises sharply. Words that would not stick before start to lock in all at once.',
        'By the end of cycle 7, retention is over 98%.',
        'The breakthrough comes late. If you quit partway through you never reach it, so keep going even when it feels useless.',
      ],
    },
    {
      heading: 'Create a deck',
      body: 'Create a new deck from the "All decks" tab. You choose three things:',
      bullets: [
        'Level: one of A1, A2, B1, B2, C1.',
        'Words per 7 days, W. The daily batch size is W ÷ 7.',
        'Triage mode (see below).',
      ],
    },
    {
      heading: 'Triage: marking words you already know',
      body: 'Triage removes words you already know from the schedule. You judge each word with three buttons. Only the words you mark "don\'t know" go into the deck.',
      bullets: [
        'Bulk mode: triage the candidate words all at once before you start.',
        'Progressive mode: triage each word the first time it appears. When a known word drops out, the next candidate moves up to replace it.',
        'The three buttons are "Fully know", "Know it", and "Don\'t know".',
      ],
    },
    {
      heading: 'The daily session',
      body: 'Start the day\'s session from the "Today" tab.',
      bullets: [
        'See the German word, then reveal the meaning, example, and word forms.',
        'Rate yourself on three levels: YES (knew it fully), HALF (inferred the meaning), NO (did not know it).',
        'Use the speak button to hear the word and the tag button to edit its tags.',
        "The session is complete once you finish the day's batch.",
      ],
    },
    {
      heading: 'Weak decks',
      body: 'When a deck finishes its 49 days, the words you kept missing collect in a weak pool.',
      bullets: [
        'A word is weak if it was rated NO too many times, or if it had not stuck by the final cycle.',
        'Once the weak pool reaches W words, a new weak deck is created automatically.',
        'A weak deck runs the same 49-day cycle.',
      ],
    },
    {
      heading: 'Dashboard tabs',
      bullets: [
        "Today: the day's session and your active deck.",
        'Progress: per-level coverage and how well each cycle is sticking.',
        'All decks: create and switch decks.',
        'Mastered / By category / Trend: analysis of your learning.',
      ],
    },
    {
      heading: 'Using the app offline',
      body: 'You can study with no connection. Ratings made offline are stored on the device and sync automatically once you are back online. The badge at the top of the screen shows the sync status.',
    },
  ],
};

const CONTENT: Record<string, GuideContent> = { ja, en };

/** Return the guide content for the given i18next language, falling back to English. */
export function getGuideContent(language: string): GuideContent {
  return CONTENT[language] ?? CONTENT.en;
}
