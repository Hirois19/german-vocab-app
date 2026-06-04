-- 0010_audio_setting.sql
-- Settings: how many times the German word is auto-spoken when the user
-- reveals a flashcard. 1 or 2.

alter table public.user_settings
  add column if not exists audio_repeat_count integer not null default 1
    check (audio_repeat_count in (1, 2));
