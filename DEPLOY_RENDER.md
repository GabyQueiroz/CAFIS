# Deploy no Render

## Configuração recomendada

Use o arquivo `render.yaml` deste projeto como Blueprint.

Ele cria um Web Service Python com:

- build: `pip install -r requirements.txt`
- start: `uvicorn app:app --host 0.0.0.0 --port $PORT`
- Python: `3.11.11`
- banco PostgreSQL externo via `DATABASE_URL`
- health check: `/api/health`

## Passo a passo

1. Crie um banco PostgreSQL externo gratuito, por exemplo no Neon.
2. Copie a connection string do banco. Ela começa com `postgresql://` e normalmente termina com `?sslmode=require`.
3. Entre no Render e escolha **New +** > **Blueprint**.
4. Conecte o repositório.
5. O Render vai ler o `render.yaml`.
6. Preencha as variáveis solicitadas:
   - `DATABASE_URL`: URL de conexão PostgreSQL externa, por exemplo Neon ou Supabase.
   - `CAFIS_ADMIN_EMAIL`: e-mail do admin inicial.
   - `CAFIS_ADMIN_PASSWORD`: senha forte do admin inicial.
7. Aplique o Blueprint e aguarde o deploy.

Se o serviço já existe no Render, vá em **Environment** e adicione `DATABASE_URL`. Depois remova `CAFIS_DB_PATH`, se ela estiver configurada, e faça **Manual Deploy**.

## Importante sobre dados

No plano gratuito do Render, o filesystem local é temporário. Por isso, o app em produção deve usar PostgreSQL externo por `DATABASE_URL`.

Opções gratuitas comuns:

- Neon: crie um projeto PostgreSQL e copie a connection string.
- Supabase: crie um projeto PostgreSQL e copie a connection string.
- Render Postgres free: funciona, mas o banco gratuito do Render expira após 30 dias.

Depois do deploy, abra `/api/health` e confirme:

- `persistent_database` deve estar como `true`.
- `database_backend` deve ser `postgres`.
- `database_url_configured` deve ser `true`.

Se `database_backend` aparecer como `sqlite`, a variável `DATABASE_URL` não foi configurada no Render.

## Segurança antes de usar com alunos reais

- Use uma senha forte no `CAFIS_ADMIN_PASSWORD`.
- Mantenha `CAFIS_COOKIE_SECURE=1`.
- Ative domínio HTTPS do Render ou domínio próprio com HTTPS.
- Faça backup periódico do banco PostgreSQL externo.
