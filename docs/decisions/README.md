# Architecture Decision Records

Each file records one significant design decision: the context, the choice
made, its consequences, and the alternatives that were rejected. The format is
deliberately short so the reasoning stays readable.

| ADR                                              | Decision                                                        |
| ------------------------------------------------ | --------------------------------------------------------------- |
| [0001](0001-seki-method-over-fsrs.md)            | SEKI 7×7 fixed schedule over adaptive SRS (FSRS, SM-2)          |
| [0002](0002-weak-deck-rule.md)                   | Weak-card detection rule and the 苦手デッキ loop                |
| [0003](0003-cards-usercards-decks-separation.md) | Separate the dictionary, decks, and per-card study state        |
| [0004](0004-offline-first-sync.md)               | Offline writes via a mutation outbox, not a full SQLite mirror  |
| [0005](0005-expo-over-flutter-native.md)         | Expo (managed React Native) over Flutter or bare React Native   |
| [0006](0006-rls-from-day-one.md)                 | Row Level Security on every user table from the first migration |
