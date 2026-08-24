# CAFIS Academia UTFPR Ponta Grossa

Sistema web para gestão de projetos do CAFIS da UTFPR Ponta Grossa, com foco em academia, turmas, presenças, avaliações físicas, certificados e acompanhamento de alunos.

O projeto foi construído como uma aplicação web única, com backend em FastAPI, frontend estático em HTML/CSS/JavaScript e banco local em SQLite. A proposta é centralizar, em uma única interface, o controle de alunos da academia, o registro de presença por QR Code, o acompanhamento de evolução física e a gestão de turmas de projetos como academia e natação.

## Visão geral

O sistema atende dois perfis principais:

- `admin`: equipe responsável, estagiários e coordenação.
- `student`: alunos vinculados aos projetos.

Na prática, o sistema permite:

- autenticação com perfis separados;
- cadastro público de aluno com aprovação administrativa;
- cadastro manual ou em lote de estudantes via CSV/XLSX;
- controle de presença por QR Code ou lançamento manual;
- criação e gerenciamento de turmas por projeto;
- chamada por data/aula com presença, falta e falta justificada;
- registro de avaliações físicas e bioimpedância;
- geração de recomendações com score de risco;
- cadastro de equipamentos e manutenção;
- envio e registro de comunicados por e-mail;
- emissão de certificados por aluno e por turma;
- uso em navegador desktop e celular como PWA.

## Funcionalidades implementadas

### 1. Autenticação e perfis

- login por e-mail e senha;
- persistência de sessão via cookie;
- separação de permissões entre `admin` e `student`;
- criação automática de usuário administrador inicial no primeiro start.

### 2. Cadastro e gestão de alunos

- cadastro público com status pendente;
- aprovação ou recusa pela equipe do CAFIS;
- cadastro administrativo direto;
- edição de dados como:
  - nome;
  - e-mail;
  - CPF;
  - matrícula/RA;
  - telefone;
  - data de nascimento;
  - objetivo;
  - disponibilidade semanal;
  - tempo semanal disponível;
  - observações.

### 3. Avaliações físicas

O módulo de avaliações aceita dados de:

- bioimpedância;
- medidas corporais;
- testes de força e flexibilidade;
- frequência cardíaca;
- pressão arterial;
- teste de Cooper;
- VO2max.

O sistema calcula e armazena:

- score QualIA;
- classificação de risco;
- recomendações em texto;
- histórico individual de evolução.

### 4. Presença da academia

- geração de QR Code por aluno;
- leitura de QR Code por câmera no navegador;
- registro de entrada e saída;
- cálculo automático de minutos de permanência;
- lançamento manual quando o QR não estiver disponível;
- exibição de quem está dentro da academia no momento.

### 5. Projetos, turmas e chamada

O sistema já nasce com dois programas cadastrados:

- `Academia`
- `Natação`

Para esses programas, é possível:

- criar turmas;
- definir horário, professor, local e carga padrão;
- matricular alunos manualmente;
- importar alunos em lote por planilha;
- criar sessões/aulas por data;
- registrar chamada com:
  - `present`
  - `absent`
  - `justified`
- somar presença e minutos por aluno.

### 6. Certificados

O sistema gera certificados em HTML imprimível para:

- horas acumuladas na academia;
- horas e presenças em turmas específicas.

### 7. Equipamentos

- cadastro de equipamentos;
- categoria;
- status;
- quantidade;
- local;
- foto em base64;
- observações de manutenção.

### 8. Mensagens e e-mail

- envio de mensagens para um aluno específico;
- envio para todos os alunos;
- registro de status de envio no banco;
- fallback para auditoria mesmo sem SMTP configurado.

## Arquitetura do projeto

```text
CAFIS
├── app.py
├── frontend/
│   ├── index.html
│   ├── script.js
│   ├── style.css
│   ├── manifest.webmanifest
│   ├── sw.js
│   ├── icon.svg
│   └── utfpr-logo.svg
├── requirements.txt
├── render.yaml
├── DEPLOY_RENDER.md
└── modelo_importacao_alunos.csv
```

## Stack utilizada

### Backend

- Python
- FastAPI
- Pydantic
- SQLite
- qrcode
- openpyxl

### Frontend

- HTML5
- CSS3
- JavaScript puro
- `jsQR` via CDN para leitura de QR Code

## Estrutura de banco de dados

O banco é criado automaticamente no startup. As principais tabelas são:

- `users`
- `sessions`
- `evaluations`
- `attendance`
- `equipment`
- `workout_plans`
- `messages`
- `programs`
- `class_groups`
- `enrollments`
- `class_sessions`
- `class_attendance`

## Como executar localmente

### Pré-requisitos

- Python 3.11 ou superior
- `pip`

### Passo a passo

```powershell
cd C:\caminho\para\CAFIS
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8020 --reload
```

Abra:

```text
http://127.0.0.1:8020
```

## Login inicial

Ao iniciar pela primeira vez, o sistema garante a existência de uma conta admin bootstrap:

- E-mail: `admin@cafis.utfpr.edu.br`
- Senha: `Admin@12345`

Também existe uma segunda conta de bootstrap prevista por variável de ambiente:

- E-mail padrão: `adm.cafis@utfpr.edu.br`

Essas credenciais devem ser trocadas antes de qualquer uso público.

## Variáveis de ambiente

O projeto já lê as seguintes variáveis:

```text
CAFIS_DB_PATH
CAFIS_FALLBACK_DB_PATH
CAFIS_COOKIE_SECURE
CAFIS_ADMIN_EMAIL
CAFIS_ADMIN_PASSWORD
CAFIS_CAFIS_ADMIN_EMAIL
CAFIS_CAFIS_ADMIN_PASSWORD
CAFIS_SMTP_HOST
CAFIS_SMTP_PORT
CAFIS_SMTP_USER
CAFIS_SMTP_PASSWORD
CAFIS_SMTP_FROM
```

### Exemplo recomendado

```text
CAFIS_ADMIN_EMAIL=seu-email@utfpr.edu.br
CAFIS_ADMIN_PASSWORD=uma-senha-forte
CAFIS_DB_PATH=/data/cafis_academia.db
CAFIS_COOKIE_SECURE=1
CAFIS_SMTP_HOST=smtp.exemplo.com
CAFIS_SMTP_PORT=587
CAFIS_SMTP_USER=usuario
CAFIS_SMTP_PASSWORD=senha
CAFIS_SMTP_FROM=contato@exemplo.com
```

## Importação de alunos

O sistema aceita `CSV` e `XLSX`.

Campos esperados:

```text
nome,email,cpf,matricula,telefone,nascimento,senha,observacoes
```

Há um arquivo modelo no repositório:

- `modelo_importacao_alunos.csv`

## Rotas principais da API

### Autenticação

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/register`
- `GET /api/me`

### Administração e alunos

- `GET /api/admin/overview`
- `GET /api/students`
- `POST /api/students`
- `PUT /api/students/{student_id}`
- `GET /api/students/{student_id}`
- `GET /api/admin/pending-students`
- `POST /api/admin/pending-students/{student_id}/approve`
- `DELETE /api/admin/pending-students/{student_id}`

### Avaliações e QR

- `POST /api/evaluations`
- `GET /api/my/dashboard`
- `GET /api/my/qr`

### Presença

- `POST /api/attendance/scan`
- `POST /api/attendance/manual`

### Equipamentos

- `GET /api/equipment`
- `POST /api/equipment`
- `PUT /api/equipment/{equipment_id}`

### Mensagens

- `POST /api/messages`

### Programas, turmas e chamada

- `GET /api/programs`
- `GET /api/classes`
- `POST /api/classes`
- `PUT /api/classes/{class_id}`
- `GET /api/classes/{class_id}/roster`
- `POST /api/classes/{class_id}/students`
- `POST /api/classes/{class_id}/import`
- `POST /api/classes/{class_id}/sessions`
- `GET /api/sessions/{session_id}/attendance`
- `POST /api/sessions/{session_id}/attendance`

### Certificados

- `GET /api/certificates/{student_id}`
- `GET /api/certificates/classes/{class_id}/students/{student_id}`

### Saúde da aplicação

- `GET /api/health`

## Fluxo de uso recomendado

### Fluxo administrativo

1. Entrar como admin.
2. Aprovar alunos pendentes ou cadastrar manualmente.
3. Criar turmas por projeto.
4. Matricular alunos individualmente ou importar planilha.
5. Registrar avaliações físicas.
6. Controlar presença da academia por QR ou manual.
7. Abrir chamadas das turmas por data.
8. Gerar certificados quando necessário.

### Fluxo do aluno

1. Solicitar cadastro.
2. Aguardar aprovação.
3. Fazer login.
4. Consultar QR pessoal.
5. Acompanhar evolução e presença.

## Deploy

O repositório já possui:

- `render.yaml`
- `DEPLOY_RENDER.md`

### Resumo do deploy no Render

- runtime Python;
- start com `uvicorn app:app --host 0.0.0.0 --port $PORT`;
- health check em `/api/health`;
- uso de disco persistente para SQLite.

Observação importante:

- para uso real com SQLite no Render, o ideal é plano com `Persistent Disk`;
- sem disco persistente, o banco pode ser perdido em reinícios ou redeploys.

## Segurança e boas práticas

Antes de colocar em uso com alunos reais, vale revisar:

- troca das credenciais padrão;
- ativação obrigatória de HTTPS;
- `CAFIS_COOKIE_SECURE=1`;
- política de backup do banco;
- adequação à LGPD;
- termo de consentimento para dados físicos e biométricos;
- limitação de acesso administrativo;
- eventual migração para PostgreSQL caso o número de usuários cresça.

## Limitações atuais observadas no código

- o banco padrão é SQLite, adequado para uso leve, protótipos e operação pequena;
- o frontend é monolítico em JavaScript puro, o que facilita deploy, mas pode dificultar manutenção quando a interface crescer;
- não há camada formal de testes automatizados no repositório;
- não há 2FA nem trilha de auditoria avançada;
- dados sensíveis exigem cuidado extra antes de uso institucional amplo.

## Melhorias futuras sugeridas

- migrar persistência para PostgreSQL em produção;
- separar melhor backend, frontend e serviços auxiliares;
- criar testes automatizados para API;
- registrar logs estruturados de operações críticas;
- adicionar redefinição de senha e confirmação por e-mail;
- incluir dashboards administrativos com relatórios agregados;
- adicionar permissões mais granulares para estagiários e coordenação.

## Público-alvo

Este projeto faz sentido para:

- projetos de extensão universitária;
- academias institucionais;
- programas esportivos com controle acadêmico;
- ações com necessidade de certificados e presença documentada.

## Licença

Este repositório não explicita licença no código atual. Se a intenção for abrir o projeto publicamente, vale adicionar uma licença formal, como MIT, Apache-2.0 ou outra compatível com o uso pretendido.
