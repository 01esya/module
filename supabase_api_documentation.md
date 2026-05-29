# Supabase API Documentation

## Общая информация

Проект использует **Supabase** как backend-платформу.

Важно:

- API генерируется автоматически на основе схемы базы данных.
- API может изменяться при изменении структуры БД.
- Основной способ работы с системой — через библиотеку Supabase и прикладной код.
- Примеры ниже приведены для ознакомления с доступными endpoint'ами и проверкой запросов.

---

## Основные параметры подключения

```env
PROJECT_URL (SUPABASE_URL)       = https://194-67-127-185.cloudvps.regruhosting.ru
ANON_KEY    (SUPABASE_KEY)       = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc0MjkwNTkwLCJleHAiOjE5MzE5NzA1OTB9.I5pEgsEt60x6j0TLrJQDTYN9WyAVDWpnLJvReL_ezQQ
```

---

## Тестовый пользователь

```env
TEST_USER_EMAIL    = test@ends.ru
TEST_USER_PASSWORD = fdp-swf-AdZ-RB7
```

---

## Полезный материал

- Библиотека для работы с Supabase на Python — https://supabase.com/docs/reference/python/insert
- Использование Supabase с Refine — https://supabase.com/docs/guides/getting-started/quickstarts/refine
- Документация по работе с пользователем (аутентификация, авторизация и т.п.) — https://supabase.com/docs/guides/auth
- Документация по работе с Supabase REST API — https://supabase.com/docs/guides/api
- Документация по работе с Supabase GraphQL API — https://supabase.com/docs/guides/graphql
- Конвертер SQL в REST API — https://supabase.com/docs/guides/api/sql-to-rest

---

## Получение Swagger документации

Swagger документация используется, чтобы увидеть актуальную структуру API.

### Шаг 1. Получить описание документации

Делаем GET запрос на конечную точку `<PROJECT_URL>/rest/v1` и копируем ответ сервера.

```bash
curl --request GET \
  --url <PROJECT_URL>/rest/v1/ \
  --header 'apikey: <ANON_KEY>'
```

### Шаг 2. Визуализация документации

Чтобы преобразовать ответ сервера в Swagger документацию, необходимо перейти на сайт https://editor.swagger.io/ и вставить содержимое ответа сервера в редактор.

---

## Пример авторизации пользователя

```bash
curl -X POST '<PROJECT_URL>/auth/v1/token?grant_type=password' \
  -H 'apikey: <ANON_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "<TEST_USER_EMAIL>",
    "password": "<TEST_USER_PASSWORD>"
  }'
```

---

## Важное замечание

API будет расширяться, поэтому Swagger документацию необходимо регулярно запрашивать заново, чтобы отслеживать изменения и использовать актуальную схему.

> В работе ориентироваться на библиотеку Supabase и актуальную документацию, а Swagger использовать как источник текущей структуры API.
