# Deploy no Render

## Configuração recomendada

Use o arquivo `render.yaml` deste projeto como Blueprint.

Ele cria um Web Service Python com:

- build: `pip install -r requirements.txt`
- start: `uvicorn app:app --host 0.0.0.0 --port $PORT`
- Python: `3.11.11`
- banco SQLite em disco persistente: `/var/data/cafis_academia.db`
- health check: `/api/health`

## Passo a passo

1. Crie um repositório GitHub somente com o conteúdo da pasta `CAFIS_Academia`.
2. Entre no Render e escolha **New +** > **Blueprint**.
3. Conecte o repositório.
4. O Render vai ler o `render.yaml`.
5. Preencha as variáveis solicitadas:
   - `CAFIS_ADMIN_EMAIL`: e-mail do admin inicial.
   - `CAFIS_ADMIN_PASSWORD`: senha forte do admin inicial.
6. Aplique o Blueprint e aguarde o deploy.

## Importante sobre dados

Este sistema usa SQLite. No Render, dados locais só persistem se houver **Persistent Disk**.

O `render.yaml` já configura um disco de 1 GB em `/var/data`, mas discos persistentes exigem plano pago. No plano free, o banco pode ser perdido em redeploy/restart.

Depois do deploy, abra `/api/health` e confirme:

- `persistent_database` deve estar como `true`.
- `database_path` deve ser `/var/data/cafis_academia.db`.

Se o healthcheck mostrar outro caminho, crie/ative o disco persistente no Render ou defina `CAFIS_DB_PATH=/var/data/cafis_academia.db`.

## Segurança antes de usar com alunos reais

- Use uma senha forte no `CAFIS_ADMIN_PASSWORD`.
- Mantenha `CAFIS_COOKIE_SECURE=1`.
- Ative domínio HTTPS do Render ou domínio próprio com HTTPS.
- Faça backup periódico do arquivo `/var/data/cafis_academia.db`.
- Para produção maior, migre o banco para PostgreSQL.
