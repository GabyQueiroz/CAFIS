# CAFIS Academia UTFPR Ponta Grossa

Sistema web responsivo para gerenciamento da academia do CAFIS.

## Recursos implementados

- Login com perfis `admin` e `student`.
- Cadastro de alunos, objetivos, disponibilidade e tempo semanal.
- Registro de bioimpedancia e testes no estilo QualIA.
- Recomendacoes e planejamento mensal/semana com base no objetivo.
- QR code do aluno para presenca.
- Scanner por camera para estagiarios/admin registrarem entrada e saida.
- Controle de horas e certificado imprimivel.
- Equipamentos, manutencao, emails/recados e historico com graficos.

## Rodar localmente

```powershell
cd C:\Users\gabri\OneDrive\Documentos\UTFPR\CAFIS_Academia
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8020 --reload
```

Acesse `http://127.0.0.1:8020`.

Login inicial:

- Email: `admin@cafis.utfpr.edu.br`
- Senha: `Admin@12345`

Troque antes de publicar usando variaveis de ambiente.

## Publicacao segura

Para publicar, use HTTPS obrigatorio e configure:

```text
CAFIS_ADMIN_EMAIL=seu-email@utfpr.edu.br
CAFIS_ADMIN_PASSWORD=uma-senha-forte
CAFIS_DB_PATH=/data/cafis_academia.db
CAFIS_SMTP_HOST=smtp...
CAFIS_SMTP_PORT=587
CAFIS_SMTP_USER=...
CAFIS_SMTP_PASSWORD=...
CAFIS_SMTP_FROM=...
CAFIS_COOKIE_SECURE=1
```

Hospedagens simples: Render, Railway, Fly.io ou VPS com Nginx + HTTPS.

Antes de uso real com dados sensiveis:

- ativar `CAFIS_COOKIE_SECURE=1` quando estiver em HTTPS;
- revisar LGPD, termo de consentimento e politica de privacidade;
- restringir acesso admin com emails institucionais;
- fazer backup criptografado do banco;
- usar PostgreSQL gerenciado para producao se houver muitos usuarios;
- adicionar 2FA para estagiarios.

## Android e iOS

O recomendado primeiro e publicar como PWA: o site funciona no celular e pode ser instalado na tela inicial. Depois, se precisar estar nas lojas, empacote a mesma web app com Capacitor:

```bash
npm create @capacitor/app
npm install @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios
```

Assim voce mantem um unico sistema e gera app Android/iOS quando o produto estiver maduro.
