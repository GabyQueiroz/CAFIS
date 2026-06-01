from __future__ import annotations

import base64
import hashlib
import hmac
import io
import os
import secrets
import smtplib
import sqlite3
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Any

import qrcode
from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("CAFIS_DB_PATH", BASE_DIR / "cafis_academia.db"))
FRONTEND_DIR = BASE_DIR / "frontend"
UTC = timezone.utc
COOKIE_NAME = "cafis_session"
SESSION_SECONDS = 60 * 60 * 10
PBKDF2_ITERS = 260_000
COOKIE_SECURE = os.getenv("CAFIS_COOKIE_SECURE", "0").lower() in {"1", "true", "yes"}

app = FastAPI(title="CAFIS Academia UTFPR PG", version="1.0.0")


def now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def connect() -> sqlite3.Connection:
    db_path = DB_PATH
    try:
        db_path.parent.mkdir(parents=True, exist_ok=True)
    except PermissionError:
        db_path = Path(os.getenv("CAFIS_FALLBACK_DB_PATH", "/tmp/cafis_academia.db"))
        db_path.parent.mkdir(parents=True, exist_ok=True)
        print(f"WARNING: sem permissao para {DB_PATH}; usando banco temporario em {db_path}")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), PBKDF2_ITERS)
    return f"pbkdf2_sha256${PBKDF2_ITERS}${salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt, expected = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iters)).hex()
        return hmac.compare_digest(digest, expected)
    except Exception:
        return False


def normalize_email(email: str) -> str:
    return email.strip().lower()


def rowdict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row else None


def init_db() -> None:
    with connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin','student')),
                cpf TEXT,
                registration TEXT,
                birth_date TEXT,
                phone TEXT,
                goal TEXT DEFAULT 'saude',
                availability_days TEXT DEFAULT 'seg,qua,sex',
                weekly_minutes INTEGER DEFAULT 180,
                notes TEXT DEFAULT '',
                qr_secret TEXT NOT NULL UNIQUE,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS evaluations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                evaluation_type TEXT NOT NULL DEFAULT 'completa',
                created_at TEXT NOT NULL,
                weight REAL,
                height_cm REAL,
                body_fat REAL,
                body_water REAL,
                muscle_mass REAL,
                bmr REAL,
                metabolic_age REAL,
                bone_mass REAL,
                visceral_fat REAL,
                waist_cm REAL,
                hip_cm REAL,
                flexibility_cm REAL,
                abdominal_reps INTEGER,
                pushup_reps INTEGER,
                resting_hr INTEGER,
                post_hr INTEGER,
                recovery_hr_5min INTEGER,
                cooper_km REAL,
                vo2max REAL,
                systolic INTEGER,
                diastolic INTEGER,
                qualia_score REAL NOT NULL,
                risk_level TEXT NOT NULL,
                recommendations TEXT NOT NULL,
                notes TEXT DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS attendance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                check_in TEXT NOT NULL,
                check_out TEXT,
                minutes INTEGER DEFAULT 0,
                registered_by INTEGER REFERENCES users(id),
                source TEXT DEFAULT 'qr'
            );
            CREATE TABLE IF NOT EXISTS equipment (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'ok',
                quantity INTEGER NOT NULL DEFAULT 1,
                location TEXT DEFAULT '',
                photo_data_url TEXT DEFAULT '',
                maintenance_notes TEXT DEFAULT '',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS workout_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                month TEXT NOT NULL,
                week INTEGER NOT NULL,
                plan_text TEXT NOT NULL,
                created_by INTEGER REFERENCES users(id),
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                recipient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                subject TEXT NOT NULL,
                body TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )
        eval_cols = db.execute("PRAGMA table_info(evaluations)").fetchall()
        eval_info = {row["name"]: row for row in eval_cols}
        weight_col = eval_info.get("weight")
        height_col = eval_info.get("height_cm")
        needs_eval_rebuild = (
            "evaluation_type" not in eval_info
            or bool(weight_col["notnull"] if weight_col else False)
            or bool(height_col["notnull"] if height_col else False)
        )
        if needs_eval_rebuild:
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS evaluations_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    evaluation_type TEXT NOT NULL DEFAULT 'completa',
                    created_at TEXT NOT NULL,
                    weight REAL,
                    height_cm REAL,
                    body_fat REAL,
                    body_water REAL,
                    muscle_mass REAL,
                    bmr REAL,
                    metabolic_age REAL,
                    bone_mass REAL,
                    visceral_fat REAL,
                    waist_cm REAL,
                    hip_cm REAL,
                    flexibility_cm REAL,
                    abdominal_reps INTEGER,
                    pushup_reps INTEGER,
                    resting_hr INTEGER,
                    post_hr INTEGER,
                    recovery_hr_5min INTEGER,
                    cooper_km REAL,
                    vo2max REAL,
                    systolic INTEGER,
                    diastolic INTEGER,
                    qualia_score REAL NOT NULL,
                    risk_level TEXT NOT NULL,
                    recommendations TEXT NOT NULL,
                    notes TEXT DEFAULT ''
                );
                INSERT INTO evaluations_new
                (id,user_id,evaluation_type,created_at,weight,height_cm,body_fat,body_water,muscle_mass,bmr,metabolic_age,bone_mass,visceral_fat,
                 waist_cm,hip_cm,flexibility_cm,abdominal_reps,pushup_reps,resting_hr,post_hr,recovery_hr_5min,cooper_km,
                 vo2max,systolic,diastolic,qualia_score,risk_level,recommendations,notes)
                SELECT id,user_id,'completa',created_at,weight,height_cm,body_fat,body_water,muscle_mass,bmr,metabolic_age,bone_mass,visceral_fat,
                 waist_cm,hip_cm,flexibility_cm,abdominal_reps,pushup_reps,resting_hr,post_hr,recovery_hr_5min,cooper_km,
                 vo2max,systolic,diastolic,qualia_score,risk_level,recommendations,notes
                FROM evaluations;
                DROP TABLE evaluations;
                ALTER TABLE evaluations_new RENAME TO evaluations;
                """
            )
        for sql in [
            "ALTER TABLE equipment ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1",
            "ALTER TABLE equipment ADD COLUMN photo_data_url TEXT DEFAULT ''",
        ]:
            try:
                db.execute(sql)
            except sqlite3.OperationalError:
                pass
        admin_email = normalize_email(os.getenv("CAFIS_ADMIN_EMAIL", "admin@cafis.utfpr.edu.br"))
        if not db.execute("SELECT id FROM users WHERE email = ?", (admin_email,)).fetchone():
            admin_password = os.getenv("CAFIS_ADMIN_PASSWORD", "Admin@12345")
            db.execute(
                """
                INSERT INTO users
                (name, email, password_hash, role, qr_secret, created_at, notes)
                VALUES (?, ?, ?, 'admin', ?, ?, ?)
                """,
                (
                    "Admin CAFIS",
                    admin_email,
                    hash_password(admin_password),
                    secrets.token_urlsafe(32),
                    now_iso(),
                    "Troque a senha antes de publicar.",
                ),
            )
        for name, category in [
            ("Esteira", "cardio"),
            ("Bicicleta ergometrica", "cardio"),
            ("Leg press", "forca"),
            ("Puxador alto", "forca"),
            ("Supino", "forca"),
            ("Halteres", "peso livre"),
        ]:
            if not db.execute("SELECT id FROM equipment WHERE name = ?", (name,)).fetchone():
                db.execute(
                    "INSERT INTO equipment (name, category, status, created_at) VALUES (?, ?, 'ok', ?)",
                    (name, category, now_iso()),
                )


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


class LoginIn(BaseModel):
    email: str
    password: str = Field(min_length=4, max_length=128)


class StudentIn(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    email: str
    cpf: str = ""
    registration: str = ""
    birth_date: str = ""
    phone: str = ""
    goal: str = "saude"
    availability_days: str = "seg,qua,sex"
    weekly_minutes: int = Field(default=180, ge=30, le=900)
    notes: str = ""
    password: str | None = Field(default=None, min_length=6, max_length=128)


class PublicRegisterIn(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    email: str
    cpf: str = Field(min_length=11, max_length=20)
    registration: str = Field(min_length=3, max_length=40)
    birth_date: str = ""
    phone: str = ""
    goal: str = "saude"
    availability_days: str = "seg,qua,sex"
    weekly_minutes: int = Field(default=180, ge=30, le=900)
    password: str = Field(min_length=8, max_length=128)


class EvaluationIn(BaseModel):
    user_id: int | None = None
    evaluation_type: str = "bio"
    weight: float | None = Field(default=None, gt=20, le=300)
    height_cm: float | None = Field(default=None, gt=100, le=240)
    body_fat: float | None = Field(default=None, ge=0, le=80)
    body_water: float | None = Field(default=None, ge=0, le=100)
    muscle_mass: float | None = Field(default=None, ge=0, le=100)
    bmr: float | None = Field(default=None, ge=0, le=6000)
    metabolic_age: float | None = Field(default=None, ge=0, le=120)
    bone_mass: float | None = Field(default=None, ge=0, le=20)
    visceral_fat: float | None = Field(default=None, ge=0, le=40)
    waist_cm: float | None = Field(default=None, ge=30, le=220)
    hip_cm: float | None = Field(default=None, ge=30, le=220)
    flexibility_cm: float | None = Field(default=None, ge=0, le=100)
    abdominal_reps: int | None = Field(default=None, ge=0, le=300)
    pushup_reps: int | None = Field(default=None, ge=0, le=300)
    resting_hr: int | None = Field(default=None, ge=30, le=220)
    post_hr: int | None = Field(default=None, ge=30, le=240)
    recovery_hr_5min: int | None = Field(default=None, ge=30, le=240)
    cooper_km: float | None = Field(default=None, ge=0, le=10)
    vo2max: float | None = Field(default=None, ge=0, le=100)
    systolic: int | None = Field(default=None, ge=60, le=260)
    diastolic: int | None = Field(default=None, ge=30, le=180)
    notes: str = ""


class AttendanceScanIn(BaseModel):
    qr_payload: str


class AttendanceManualIn(BaseModel):
    user_id: int


class EquipmentIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    category: str = Field(min_length=2, max_length=80)
    status: str = "ok"
    quantity: int = Field(default=1, ge=0, le=999)
    location: str = ""
    photo_data_url: str = Field(default="", max_length=2_000_000)
    maintenance_notes: str = ""


class MessageIn(BaseModel):
    subject: str = Field(min_length=3, max_length=180)
    body: str = Field(min_length=3, max_length=5000)
    recipient_id: int | None = None
    send_to_all: bool = False


def current_user(session: str | None = Cookie(default=None, alias=COOKIE_NAME)) -> dict[str, Any]:
    if not session:
        raise HTTPException(401, "Login necessario.")
    token_hash = hashlib.sha256(session.encode()).hexdigest()
    with connect() as db:
        rec = db.execute(
            """
            SELECT u.* FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ? AND s.expires_at > strftime('%s','now') AND u.active = 1
            """,
            (token_hash,),
        ).fetchone()
    if not rec:
        raise HTTPException(401, "Sessao invalida ou expirada.")
    return dict(rec)


def require_admin(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    if user["role"] != "admin":
        raise HTTPException(403, "Acesso restrito aos estagiários/admin.")
    return user


def public_user(user: dict[str, Any]) -> dict[str, Any]:
    return {k: user[k] for k in user.keys() if k not in {"password_hash", "qr_secret"}}


def get_student_or_404(db: sqlite3.Connection, user_id: int) -> sqlite3.Row:
    row = db.execute("SELECT * FROM users WHERE id = ? AND role = 'student' AND active = 1", (user_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Aluno não encontrado.")
    return row


def toggle_attendance(db: sqlite3.Connection, student_id: int, admin_id: int, source: str) -> tuple[str, dict[str, Any]]:
    open_row = db.execute(
        "SELECT * FROM attendance WHERE user_id=? AND check_out IS NULL ORDER BY check_in DESC LIMIT 1",
        (student_id,),
    ).fetchone()
    stamp = now_iso()
    if open_row:
        start = datetime.fromisoformat(open_row["check_in"])
        end = datetime.fromisoformat(stamp)
        minutes = max(0, int((end - start).total_seconds() // 60))
        db.execute(
            "UPDATE attendance SET check_out=?, minutes=?, registered_by=?, source=? WHERE id=?",
            (stamp, minutes, admin_id, source, open_row["id"]),
        )
        return "saída", rowdict(db.execute("SELECT * FROM attendance WHERE id=?", (open_row["id"],)).fetchone())
    cur = db.execute(
        "INSERT INTO attendance (user_id, check_in, registered_by, source) VALUES (?, ?, ?, ?)",
        (student_id, stamp, admin_id, source),
    )
    return "entrada", rowdict(db.execute("SELECT * FROM attendance WHERE id=?", (cur.lastrowid,)).fetchone())


def calculate_result(data: EvaluationIn, goal: str) -> tuple[float, str, str]:
    bmi = None
    score = 100.0
    if data.weight is not None and data.height_cm is not None:
        height_m = data.height_cm / 100
        bmi = data.weight / (height_m * height_m)
        if bmi < 18.5 or bmi >= 30:
            score -= 18
        elif bmi >= 25:
            score -= 9
    if data.body_fat is not None:
        score -= max(0, data.body_fat - 25) * 0.9
    if data.visceral_fat is not None and data.visceral_fat >= 12:
        score -= 10
    if data.vo2max is not None:
        score += min(10, max(-15, (data.vo2max - 35) * 0.8))
    if data.resting_hr is not None and data.resting_hr > 85:
        score -= 8
    if data.systolic and data.diastolic and (data.systolic >= 140 or data.diastolic >= 90):
        score -= 15
    if data.flexibility_cm is not None and data.flexibility_cm < 20:
        score -= 5
    score = round(max(0, min(100, score)), 1)
    risk = "baixo" if score >= 78 else "moderado" if score >= 55 else "alto"
    focus = {
        "emagrecimento": "priorizar cardio progressivo, treino de força multiarticular e controle de intensidade.",
        "hipertrofia": "priorizar musculação com progressão semanal, descanso e técnica.",
        "condicionamento": "priorizar capacidade aeróbica, esteira intervalada leve e resistência muscular.",
        "saude": "combinar esteira, aparelhos de força, mobilidade e consistência semanal.",
    }.get(goal, "combinar esteira, aparelhos de força, mobilidade e consistência semanal.")
    recs = [
        f"IMC estimado: {bmi:.1f}. Objetivo declarado: {goal}." if bmi is not None else f"Avaliação parcial registrada. Objetivo declarado: {goal}.",
        f"Foco do mês: {focus}",
        "Semana 1: adaptação, cargas confortáveis, 2-3 séries de 12-15 repetições.",
        "Semana 2: aumentar levemente volume ou carga mantendo execução segura.",
        "Semana 3: consolidar progressão, incluir intervalos curtos na esteira se liberado.",
        "Semana 4: reduzir fadiga, reavaliar medidas e ajustar o próximo ciclo.",
    ]
    if risk == "alto":
        recs.append("Recomendado acompanhamento próximo do estagiário/profissional antes de intensificar.")
    return score, risk, "\n".join(recs)


@app.post("/api/auth/login")
def login(data: LoginIn, response: Response) -> dict[str, Any]:
    with connect() as db:
        user = db.execute("SELECT * FROM users WHERE email = ? AND active = 1", (normalize_email(data.email),)).fetchone()
        if not user or not verify_password(data.password, user["password_hash"]):
            raise HTTPException(401, "E-mail ou senha inválidos.")
        token = secrets.token_urlsafe(48)
        db.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, strftime('%s','now') + ?, ?)",
            (hashlib.sha256(token.encode()).hexdigest(), user["id"], SESSION_SECONDS, now_iso()),
        )
    response.set_cookie(COOKIE_NAME, token, max_age=SESSION_SECONDS, httponly=True, secure=COOKIE_SECURE, samesite="lax")
    return {"user": public_user(dict(user))}


@app.post("/api/auth/logout")
def logout(response: Response, session: str | None = Cookie(default=None, alias=COOKIE_NAME)) -> dict[str, str]:
    if session:
        with connect() as db:
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (hashlib.sha256(session.encode()).hexdigest(),))
    response.delete_cookie(COOKIE_NAME)
    return {"status": "ok"}


@app.post("/api/auth/register")
def public_register(data: PublicRegisterIn) -> dict[str, str]:
    with connect() as db:
        try:
            db.execute(
                """
                INSERT INTO users
                (name,email,password_hash,role,cpf,registration,birth_date,phone,goal,availability_days,weekly_minutes,notes,qr_secret,active,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    data.name.strip(),
                    normalize_email(data.email),
                    hash_password(data.password),
                    "student",
                    data.cpf,
                    data.registration,
                    data.birth_date,
                    data.phone,
                    data.goal,
                    data.availability_days,
                    data.weekly_minutes,
                    "Cadastro solicitado pelo aluno. Aguardando aprovação.",
                    secrets.token_urlsafe(32),
                    0,
                    now_iso(),
                ),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(409, "E-mail já cadastrado ou aguardando aprovação.")
    return {"status": "pending", "message": "Cadastro solicitado. Aguarde aprovação da equipe CAFIS."}


@app.get("/api/me")
def me(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {"user": public_user(user)}


@app.get("/api/admin/overview")
def overview(_: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    with connect() as db:
        total_students = db.execute("SELECT count(*) c FROM users WHERE role='student' AND active=1").fetchone()["c"]
        open_att = db.execute("SELECT count(*) c FROM attendance WHERE check_out IS NULL").fetchone()["c"]
        minutes = db.execute("SELECT coalesce(sum(minutes),0) c FROM attendance").fetchone()["c"]
        evaluations = db.execute("SELECT count(*) c FROM evaluations").fetchone()["c"]
    return {"students": total_students, "inside_now": open_att, "total_hours": round(minutes / 60, 1), "evaluations": evaluations}


@app.get("/api/students")
def list_students(_: dict[str, Any] = Depends(require_admin)) -> list[dict[str, Any]]:
    with connect() as db:
        rows = db.execute(
            """
            SELECT u.*, (SELECT max(created_at) FROM evaluations e WHERE e.user_id=u.id) last_evaluation,
                   (SELECT coalesce(sum(minutes),0) FROM attendance a WHERE a.user_id=u.id) total_minutes,
                   EXISTS(SELECT 1 FROM attendance a2 WHERE a2.user_id=u.id AND a2.check_out IS NULL) inside_now
            FROM users u WHERE u.role='student' AND u.active=1 ORDER BY u.name
            """
        ).fetchall()
    return [
        public_user(dict(r)) | {
            "last_evaluation": r["last_evaluation"],
            "total_hours": round(r["total_minutes"] / 60, 1),
            "inside_now": bool(r["inside_now"]),
        }
        for r in rows
    ]


@app.get("/api/admin/pending-students")
def pending_students(_: dict[str, Any] = Depends(require_admin)) -> list[dict[str, Any]]:
    with connect() as db:
        rows = db.execute("SELECT * FROM users WHERE role='student' AND active=0 ORDER BY created_at DESC").fetchall()
    return [public_user(dict(r)) for r in rows]


@app.post("/api/admin/pending-students/{student_id}/approve")
def approve_student(student_id: int, _: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    with connect() as db:
        row = db.execute("SELECT * FROM users WHERE id=? AND role='student' AND active=0", (student_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Solicitação não encontrada.")
        db.execute("UPDATE users SET active=1, notes=? WHERE id=?", ("Cadastro aprovado pela equipe CAFIS.", student_id))
        user = rowdict(db.execute("SELECT * FROM users WHERE id=?", (student_id,)).fetchone())
    return {"student": public_user(user)}


@app.delete("/api/admin/pending-students/{student_id}")
def reject_student(student_id: int, _: dict[str, Any] = Depends(require_admin)) -> dict[str, str]:
    with connect() as db:
        row = db.execute("SELECT id FROM users WHERE id=? AND role='student' AND active=0", (student_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Solicitação não encontrada.")
        db.execute("DELETE FROM users WHERE id=?", (student_id,))
    return {"status": "rejected"}


@app.post("/api/students")
def create_student(data: StudentIn, _: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    password = data.password or (data.cpf[-4:] if len(data.cpf) >= 4 else secrets.token_urlsafe(6))
    with connect() as db:
        try:
            cur = db.execute(
                """
                INSERT INTO users
                (name,email,password_hash,role,cpf,registration,birth_date,phone,goal,availability_days,weekly_minutes,notes,qr_secret,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    data.name.strip(),
                    normalize_email(data.email),
                    hash_password(password),
                    "student",
                    data.cpf,
                    data.registration,
                    data.birth_date,
                    data.phone,
                    data.goal,
                    data.availability_days,
                    data.weekly_minutes,
                    data.notes,
                    secrets.token_urlsafe(32),
                    now_iso(),
                ),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(409, "E-mail já cadastrado.")
        user = rowdict(db.execute("SELECT * FROM users WHERE id=?", (cur.lastrowid,)).fetchone())
    return {"student": public_user(user), "initial_password": password}


@app.put("/api/students/{student_id}")
def update_student(student_id: int, data: StudentIn, _: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    with connect() as db:
        get_student_or_404(db, student_id)
        db.execute(
            """
            UPDATE users SET name=?, email=?, cpf=?, registration=?, birth_date=?, phone=?, goal=?,
            availability_days=?, weekly_minutes=?, notes=? WHERE id=?
            """,
            (data.name, normalize_email(data.email), data.cpf, data.registration, data.birth_date, data.phone,
             data.goal, data.availability_days, data.weekly_minutes, data.notes, student_id),
        )
        if data.password:
            db.execute("UPDATE users SET password_hash=? WHERE id=?", (hash_password(data.password), student_id))
        user = rowdict(db.execute("SELECT * FROM users WHERE id=?", (student_id,)).fetchone())
    return {"student": public_user(user)}


@app.get("/api/students/{student_id}")
def student_detail(student_id: int, admin: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    if admin["role"] != "admin" and admin["id"] != student_id:
        raise HTTPException(403, "Sem permissao.")
    with connect() as db:
        student = rowdict(get_student_or_404(db, student_id))
        evals = [dict(r) for r in db.execute("SELECT * FROM evaluations WHERE user_id=? ORDER BY created_at", (student_id,)).fetchall()]
        attendance = [dict(r) for r in db.execute("SELECT * FROM attendance WHERE user_id=? ORDER BY check_in DESC LIMIT 90", (student_id,)).fetchall()]
        plans = [dict(r) for r in db.execute("SELECT * FROM workout_plans WHERE user_id=? ORDER BY created_at DESC LIMIT 8", (student_id,)).fetchall()]
    return {"student": public_user(student), "evaluations": evals, "attendance": attendance, "plans": plans}


@app.get("/api/my/dashboard")
def my_dashboard(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return student_detail(user["id"], user)


@app.post("/api/evaluations")
def create_evaluation(data: EvaluationIn, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    student_id = data.user_id if user["role"] == "admin" else user["id"]
    if not student_id:
        raise HTTPException(400, "Aluno obrigatório.")
    with connect() as db:
        student = get_student_or_404(db, student_id)
        has_metric = any(
            getattr(data, field) is not None
            for field in (
                "weight", "height_cm", "body_fat", "body_water", "muscle_mass", "bmr", "metabolic_age",
                "bone_mass", "visceral_fat", "waist_cm", "hip_cm", "flexibility_cm", "abdominal_reps",
                "pushup_reps", "resting_hr", "post_hr", "recovery_hr_5min", "cooper_km", "vo2max",
                "systolic", "diastolic",
            )
        )
        if not has_metric:
            raise HTTPException(400, "Preencha pelo menos um resultado da avaliação.")
        score, risk, recs = calculate_result(data, student["goal"])
        cur = db.execute(
            """
            INSERT INTO evaluations
            (user_id,evaluation_type,created_at,weight,height_cm,body_fat,body_water,muscle_mass,bmr,metabolic_age,bone_mass,visceral_fat,
             waist_cm,hip_cm,flexibility_cm,abdominal_reps,pushup_reps,resting_hr,post_hr,recovery_hr_5min,cooper_km,
             vo2max,systolic,diastolic,qualia_score,risk_level,recommendations,notes)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (student_id, data.evaluation_type, now_iso(), data.weight, data.height_cm, data.body_fat, data.body_water, data.muscle_mass,
             data.bmr, data.metabolic_age, data.bone_mass, data.visceral_fat, data.waist_cm, data.hip_cm,
             data.flexibility_cm, data.abdominal_reps, data.pushup_reps, data.resting_hr, data.post_hr,
             data.recovery_hr_5min, data.cooper_km, data.vo2max, data.systolic, data.diastolic, score, risk, recs, data.notes),
        )
        record = rowdict(db.execute("SELECT * FROM evaluations WHERE id=?", (cur.lastrowid,)).fetchone())
    return {"evaluation": record}


@app.get("/api/my/qr")
def my_qr(user: dict[str, Any] = Depends(current_user)) -> dict[str, str]:
    payload = f"CAFIS:{user['id']}:{user['qr_secret']}"
    img = qrcode.make(payload)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return {"payload": payload, "png": "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()}


@app.post("/api/attendance/scan")
def scan_attendance(data: AttendanceScanIn, admin: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    parts = data.qr_payload.strip().split(":")
    if len(parts) != 3 or parts[0] != "CAFIS":
        raise HTTPException(400, "QR code inválido.")
    try:
        student_id = int(parts[1])
    except ValueError:
        raise HTTPException(400, "QR code inválido.")
    with connect() as db:
        student = get_student_or_404(db, student_id)
        if not hmac.compare_digest(parts[2], student["qr_secret"]):
            raise HTTPException(403, "QR code não pertence ao aluno.")
        action, rec = toggle_attendance(db, student_id, admin["id"], "qr")
    return {"action": action, "student": public_user(dict(student)), "attendance": rec}


@app.post("/api/attendance/manual")
def manual_attendance(data: AttendanceManualIn, admin: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    with connect() as db:
        student = get_student_or_404(db, data.user_id)
        action, rec = toggle_attendance(db, data.user_id, admin["id"], "manual")
    return {"action": action, "student": public_user(dict(student)), "attendance": rec}


@app.get("/api/equipment")
def list_equipment(_: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    with connect() as db:
        return [dict(r) for r in db.execute("SELECT * FROM equipment ORDER BY category, name").fetchall()]


@app.post("/api/equipment")
def add_equipment(data: EquipmentIn, _: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    with connect() as db:
        cur = db.execute(
            """
            INSERT INTO equipment
            (name,category,status,quantity,location,photo_data_url,maintenance_notes,created_at)
            VALUES (?,?,?,?,?,?,?,?)
            """,
            (
                data.name,
                data.category,
                data.status,
                data.quantity,
                data.location,
                data.photo_data_url,
                data.maintenance_notes,
                now_iso(),
            ),
        )
        return {"equipment": rowdict(db.execute("SELECT * FROM equipment WHERE id=?", (cur.lastrowid,)).fetchone())}


@app.put("/api/equipment/{equipment_id}")
def update_equipment(equipment_id: int, data: EquipmentIn, _: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    with connect() as db:
        row = db.execute("SELECT id FROM equipment WHERE id=?", (equipment_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Equipamento não encontrado.")
        db.execute(
            """
            UPDATE equipment SET name=?, category=?, status=?, quantity=?, location=?,
            photo_data_url=?, maintenance_notes=? WHERE id=?
            """,
            (
                data.name,
                data.category,
                data.status,
                data.quantity,
                data.location,
                data.photo_data_url,
                data.maintenance_notes,
                equipment_id,
            ),
        )
        return {"equipment": rowdict(db.execute("SELECT * FROM equipment WHERE id=?", (equipment_id,)).fetchone())}


@app.post("/api/workout-plans/{student_id}")
def save_plan(student_id: int, body: dict[str, Any], admin: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    text = str(body.get("plan_text", "")).strip()
    if len(text) < 10:
        raise HTTPException(400, "Plano muito curto.")
    with connect() as db:
        get_student_or_404(db, student_id)
        cur = db.execute(
            "INSERT INTO workout_plans (user_id,month,week,plan_text,created_by,created_at) VALUES (?,?,?,?,?,?)",
            (student_id, str(body.get("month") or now_iso()[:7]), int(body.get("week") or 1), text, admin["id"], now_iso()),
        )
        return {"plan": rowdict(db.execute("SELECT * FROM workout_plans WHERE id=?", (cur.lastrowid,)).fetchone())}


def send_mail(to_email: str, subject: str, body: str) -> str:
    host = os.getenv("CAFIS_SMTP_HOST", "")
    if not host:
        return "registrado_sem_smtp"
    msg = EmailMessage()
    msg["From"] = os.getenv("CAFIS_SMTP_FROM", os.getenv("CAFIS_SMTP_USER", "no-reply@cafis.local"))
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(body)
    with smtplib.SMTP(host, int(os.getenv("CAFIS_SMTP_PORT", "587"))) as smtp:
        smtp.starttls()
        user = os.getenv("CAFIS_SMTP_USER", "")
        password = os.getenv("CAFIS_SMTP_PASSWORD", "")
        if user:
            smtp.login(user, password)
        smtp.send_message(msg)
    return "enviado"


@app.post("/api/messages")
def send_message(data: MessageIn, admin: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    with connect() as db:
        targets = []
        if data.send_to_all:
            targets = db.execute("SELECT id,email FROM users WHERE role='student' AND active=1").fetchall()
        elif data.recipient_id:
            targets = [get_student_or_404(db, data.recipient_id)]
        if not targets:
            raise HTTPException(400, "Selecione um aluno ou envio para todos.")
        results = []
        for target in targets:
            status = send_mail(target["email"], data.subject, data.body)
            db.execute(
                "INSERT INTO messages (sender_id,recipient_id,subject,body,status,created_at) VALUES (?,?,?,?,?,?)",
                (admin["id"], target["id"], data.subject, data.body, status, now_iso()),
            )
            results.append({"email": target["email"], "status": status})
    return {"sent": results}


@app.get("/api/certificates/{student_id}", response_class=HTMLResponse)
def certificate(student_id: int, user: dict[str, Any] = Depends(current_user)) -> str:
    if user["role"] != "admin" and user["id"] != student_id:
        raise HTTPException(403, "Sem permissão.")
    with connect() as db:
        student = get_student_or_404(db, student_id)
        minutes = db.execute("SELECT coalesce(sum(minutes),0) m FROM attendance WHERE user_id=?", (student_id,)).fetchone()["m"]
    hours = round(minutes / 60, 1)
    today = datetime.now().strftime("%d/%m/%Y")
    return f"""
    <!doctype html><html lang="pt-BR"><meta charset="utf-8">
    <title>Certificado CAFIS</title>
    <style>
      @page {{ size: A4 landscape; margin: 18mm; }}
      * {{ box-sizing: border-box; }}
      body {{ font-family: Arial, Helvetica, sans-serif; margin: 0; color: #17201a; background: #f5f7f6; }}
      .cert {{ border: 10px solid #0f7b4f; padding: 34px 46px; min-height: calc(100vh - 36mm); background: white; }}
      .header {{ display: flex; align-items: center; justify-content: space-between; gap: 24px; border-bottom: 2px solid #dce6e1; padding-bottom: 18px; }}
      .logo {{ width: 300px; max-width: 38%; height: auto; }}
      .org {{ text-align: right; font-size: 15px; line-height: 1.35; color: #405149; }}
      h1 {{ font-size: 42px; margin: 44px 0 28px; text-align: center; }}
      p {{ font-size: 22px; line-height: 1.65; }}
      .date {{ margin-top: 30px; text-align: right; }}
      .signatures {{ display: flex; justify-content: center; margin-top: 72px; }}
      .sig {{ border-top: 1px solid #333; width: 430px; text-align: center; padding-top: 10px; font-size: 16px; line-height: 1.35; }}
      .sig strong {{ display: block; font-size: 18px; }}
      @media print {{ body {{ background: white; }} .cert {{ min-height: auto; }} }}
    </style>
    <body><main class="cert">
      <header class="header">
        <img class="logo" src="/utfpr-logo.svg" alt="UTFPR">
        <div class="org">
          Universidade Tecnológica Federal do Paraná<br>
          Campus Ponta Grossa<br>
          CAFIS - Academia
        </div>
      </header>
      <h1>Certificado de Horas Complementares</h1>
      <p>Certificamos que <strong>{student['name']}</strong> participou das atividades da Academia CAFIS UTFPR Ponta Grossa, totalizando <strong>{hours} horas</strong> registradas por controle de entrada e saída.</p>
      <p class="date">Ponta Grossa, {today}.</p>
      <section class="signatures">
        <div class="sig">
          <strong>Prof. José Alves Faria Filho</strong>
          Chefe do CAFIS
        </div>
      </section>
    <script>window.print()</script></main></body></html>
    """


app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
