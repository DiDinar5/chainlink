# DON_FILES

Папка для упаковки прод-логики в формате CRE/DON.

## Структура

- `TS/` - основной путь для `cre workflow deploy/activate` в DON runtime.
- `GO/` - backup-воркер для локального/резервного запуска (без DON workflow runtime).

## Что синхронизировано с текущим проектом

В `TS/workflows` добавлены шаблоны для актуальных pass-ов:

- `issue-sdk-token`
- `sync-kyc-status`
- `verify-world-id`
- `sync-kyb-status`
- `verify-asset`

Они оставлены как production templates: конфиг + workflow descriptor + `main.ts` с TODO для wiring через актуальный `cre init` scaffold.

## Как использовать

1. Для DON-пути используйте `TS/README.md`.
2. Для fallback локального раннера используйте `GO/README.md`.

## Важно

- `TS/` - источник истины для DON deployment pipeline.
- `GO/` сейчас покрывает KYC baseline; расширение на World ID/KYB/Asset описано в его README.
