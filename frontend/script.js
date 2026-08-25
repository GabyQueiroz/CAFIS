const state = { user: null, students: [], active: "", renderSeq: 0, selectedStudent: null, studentSearch: "", classFilters: { program_id: "", period_label: "", academic_year: new Date().getFullYear() } };
const $ = (q) => document.querySelector(q);
const api = async (url, options = {}) => {
  const res = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "Erro na requisicao");
  return res.json();
};
const apiUpload = async (url, formData) => {
  const res = await fetch(url, { method: "POST", credentials: "include", cache: "no-store", body: formData });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "Erro no envio");
  return res.json();
};

const fmtDate = (v) => v ? new Date(v).toLocaleString("pt-BR") : "-";
const setTitle = (title) => $("#pageTitle").textContent = title;
const riskPill = (risk) => `<span class="pill ${risk === "alto" ? "bad" : risk === "moderado" ? "warn" : "ok"}">${risk || "-"}</span>`;
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const goalLabel = (goal) => ({
  saude: "Saúde",
  emagrecimento: "Emagrecimento",
  hipertrofia: "Hipertrofia",
  condicionamento: "Condicionamento",
}[goal] || goal || "-");

function nav(items) {
  $("#nav").innerHTML = items.map(i => `<button data-view="${i.id}" class="${state.active === i.id ? "active" : ""}">${i.label}</button>`).join("");
  $("#nav").querySelectorAll("button").forEach(btn => btn.onclick = () => render(btn.dataset.view));
}

const isCurrentRender = (seq) => !seq || seq === state.renderSeq;

function showApp(user) {
  state.user = user;
  $("#login").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#roleLabel").textContent = user.role === "admin" ? "Área dos estagiários" : "Área do aluno";
  $("#userBadge").textContent = user.role === "admin" ? "Equipe CAFIS" : `${user.name} | ${user.email}`;
  render(user.role === "admin" ? "admin" : "student");
}

async function boot() {
  try {
    const data = await api("/api/me");
    showApp(data.user);
  } catch {
    $("#login").classList.remove("hidden");
  }
}

$("#loginForm").onsubmit = async (ev) => {
  ev.preventDefault();
  $("#loginMsg").textContent = "";
  const form = Object.fromEntries(new FormData(ev.target).entries());
  try {
    const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify(form) });
    showApp(data.user);
  } catch (err) {
    $("#loginMsg").textContent = err.message;
  }
};

function registerModal() {
  $("#modalBody").innerHTML = `
    <h2>Solicitar cadastro de aluno</h2>
      <p class="muted">Seu acesso fica aguardando aprovação da equipe CAFIS antes do primeiro login.</p>
    <form id="registerForm" class="form-grid">
      <label>Nome completo<input name="name" required></label>
      <label>Email institucional<input name="email" type="email" required></label>
      <label>CPF<input name="cpf" minlength="11" required></label>
      <label>RA/matricula<input name="registration" required></label>
      <label>Nascimento<input name="birth_date" type="date"></label>
      <label>Telefone<input name="phone"></label>
      <label>Objetivo<select name="goal"><option value="saude">Saúde</option><option value="emagrecimento">Emagrecimento</option><option value="hipertrofia">Hipertrofia</option><option value="condicionamento">Condicionamento</option></select></label>
      <label>Dias que pretende treinar<input name="availability_days" value="seg,qua,sex"></label>
      <label>Minutos por semana<input name="weekly_minutes" type="number" value="180" min="30" max="900"></label>
      <label class="wide">Senha<input name="password" type="password" minlength="8" required></label>
      <button class="primary wide">Enviar solicitação</button>
      <p id="registerMsg" class="message wide"></p>
    </form>`;
  $("#registerForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(ev.target).entries());
    data.weekly_minutes = Number(data.weekly_minutes);
    try {
      const res = await api("/api/auth/register", { method: "POST", body: JSON.stringify(data) });
      $("#registerMsg").style.color = "#0d7a53";
      $("#registerMsg").textContent = res.message;
      ev.target.reset();
    } catch (err) {
      $("#registerMsg").style.color = "";
      $("#registerMsg").textContent = err.message;
    }
  };
  $("#modal").showModal();
}
window.registerModal = registerModal;

async function logout() {
  await api("/api/auth/logout", { method: "POST" }).catch(() => {});
  state.user = null;
  $("#app").classList.add("hidden");
  $("#login").classList.remove("hidden");
  location.replace("/");
}
window.logout = logout;
$("#logoutBtn").onclick = logout;

async function render(view) {
  const seq = ++state.renderSeq;
  state.active = view;
  if (state.user.role === "admin") {
    nav([
      { id: "admin", label: "Painel" },
      { id: "classes", label: "Turmas" },
      { id: "students", label: "Alunos" },
      { id: "pending", label: "Solicitações" },
      { id: "attendance", label: "Presença" },
      { id: "equipment", label: "Equipamentos" },
      { id: "messages", label: "E-mails" },
    ]);
  } else {
    nav([
      { id: "student", label: "Meu painel" },
      { id: "myqr", label: "Meu QR" },
      { id: "myevolution", label: "Evolução" },
      { id: "myeval", label: "Nova avaliação" },
    ]);
  }
  const routes = { admin: adminHome, classes: classesView, students, pending, attendance, equipment, messages, student: studentHome, myqr, myevolution, myeval };
  const route = routes[view] || routes[state.user.role === "admin" ? "admin" : "student"];
  $("#view").innerHTML = `<section class="card"><p class="muted">Carregando...</p></section>`;
  try {
    await route(seq);
  } catch (err) {
    if (!isCurrentRender(seq)) return;
    $("#view").innerHTML = `<section class="card"><h2>Não foi possível carregar esta tela</h2><p class="message">${esc(err.message || err)}</p></section>`;
    if (err.message === "Sessao invalida ou expirada." || err.message === "Login necessario.") {
      setTimeout(() => logout(), 1200);
    }
  }
}
window.render = render;

async function adminHome(seq) {
  setTitle("Painel dos projetos");
  const [o, pendingRows, programs, classes] = await Promise.all([
    api("/api/admin/overview"),
    api("/api/admin/pending-students"),
    api("/api/programs"),
    api("/api/classes"),
  ]);
  if (!isCurrentRender(seq)) return;
  $("#view").innerHTML = `
    <section class="grid three">
      <div class="card metric"><span class="muted">Alunos ativos</span><strong>${o.students}</strong></div>
      <div class="card metric"><span class="muted">Na academia agora</span><strong>${o.inside_now}</strong></div>
      <div class="card metric"><span class="muted">Horas registradas</span><strong>${o.total_hours}</strong></div>
    </section>
    <section class="grid two" style="margin-top:16px">
      ${programs.map(program => {
        const totalClasses = classes.filter(c => c.program_id === program.id).length;
        return `<div class="card">
          <p class="eyebrow">Projeto</p>
          <h2>${esc(program.name)}</h2>
          <p class="muted">${esc(program.description || "")}</p>
          <p><strong>${totalClasses}</strong> turma(s) cadastrada(s)</p>
          <button class="primary" onclick="render('classes')">Gerenciar turmas</button>
        </div>`;
      }).join("")}
    </section>
    <section class="grid two" style="margin-top:16px">
      <div class="card">
        <h2>Operação de hoje</h2>
        <p class="muted">Para academia, lance entrada e saída. Para natação e turmas, use a aba Turmas e abra a chamada da data.</p>
        <div class="row"><button class="primary" onclick="render('classes')">Abrir turmas</button><button class="secondary" onclick="render('attendance')">Presença da academia</button></div>
      </div>
      <div class="card">
        <h2>Solicitações de cadastro</h2>
        <p class="muted">${pendingRows.length ? `${pendingRows.length} aluno(s) aguardando aprovação.` : "Nenhuma solicitação pendente."}</p>
        <button class="secondary" onclick="render('pending')">Revisar solicitações</button>
      </div>
    </section>`;
}

async function classesView(seq) {
  setTitle("Turmas e projetos");
  const query = new URLSearchParams();
  if (state.classFilters.program_id) query.set("program_id", state.classFilters.program_id);
  if (state.classFilters.period_label) query.set("period_label", state.classFilters.period_label);
  if (state.classFilters.academic_year) query.set("academic_year", state.classFilters.academic_year);
  const [programs, classes] = await Promise.all([
    api("/api/programs"),
    api(`/api/classes${query.toString() ? `?${query.toString()}` : ""}`),
  ]);
  if (!isCurrentRender(seq)) return;
  $("#view").innerHTML = `
    <section class="grid two">
      <div class="card">
        <h2>Nova turma</h2>
        <form id="classForm" class="stack">
          <label>Projeto<select name="program_id">${programs.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label>
          <label>Nome da turma<input name="name" placeholder="Ex.: Natação 18h - Ter/Qui" required></label>
          <label>Horário<input name="schedule" placeholder="Ex.: terças e quintas, 18h"></label>
          <label>Professor(a)<input name="teacher" placeholder="Nome da professora/professor"></label>
          <label>Minutos por aula<input name="default_minutes" type="number" value="60" min="1" max="600"></label>
          <label>Local<input name="location" placeholder="Piscina, academia, quadra..."></label>
          <label>Observações<textarea name="notes"></textarea></label>
          <button class="primary">Criar turma</button>
        </form>
      </div>
      <div class="card">
        <h2>Importar planilha anual</h2>
        <p class="muted">Escolha Academia ou Natação, envie a planilha com as abas de segunda a sexta e o sistema cria automaticamente as turmas, os alunos e o calendário do ano letivo.</p>
        <form id="scheduleImportForm" class="stack">
          <label>Projeto<select name="program_id">${programs.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label>
          <label>Início das atividades<input name="activity_start" type="date" value="2026-01-01" required></label>
          <label>Fim das atividades<input name="activity_end" type="date" value="2026-12-31"></label>
          <label>Período letivo<input name="period_label" placeholder="Ex.: 2026/1 ou 2026 anual" value="${esc(state.classFilters.period_label || "2026 anual")}"></label>
          <label>Ano letivo<input name="academic_year" type="number" value="${esc(state.classFilters.academic_year || 2026)}" min="2020" max="2100"></label>
          <label>Professor(a) responsável<input name="teacher" placeholder="Opcional"></label>
          <label>Local<input name="location" placeholder="Piscina, academia..."></label>
          <input name="file" type="file" accept=".xlsx" required>
          <button class="primary">Importar planilha</button>
        </form>
        <div id="scheduleImportResult"></div>
      </div>
    </section>
    <section class="card" style="margin-top:16px">
      <h2>Filtros e relatórios</h2>
      <form id="classFilterForm" class="row" style="flex-wrap:wrap">
        <select name="program_id"><option value="">Todos os projetos</option>${programs.map(p => `<option value="${p.id}" ${String(state.classFilters.program_id) === String(p.id) ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
        <input name="period_label" placeholder="Período letivo" value="${esc(state.classFilters.period_label || "")}">
        <input name="academic_year" type="number" placeholder="Ano" value="${esc(state.classFilters.academic_year || "")}">
        <button class="secondary" type="submit">Aplicar</button>
        <button class="ghost" id="downloadReportBtn" type="button">Ver relatório total</button>
      </form>
    </section>
    <section class="card" style="margin-top:16px">
      <h2>Turmas cadastradas</h2>
      <div class="student-list">
        ${classes.length ? classes.map(c => `
          <article class="student-row">
            <div><strong>${esc(c.name)}</strong><span class="muted">${esc(c.program_name)} | ${esc(c.schedule || "Sem horário")} | ${esc(c.teacher || "Sem professor(a)")}${c.period_label ? ` | ${esc(c.period_label)}` : ""}</span></div>
            <span class="pill ok">${c.student_count} aluno(s) | ${c.session_count || 0} aulas</span>
            <button class="secondary open-class-btn" data-id="${c.id}" type="button">Abrir</button>
          </article>`).join("") : "<p class='muted'>Nenhuma turma cadastrada.</p>"}
      </div>
    </section>`;
  $("#classForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(ev.target).entries());
    data.program_id = Number(data.program_id);
    data.default_minutes = Number(data.default_minutes);
    await api("/api/classes", { method: "POST", body: JSON.stringify(data) });
    classesView();
  };
  $("#scheduleImportForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const resultBox = $("#scheduleImportResult");
    const submitButton = ev.target.querySelector("button[type='submit'], button:not([type])");
    const formData = new FormData(ev.target);
    const programId = formData.get("program_id");
    resultBox.innerHTML = `<div class="notice">Importando planilha...</div>`;
    if (submitButton) submitButton.disabled = true;
    try {
      const result = await apiUpload(`/api/programs/${programId}/schedule-import`, formData);
      resultBox.innerHTML = `<div class="notice">Importação concluída: ${result.classes_created} turma(s), ${result.students_created} aluno(s) novo(s), ${result.enrollments_created} matrícula(s) e ${result.sessions_created} aula(s) gerada(s).</div>`;
      state.classFilters.program_id = String(programId || "");
      state.classFilters.period_label = String(formData.get("period_label") || "");
      state.classFilters.academic_year = Number(formData.get("academic_year") || 2026);
      setTimeout(() => classesView(), 900);
    } catch (err) {
      resultBox.innerHTML = `<div class="notice error">Não foi possível importar: ${esc(err.message)}</div>`;
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  };
  $("#classFilterForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(ev.target).entries());
    state.classFilters.program_id = data.program_id || "";
    state.classFilters.period_label = data.period_label || "";
    state.classFilters.academic_year = Number(data.academic_year || 0) || "";
    classesView();
  };
  $("#downloadReportBtn").onclick = async () => {
    const params = new URLSearchParams();
    if (state.classFilters.program_id) params.set("program_id", state.classFilters.program_id);
    if (state.classFilters.period_label) params.set("period_label", state.classFilters.period_label);
    if (state.classFilters.academic_year) params.set("academic_year", state.classFilters.academic_year);
    const report = await api(`/api/reports/classes${params.toString() ? `?${params.toString()}` : ""}`);
    $("#modalBody").innerHTML = `<h2>Relatório total</h2>${fullReportTable(report.classes)}`;
    $("#modal").showModal();
  };
  document.querySelectorAll(".open-class-btn").forEach(btn => btn.onclick = () => openClass(Number(btn.dataset.id)));
}

async function openClass(classId) {
  const seq = ++state.renderSeq;
  $("#view").innerHTML = `<section class="card"><p class="muted">Carregando turma...</p></section>`;
  const data = await api(`/api/classes/${classId}/roster`);
  if (!isCurrentRender(seq)) return;
  setTitle(data.class.name);
  $("#view").innerHTML = `
    <section class="grid two">
      <div class="card">
        <h2>Turma</h2>
        <p><strong>${esc(data.class.program_name)}</strong></p>
        <p class="muted">Horário: ${esc(data.class.schedule || "-")}<br>Professor(a): ${esc(data.class.teacher || "-")}<br>Minutos/aula: ${esc(data.class.default_minutes)}<br>Período: ${esc(data.class.period_label || "-")}<br>Vigência: ${esc(data.class.activity_start || "-")} até ${esc(data.class.activity_end || "-")}</p>
        <div class="row"><button class="secondary" onclick="classesView()">Voltar</button></div>
      </div>
      <div class="card">
        <h2>Nova aula/chamada</h2>
        <form id="sessionForm" class="stack">
          <label>Data<input name="session_date" type="date" value="${new Date().toISOString().slice(0,10)}" required></label>
          <label>Observações<textarea name="notes"></textarea></label>
          <button class="primary">Criar chamada</button>
        </form>
      </div>
    </section>
    <section class="card attendance-sheet-card" style="margin-top:16px">
      <div class="row" style="justify-content:space-between;margin-bottom:12px">
        <div>
          <h2>Planilha de chamada</h2>
          <p class="muted">Clique nas células para alternar: vazio/falta, presente e justificada. As datas já vêm das aulas geradas.</p>
        </div>
        <button id="saveAttendanceGridBtn" class="primary" type="button" disabled>Salvar alterações</button>
      </div>
      <div id="attendanceGrid">Carregando chamada...</div>
      <div id="attendanceGridMsg"></div>
    </section>
    <section class="grid two" style="margin-top:16px">
      <div class="card">
        <h2>Cadastrar aluno individual</h2>
        <form id="classStudentForm" class="stack">
          <input name="name" placeholder="Nome completo" required>
          <input name="email" type="email" placeholder="E-mail" required>
          <input name="cpf" placeholder="CPF">
          <input name="registration" placeholder="RA/matrícula">
          <input name="phone" placeholder="Telefone">
          <input name="password" placeholder="Senha inicial opcional">
          <button class="primary">Cadastrar na turma</button>
        </form>
      </div>
      <div class="card">
        <h2>Legenda</h2>
        <p class="muted">Use a planilha acima para lançar várias datas sem abrir chamada por chamada.</p>
        <div class="legend-row"><span class="att-cell present">P</span> Presente</div>
        <div class="legend-row"><span class="att-cell absent">F</span> Falta</div>
        <div class="legend-row"><span class="att-cell justified">J</span> Justificada</div>
      </div>
    </section>
    <section class="grid two" style="margin-top:16px">
      <div class="card">
        <h2>Importar planilha simples</h2>
        <p class="muted">Aceita CSV ou XLSX com colunas: nome, email, cpf, matricula, telefone, nascimento, senha.</p>
        <form id="importForm" class="stack">
          <input name="file" type="file" accept=".csv,.xlsx" required>
          <button class="primary">Importar alunos</button>
        </form>
        <div id="importResult"></div>
      </div>
      <div class="card">
        <h2>Resumo da turma</h2>
        ${classSummaryTable(data.report)}
      </div>
    </section>
    <section class="card" style="margin-top:16px">
      <h2>Alunos da turma</h2>
      ${classRosterTable(data.students, classId)}
    </section>
    <section class="card" style="margin-top:16px">
      <h2>Chamadas recentes</h2>
      <div class="student-list">
      ${data.sessions.length ? data.sessions.map(s => `
        <article class="student-row">
          <div><strong>${fmtDate(s.session_date)}</strong><span class="muted">${esc(s.notes || "")}</span></div>
          <span class="pill">Aula</span>
          <button class="secondary open-session-btn" data-id="${s.id}" type="button">Abrir chamada</button>
        </article>`).join("") : "<p class='muted'>Nenhuma chamada criada.</p>"}
      </div>
    </section>`;
  $("#sessionForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const body = Object.fromEntries(new FormData(ev.target).entries());
    const res = await api(`/api/classes/${classId}/sessions`, { method: "POST", body: JSON.stringify(body) });
    openSession(res.session.id);
  };
  $("#classStudentForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const body = Object.fromEntries(new FormData(ev.target).entries());
    body.weekly_minutes = 180;
    if (!body.password) delete body.password;
    await api(`/api/classes/${classId}/students`, { method: "POST", body: JSON.stringify(body) });
    openClass(classId);
  };
  $("#importForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const res = await apiUpload(`/api/classes/${classId}/import`, new FormData(ev.target));
    $("#importResult").innerHTML = `<div class="notice">Importação concluída: ${res.created} criado(s), ${res.enrolled} matriculado(s), ${res.failures.length} falha(s).</div>`;
    setTimeout(() => openClass(classId), 1200);
  };
  document.querySelectorAll(".open-session-btn").forEach(btn => btn.onclick = () => openSession(Number(btn.dataset.id)));
  loadAttendanceGrid(classId, seq).catch(err => {
    const gridEl = $("#attendanceGrid");
    if (gridEl && isCurrentRender(seq)) gridEl.innerHTML = `<p class="message">Não foi possível carregar a planilha de chamada: ${esc(err.message || err)}</p>`;
  });
}
window.openClass = openClass;
window.classesView = classesView;

function classRosterTable(students, classId) {
  if (!students.length) return "<p class='muted'>Nenhum aluno matriculado.</p>";
  return `<div class="table-wrap"><table><thead><tr><th>Aluno</th><th>RA</th><th>E-mail</th><th>Perfil</th><th>Certificado</th></tr></thead><tbody>
    ${students.map(s => `<tr><td>${esc(s.name)}</td><td>${esc(s.registration || "-")}</td><td>${esc(s.email)}</td><td><button class="secondary" onclick="openStudent(${s.id})">Abrir</button></td><td><button class="ghost" onclick="window.open('/api/certificates/classes/${classId}/students/${s.id}')">Gerar</button></td></tr>`).join("")}
  </tbody></table></div>`;
}

function classSummaryTable(rows) {
  if (!rows?.length) return "<p class='muted'>Ainda não há resumo de presença.</p>";
  return `<div class="table-wrap"><table><thead><tr><th>Aluno</th><th>Presenças</th><th>Faltas</th><th>Just.</th><th>Horas</th></tr></thead><tbody>
    ${rows.map(row => `<tr><td>${esc(row.name)}</td><td>${row.presents || 0}</td><td>${row.absences || 0}</td><td>${row.justified || 0}</td><td>${(((row.minutes || 0) / 60)).toFixed(1)}</td></tr>`).join("")}
  </tbody></table></div>`;
}

function fullReportTable(classes) {
  if (!classes?.length) return "<p class='muted'>Nenhuma turma encontrada para esse filtro.</p>";
  return classes.map(item => `
    <section class="card" style="margin-top:12px">
      <h3>${esc(item.class.name)}</h3>
      <p class="muted">${esc(item.class.program_name)} | ${esc(item.class.period_label || "-")} | ${item.student_count} aluno(s) | ${(item.minutes_total / 60).toFixed(1)} hora(s)</p>
      ${classSummaryTable(item.summary)}
    </section>
  `).join("");
}

async function loadAttendanceGrid(classId, seq) {
  const grid = await api(`/api/classes/${classId}/attendance-grid`);
  const gridEl = $("#attendanceGrid");
  if (!gridEl || !isCurrentRender(seq)) return;
  const saveBtn = $("#saveAttendanceGridBtn");
  const msg = $("#attendanceGridMsg");
  const changes = new Map();
  const statusCycle = { absent: "present", present: "justified", justified: "absent" };
  const statusLabels = { absent: "F", present: "P", justified: "J" };
  if (!grid.sessions.length) {
    gridEl.innerHTML = "<p class='muted'>Nenhuma aula gerada para esta turma.</p>";
    return;
  }
  if (!grid.students.length) {
    gridEl.innerHTML = "<p class='muted'>Nenhum aluno matriculado nesta turma.</p>";
    return;
  }
  gridEl.innerHTML = `
    <div class="attendance-grid-wrap">
      <table class="attendance-grid-table">
        <thead>
          <tr>
            <th class="student-name-col">Aluno</th>
            ${grid.sessions.map(s => `<th title="${esc(s.session_date)}">${shortDate(s.session_date)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${grid.students.map(student => `
            <tr>
              <th class="student-name-col"><span>${esc(student.name)}</span><small>${esc(student.registration || student.email || "")}</small></th>
              ${grid.sessions.map(session => {
                const key = `${session.id}:${student.id}`;
                const rec = grid.attendance[key] || { status: "absent", minutes: 0, notes: "" };
                return `<td><button type="button" class="att-cell ${rec.status}" data-session-id="${session.id}" data-user-id="${student.id}" data-status="${rec.status}" title="${esc(student.name)} - ${esc(session.session_date)}">${statusLabels[rec.status]}</button></td>`;
              }).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>`;
  gridEl.querySelectorAll(".att-cell").forEach(cell => {
    cell.onclick = () => {
      const next = statusCycle[cell.dataset.status || "absent"];
      cell.dataset.status = next;
      cell.className = `att-cell ${next}`;
      cell.textContent = statusLabels[next];
      changes.set(`${cell.dataset.sessionId}:${cell.dataset.userId}`, {
        session_id: Number(cell.dataset.sessionId),
        user_id: Number(cell.dataset.userId),
        status: next,
        minutes: next === "present" ? Number(grid.class.default_minutes || 60) : 0,
        notes: "",
      });
      saveBtn.disabled = changes.size === 0;
      msg.innerHTML = `<div class="notice">${changes.size} alteração(ões) pendente(s).</div>`;
    };
  });
  saveBtn.onclick = async () => {
    if (!changes.size) return;
    saveBtn.disabled = true;
    msg.innerHTML = `<div class="notice">Salvando chamada...</div>`;
    const res = await api(`/api/classes/${classId}/attendance-grid`, {
      method: "POST",
      body: JSON.stringify({ records: Array.from(changes.values()) }),
    });
    if (!isCurrentRender(seq)) return;
    changes.clear();
    msg.innerHTML = `<div class="notice">Chamada salva: ${res.saved} célula(s) atualizada(s).</div>`;
    setTimeout(() => { if (isCurrentRender(seq)) openClass(classId); }, 800);
  };
}

function shortDate(value) {
  const parts = String(value || "").split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
  return esc(value || "-");
}

async function openSession(sessionId) {
  const seq = ++state.renderSeq;
  $("#view").innerHTML = `<section class="card"><p class="muted">Carregando chamada...</p></section>`;
  const data = await api(`/api/sessions/${sessionId}/attendance`);
  if (!isCurrentRender(seq)) return;
  setTitle(`Chamada - ${data.class.name}`);
  $("#view").innerHTML = `
    <section class="card">
      <div class="row" style="justify-content:space-between">
        <div><h2>${fmtDate(data.session.session_date)}</h2><p class="muted">${esc(data.class.program_name)} | ${esc(data.class.schedule || "")}</p></div>
        <button class="secondary" onclick="openClass(${data.class.id})">Voltar para turma</button>
      </div>
      <form id="attendanceBulkForm" class="stack">
        <div class="student-list">
          ${data.attendance.map(a => attendanceRow(a, data.class.default_minutes)).join("")}
        </div>
        <button class="primary">Salvar chamada</button>
      </form>
    </section>`;
  $("#attendanceBulkForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const records = Array.from(document.querySelectorAll(".class-att-row")).map(row => ({
      user_id: Number(row.dataset.userId),
      status: row.querySelector("select[name='status']").value,
      minutes: Number(row.querySelector("input[name='minutes']").value || 0),
      notes: row.querySelector("input[name='notes']").value,
    }));
    await api(`/api/sessions/${sessionId}/attendance`, { method: "POST", body: JSON.stringify({ records }) });
    alert("Chamada salva.");
    openSession(sessionId);
  };
}
window.openSession = openSession;

function attendanceRow(a, defaultMinutes) {
  return `<article class="student-row class-att-row" data-user-id="${a.user_id}">
    <div><strong>${esc(a.name)}</strong><span class="muted">${esc(a.registration || "-")} | ${esc(a.email)}</span></div>
    <select name="status">
      <option value="present" ${a.status === "present" ? "selected" : ""}>Presente</option>
      <option value="absent" ${a.status === "absent" ? "selected" : ""}>Falta</option>
      <option value="justified" ${a.status === "justified" ? "selected" : ""}>Justificada</option>
    </select>
    <input name="minutes" type="number" min="0" max="600" value="${a.minutes || defaultMinutes}" title="Minutos">
    <input name="notes" value="${esc(a.notes)}" placeholder="Observação">
  </article>`;
}

async function loadStudents() {
  const suffix = state.studentSearch ? `?search=${encodeURIComponent(state.studentSearch)}` : "";
  state.students = await api(`/api/students${suffix}`);
}

async function students(seq) {
  setTitle("Alunos");
  await loadStudents();
  if (!isCurrentRender(seq)) return;
  $("#view").innerHTML = `
    <div class="row" style="margin-bottom:14px"><button id="newStudentBtn" class="primary" type="button">Novo aluno</button><input id="studentSearch" placeholder="Pesquisar aluno por nome, e-mail ou RA" value="${esc(state.studentSearch)}"></div>
    <section class="card table-wrap">
      <table><thead><tr><th>Nome</th><th>Objetivo</th><th>Horas</th><th>Faltas</th><th>Última avaliação</th><th>Ações</th></tr></thead>
      <tbody>${state.students.map(s => `<tr><td><strong>${esc(s.name)}</strong><br><span class="muted">${esc(s.email)}</span></td><td>${esc(goalLabel(s.goal))}</td><td>${esc(s.total_hours)}</td><td>${esc(s.total_absences || 0)}</td><td>${fmtDate(s.last_evaluation)}</td><td class="row"><button class="secondary profile-btn" data-id="${s.id}" type="button">Perfil</button><button class="ghost eval-btn" data-id="${s.id}" type="button">Avaliar</button><button class="ghost cert-btn" data-id="${s.id}" type="button">Certificado</button></td></tr>`).join("")}</tbody></table>
    </section>`;
  $("#newStudentBtn").onclick = () => studentModal();
  $("#studentSearch").oninput = async (ev) => {
    state.studentSearch = ev.target.value;
    students();
  };
  document.querySelectorAll(".profile-btn").forEach(btn => btn.onclick = () => openStudent(Number(btn.dataset.id)));
  document.querySelectorAll(".eval-btn").forEach(btn => btn.onclick = () => evalModal(Number(btn.dataset.id)));
  document.querySelectorAll(".cert-btn").forEach(btn => btn.onclick = () => window.open(`/api/certificates/${btn.dataset.id}`));
}

async function pending(seq) {
  setTitle("Solicitações de cadastro");
  const rows = await api("/api/admin/pending-students");
  if (!isCurrentRender(seq)) return;
  $("#view").innerHTML = `
    <section class="card table-wrap">
      ${rows.length ? `<table><thead><tr><th>Aluno</th><th>Objetivo</th><th>Disponibilidade</th><th>Solicitado em</th><th>Ações</th></tr></thead><tbody>${rows.map(s => `<tr><td><strong>${esc(s.name)}</strong><br><span class="muted">${esc(s.email)} | RA ${esc(s.registration)}</span></td><td>${esc(goalLabel(s.goal))}</td><td>${esc(s.availability_days)}<br><span class="muted">${esc(s.weekly_minutes)} min/semana</span></td><td>${fmtDate(s.created_at)}</td><td class="row"><button class="primary" onclick="approveStudent(${s.id})">Aprovar</button><button class="danger" onclick="rejectStudent(${s.id})">Recusar</button></td></tr>`).join("")}</tbody></table>` : "<p class='muted'>Nenhuma solicitação pendente.</p>"}
    </section>`;
}

async function approveStudent(id) {
  await api(`/api/admin/pending-students/${id}/approve`, { method: "POST" });
  await pending();
}
window.approveStudent = approveStudent;

async function rejectStudent(id) {
  if (!confirm("Recusar esta solicitação?")) return;
  await api(`/api/admin/pending-students/${id}`, { method: "DELETE" });
  await pending();
}
window.rejectStudent = rejectStudent;

function studentModal(s = {}) {
  $("#modalBody").innerHTML = `
    <h2>${s.id ? "Editar aluno" : "Novo aluno"}</h2>
    <form id="studentForm" class="form-grid">
      <label>Nome<input name="name" value="${esc(s.name)}" required></label>
      <label>Email<input name="email" type="email" value="${esc(s.email)}" required></label>
      <label>CPF<input name="cpf" value="${esc(s.cpf)}"></label>
      <label>RA/matricula<input name="registration" value="${esc(s.registration)}"></label>
      <label>Nascimento<input name="birth_date" type="date" value="${esc(s.birth_date)}"></label>
      <label>Telefone<input name="phone" value="${esc(s.phone)}"></label>
      <label>Objetivo<select name="goal"><option value="saude">Saúde</option><option value="emagrecimento">Emagrecimento</option><option value="hipertrofia">Hipertrofia</option><option value="condicionamento">Condicionamento</option></select></label>
      <label>Dias de treino<input name="availability_days" value="${esc(s.availability_days || "seg,qua,sex")}"></label>
      <label>Minutos por semana<input name="weekly_minutes" type="number" value="${esc(s.weekly_minutes || 180)}"></label>
      <label class="wide">Observações<textarea name="notes">${esc(s.notes)}</textarea></label>
      <label>Senha inicial/alterar<input name="password" type="password" placeholder="opcional"></label>
      <button class="primary wide">Salvar</button>
    </form>`;
  $("#studentForm").goal.value = s.goal || "saude";
  $("#studentForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(ev.target).entries());
    data.weekly_minutes = Number(data.weekly_minutes);
    if (!data.password) delete data.password;
    const res = await api(s.id ? `/api/students/${s.id}` : "/api/students", { method: s.id ? "PUT" : "POST", body: JSON.stringify(data) });
    $("#modal").close();
    await students();
    if (res.initial_password) alert(`Senha inicial do aluno: ${res.initial_password}`);
  };
  $("#modal").showModal();
}
window.studentModal = studentModal;

async function openStudent(id) {
  const d = await api(`/api/students/${id}`);
  state.selectedStudent = d;
  setTitle(d.student.name);
  const latest = d.evaluations.at(-1);
  $("#view").innerHTML = `
    <section class="grid two">
      <div class="card"><h2>Perfil</h2><p><strong>${esc(d.student.email)}</strong></p><p class="muted">Objetivo: ${esc(goalLabel(d.student.goal))}<br>Dias: ${esc(d.student.availability_days)}<br>Tempo: ${esc(d.student.weekly_minutes)} min/semana</p><button class="secondary" onclick="editSelectedStudent()">Editar</button></div>
      <div class="card"><h2>Última avaliação</h2>${latest ? `<p>Score QualIA: <strong>${esc(latest.qualia_score)}</strong> ${riskPill(latest.risk_level)}</p><p class="preline">${esc(latest.recommendations)}</p>` : "<p class='muted'>Sem avaliação.</p>"}</div>
    </section>
    <section class="grid two" style="margin-top:16px">
      <div class="card"><h2>Evolução</h2>${chart(d.evaluations, "qualia_score", "Score")}</div>
      <div class="card"><h2>Plano do estagiário</h2><form id="planForm" class="stack"><textarea name="plan_text" placeholder="Treino mensal, séries, exercícios, observações..."></textarea><div class="row"><input name="month" type="month" value="${new Date().toISOString().slice(0,7)}"><input name="week" type="number" min="1" max="5" value="1"><button class="primary">Salvar plano</button></div></form></div>
    </section>
    <section class="grid two" style="margin-top:16px">
      <div class="card table-wrap"><h2>Presenças recentes</h2>${attendanceTable(d.attendance)}</div>
      <div class="card table-wrap"><h2>Turmas e faltas</h2>${studentClassSummaryTable(d.class_summary)}</div>
    </section>`;
  $("#planForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(ev.target).entries());
    await api(`/api/workout-plans/${id}`, { method: "POST", body: JSON.stringify(data) });
    alert("Plano salvo.");
    openStudent(id);
  };
}
window.openStudent = openStudent;

function studentClassSummaryTable(rows) {
  if (!rows?.length) return "<p class='muted'>Aluno sem turmas vinculadas.</p>";
  return `<table><thead><tr><th>Turma</th><th>Período</th><th>Pres.</th><th>Faltas</th><th>Horas</th></tr></thead><tbody>
    ${rows.map(row => `<tr><td>${esc(row.class_name)}<br><span class="muted">${esc(row.program_name)}</span></td><td>${esc(row.period_label || row.academic_year || "-")}</td><td>${row.presents || 0}</td><td>${row.absences || 0}</td><td>${(((row.minutes || 0) / 60)).toFixed(1)}</td></tr>`).join("")}
  </tbody></table>`;
}

function editSelectedStudent() {
  if (state.selectedStudent?.student) studentModal(state.selectedStudent.student);
}
window.editSelectedStudent = editSelectedStudent;

function evalModal(userId = null) {
  $("#modalBody").innerHTML = `<h2>Registrar avaliação QualIA</h2>${evaluationForm(userId)}`;
  wireEvaluationForm("#evaluationForm", () => { $("#modal").close(); students(); });
  $("#modal").showModal();
}
window.evalModal = evalModal;

function evaluationForm(userId) {
  return `<form id="evaluationForm" class="form-grid">
    ${userId ? `<input type="hidden" name="user_id" value="${userId}">` : ""}
    <fieldset class="wide chip-fieldset">
      <legend>Tipo de avaliação</legend>
      <label class="chip"><input type="checkbox" name="evaluation_groups" value="bio" checked>Bioimpedância</label>
      <label class="chip"><input type="checkbox" name="evaluation_groups" value="cooper">Cooper</label>
      <label class="chip"><input type="checkbox" name="evaluation_groups" value="forca">Força/flexibilidade</label>
      <label class="chip"><input type="checkbox" name="evaluation_groups" value="pressao">Pressão/frequência cardíaca</label>
      <label class="chip"><input type="checkbox" name="evaluation_groups" value="medidas">Medidas corporais</label>
      <button id="completeEvalBtn" class="secondary" type="button">Selecionar completa</button>
      <input name="evaluation_type" type="hidden" value="bio">
    </fieldset>
    <label class="eval-field eval-bio">Peso kg<input name="weight" type="number" step="0.1"></label>
    <label class="eval-field eval-bio">Altura cm<input name="height_cm" type="number" step="0.1"></label>
    <label class="eval-field eval-bio">Gordura %<input name="body_fat" type="number" step="0.1"></label>
    <label class="eval-field eval-bio">Água %<input name="body_water" type="number" step="0.1"></label>
    <label class="eval-field eval-bio">Massa muscular %<input name="muscle_mass" type="number" step="0.1"></label>
    <label class="eval-field eval-bio">BMR kcal<input name="bmr" type="number" step="1"></label>
    <label class="eval-field eval-bio">Idade metabólica<input name="metabolic_age" type="number" step="1"></label>
    <label class="eval-field eval-bio">Massa óssea kg<input name="bone_mass" type="number" step="0.1"></label>
    <label class="eval-field eval-bio">Gordura visceral<input name="visceral_fat" type="number" step="0.1"></label>
    <label class="eval-field eval-medidas">Cintura cm<input name="waist_cm" type="number" step="0.1"></label>
    <label class="eval-field eval-medidas">Quadril cm<input name="hip_cm" type="number" step="0.1"></label>
    <label class="eval-field eval-forca">Flexibilidade cm<input name="flexibility_cm" type="number" step="0.1"></label>
    <label class="eval-field eval-forca">Abdominais<input name="abdominal_reps" type="number"></label>
    <label class="eval-field eval-forca">Flexões<input name="pushup_reps" type="number"></label>
    <label class="eval-field eval-cardio">FC repouso<input name="resting_hr" type="number"></label>
    <label class="eval-field eval-cardio">FC pós-exercício<input name="post_hr" type="number"></label>
    <label class="eval-field eval-cardio">FC recuperação 5min<input name="recovery_hr_5min" type="number"></label>
    <label class="eval-field eval-cooper">Cooper km<input name="cooper_km" type="number" step="0.01"></label>
    <label class="eval-field eval-cooper">VO2max<input name="vo2max" type="number" step="0.1"></label>
    <label class="eval-field eval-pressao">Pressão sistólica<input name="systolic" type="number"></label>
    <label class="eval-field eval-pressao">Pressão diastólica<input name="diastolic" type="number"></label>
    <label class="wide">Observações<textarea name="notes"></textarea></label>
    <button class="primary wide">Salvar avaliação</button>
  </form>`;
}

function wireEvaluationForm(selector, done) {
  const form = $(selector);
  const typeInputs = Array.from(form.querySelectorAll("input[name='evaluation_groups']"));
  const applyEvaluationType = () => {
    const selected = typeInputs.filter(input => input.checked).map(input => input.value);
    const activeTypes = selected.length ? selected : ["bio"];
    form.evaluation_type.value = activeTypes.includes("bio") && activeTypes.includes("cooper") && activeTypes.includes("forca") && activeTypes.includes("pressao") && activeTypes.includes("medidas")
      ? "completa"
      : activeTypes.join("+");
    const groupMap = {
      bio: ["eval-bio"],
      cooper: ["eval-cooper", "eval-cardio"],
      forca: ["eval-forca"],
      pressao: ["eval-pressao", "eval-cardio"],
      medidas: ["eval-medidas"],
    };
    const visibleGroups = [...new Set(activeTypes.flatMap(type => groupMap[type] || []))];
    form.querySelectorAll(".eval-field").forEach(field => {
      const show = visibleGroups.some(group => field.classList.contains(group));
      field.classList.toggle("hidden", !show);
      field.querySelectorAll("input").forEach(input => {
        if (!show) input.value = "";
      });
    });
    form.querySelectorAll(".chip").forEach(label => {
      label.classList.toggle("active", label.querySelector("input")?.checked);
    });
  };
  typeInputs.forEach(input => input.onchange = applyEvaluationType);
  form.querySelector("#completeEvalBtn").onclick = () => {
    const allSelected = typeInputs.every(input => input.checked);
    typeInputs.forEach(input => input.checked = !allSelected);
    applyEvaluationType();
  };
  applyEvaluationType();
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(ev.target).entries());
    delete data.evaluation_groups;
    Object.keys(data).forEach(k => { if (data[k] === "") data[k] = null; else if (!["notes", "evaluation_type"].includes(k)) data[k] = Number(data[k]); });
    const res = await api("/api/evaluations", { method: "POST", body: JSON.stringify(data) });
    alert(`Avaliação salva. Score: ${res.evaluation.qualia_score}`);
    done?.();
  };
}

async function attendance(seq) {
  setTitle("Presença");
  await loadStudents();
  if (!isCurrentRender(seq)) return;
  const inside = state.students.filter(s => s.inside_now).length;
  $("#view").innerHTML = `
    <section class="grid three">
      <div class="card metric"><span class="muted">Alunos ativos</span><strong>${state.students.length}</strong></div>
      <div class="card metric"><span class="muted">Na academia agora</span><strong>${inside}</strong></div>
      <div class="card metric"><span class="muted">Modos</span><strong>QR + Lista</strong></div>
    </section>
    <section class="grid two" style="margin-top:16px">
      <div class="card">
        <h2>Scanner por QR</h2>
        <video id="scannerVideo" autoplay muted playsinline></video>
        <p id="scanMsg" class="muted">Aponte a câmera para o QR do aluno. O sistema registra entrada ou saída automaticamente.</p>
        <div class="row"><button id="startScanBtn" class="primary" type="button">Iniciar câmera</button><button id="stopScanBtn" class="ghost" type="button">Parar</button></div>
      </div>
      <div class="card">
        <h2>Lançamento manual</h2>
        <p class="muted">Use quando a câmera falhar ou o aluno não estiver com o QR em mãos.</p>
        <input id="attendanceSearch" placeholder="Buscar aluno por nome, e-mail ou RA">
      </div>
    </section>
    <section class="card" style="margin-top:16px">
      <div class="row" style="justify-content:space-between;margin-bottom:12px">
        <div>
          <h2>Alunos</h2>
          <p class="muted">Clique uma vez para registrar entrada. Se o aluno já estiver dentro, o mesmo botão registra a saída.</p>
        </div>
      </div>
      <div id="attendanceList" class="student-list"></div>
      <div id="scanResult"></div>
    </section>`;
  renderAttendanceList(state.students);
  $("#attendanceSearch").oninput = (ev) => {
    const q = ev.target.value.toLowerCase();
    renderAttendanceList(state.students.filter(s =>
      [s.name, s.email, s.registration].some(v => String(v || "").toLowerCase().includes(q))
    ));
  };
  $("#startScanBtn").onclick = startScanner;
  $("#stopScanBtn").onclick = stopScanner;
}

let scannerTimer = null;
let scannerStream = null;
let lastQrPayload = "";
let lastQrAt = 0;
const scannerCanvas = document.createElement("canvas");

async function startScanner() {
  try {
    const video = $("#scannerVideo");
    scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = scannerStream;
    await video.play();
    const detector = "BarcodeDetector" in window ? new BarcodeDetector({ formats: ["qr_code"] }) : null;
    $("#scanMsg").textContent = detector
      ? "Câmera ativa. Aponte para o QR do aluno."
      : "Câmera ativa com leitor alternativo. Aponte para o QR do aluno.";
    clearInterval(scannerTimer);
    scannerTimer = setInterval(async () => {
      let payload = "";
      if (detector) {
        const codes = await detector.detect(video).catch(() => []);
        payload = codes[0]?.rawValue || "";
      } else if (window.jsQR && video.videoWidth && video.videoHeight) {
        scannerCanvas.width = video.videoWidth;
        scannerCanvas.height = video.videoHeight;
        const ctx = scannerCanvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(video, 0, 0, scannerCanvas.width, scannerCanvas.height);
        const image = ctx.getImageData(0, 0, scannerCanvas.width, scannerCanvas.height);
        payload = window.jsQR(image.data, image.width, image.height)?.data || "";
      }
      if (!payload) return;
      const now = Date.now();
      if (payload === lastQrPayload && now - lastQrAt < 5000) return;
      lastQrPayload = payload;
      lastQrAt = now;
      await scanQr(payload);
    }, 1000);
  } catch (err) {
    $("#scanMsg").textContent = "Não foi possível acessar a câmera. Use o lançamento manual.";
  }
}

function stopScanner() {
  clearInterval(scannerTimer);
  scannerStream?.getTracks().forEach(track => track.stop());
  scannerStream = null;
  const video = $("#scannerVideo");
  if (video) video.srcObject = null;
  const msg = $("#scanMsg");
  if (msg) msg.textContent = "Câmera parada.";
}

async function scanQr(payload) {
  const res = await api("/api/attendance/scan", { method: "POST", body: JSON.stringify({ qr_payload: payload }) });
  $("#scanResult").innerHTML = `<div class="notice"><strong>${esc(res.action.toUpperCase())}</strong> registrada por QR para ${esc(res.student.name)}.</div>`;
  await loadStudents();
  renderAttendanceList(state.students);
}

function renderAttendanceList(students) {
  $("#attendanceList").innerHTML = students.length
    ? students.map(s => `
      <article class="student-row">
        <div>
          <strong>${esc(s.name)}</strong>
          <span class="muted">${esc(s.registration || "Sem RA")} | ${esc(s.email)}</span>
        </div>
        <span class="pill ${s.inside_now ? "ok" : ""}">${s.inside_now ? "Presente" : "Fora"}</span>
        <button class="${s.inside_now ? "danger" : "primary"}" onclick="toggleAttendance(${s.id})">
          ${s.inside_now ? "Registrar saída" : "Registrar entrada"}
        </button>
      </article>`).join("")
    : "<p class='muted'>Nenhum aluno encontrado.</p>";
}

async function toggleAttendance(userId) {
  const res = await api("/api/attendance/manual", { method: "POST", body: JSON.stringify({ user_id: userId }) });
  $("#scanResult").innerHTML = `<div class="notice"><strong>${esc(res.action.toUpperCase())}</strong> registrada para ${esc(res.student.name)}.</div>`;
  await loadStudents();
  renderAttendanceList(state.students);
}
window.toggleAttendance = toggleAttendance;

async function equipment(seq) {
  setTitle("Equipamentos");
  const rows = await api("/api/equipment");
  if (!isCurrentRender(seq)) return;
  $("#view").innerHTML = `
    <section class="grid two">
      <div class="equipment-grid">
        ${rows.length ? rows.map(equipmentCard).join("") : "<p class='muted'>Nenhum equipamento cadastrado.</p>"}
      </div>
      <div class="card"><h2>Novo equipamento</h2>${equipmentForm()}</div>
    </section>`;
  wireEquipmentForm();
  document.querySelectorAll(".edit-equipment-btn").forEach(btn => {
    btn.onclick = () => {
      const item = rows.find(e => e.id === Number(btn.dataset.id));
      equipmentModal(item);
    };
  });
}

function equipmentStatusLabel(status) {
  return {
    ok: "Ok",
    atencao: "Atenção",
    manutencao: "Manutenção",
    estragado: "Estragado",
    interditado: "Interditado",
  }[status] || status || "-";
}

function equipmentStatusClass(status) {
  return status === "ok" ? "ok" : ["estragado", "interditado", "manutencao"].includes(status) ? "bad" : "warn";
}

function equipmentCard(e) {
  const photo = e.photo_data_url
    ? `<img class="equipment-photo" src="${esc(e.photo_data_url)}" alt="Foto de ${esc(e.name)}">`
    : `<div class="equipment-photo placeholder">Sem foto</div>`;
  return `<article class="card equipment-card">
    ${photo}
    <div class="row" style="justify-content:space-between">
      <div><h2>${esc(e.name)}</h2><p class="muted">${esc(e.category)} | ${esc(e.location || "Sem local")}</p></div>
      <span class="pill ${equipmentStatusClass(e.status)}">${esc(equipmentStatusLabel(e.status))}</span>
    </div>
    <p><strong>${esc(e.quantity ?? 1)}</strong> unidade(s)</p>
    <p class="muted">${esc(e.maintenance_notes || "Sem observações.")}</p>
    <button class="secondary edit-equipment-btn" type="button" data-id="${e.id}">Editar</button>
  </article>`;
}

function equipmentForm(e = {}) {
  return `<form id="eqForm" class="stack">
    <label>Nome<input name="name" value="${esc(e.name)}" required></label>
    <label>Categoria<input name="category" value="${esc(e.category)}" required></label>
    <label>Status
      <select name="status">
        <option value="ok">Ok</option>
        <option value="atencao">Atenção</option>
        <option value="manutencao">Manutenção</option>
        <option value="estragado">Estragado</option>
        <option value="interditado">Interditado</option>
      </select>
    </label>
    <label>Quantidade<input name="quantity" type="number" min="0" max="999" value="${esc(e.quantity ?? 1)}"></label>
    <label>Local<input name="location" value="${esc(e.location)}"></label>
    <label>Foto<input id="eqPhotoInput" type="file" accept="image/*"></label>
    <input name="photo_data_url" type="hidden" value="${esc(e.photo_data_url)}">
    <div id="eqPhotoPreview">${e.photo_data_url ? `<img class="equipment-photo" src="${esc(e.photo_data_url)}" alt="Foto atual">` : ""}</div>
    <label>Observações<textarea name="maintenance_notes">${esc(e.maintenance_notes)}</textarea></label>
    <button class="primary">Salvar</button>
  </form>`;
}

function wireEquipmentForm(e = null) {
  const form = $("#eqForm");
  if (!form) return;
  form.status.value = e?.status || form.status.value || "ok";
  const fileInput = $("#eqPhotoInput");
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      form.photo_data_url.value = reader.result;
      $("#eqPhotoPreview").innerHTML = `<img class="equipment-photo" src="${reader.result}" alt="Prévia da foto">`;
    };
    reader.readAsDataURL(file);
  };
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(ev.target).entries());
    data.quantity = Number(data.quantity || 0);
    await api(e?.id ? `/api/equipment/${e.id}` : "/api/equipment", {
      method: e?.id ? "PUT" : "POST",
      body: JSON.stringify(data),
    });
    $("#modal").close?.();
    equipment();
  };
}

function equipmentModal(item) {
  $("#modalBody").innerHTML = `<h2>Editar equipamento</h2>${equipmentForm(item)}`;
  wireEquipmentForm(item);
  $("#modal").showModal();
}
window.equipmentModal = equipmentModal;

async function messages(seq) {
  setTitle("E-mails e recados");
  await loadStudents();
  if (!isCurrentRender(seq)) return;
  $("#view").innerHTML = `<section class="card"><form id="msgForm" class="stack">
    <label>Aluno<select name="recipient_id"><option value="">Todos</option>${state.students.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></label>
    <label>Assunto<input name="subject" required></label>
    <label>Mensagem<textarea name="body" required></textarea></label>
    <button class="primary">Enviar/registrar</button>
    <p class="muted">Sem SMTP configurado, o sistema registra o envio no banco para auditoria.</p>
  </form></section>`;
  $("#msgForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(ev.target).entries());
    data.send_to_all = !data.recipient_id;
    data.recipient_id = data.recipient_id ? Number(data.recipient_id) : null;
    const res = await api("/api/messages", { method: "POST", body: JSON.stringify(data) });
    alert(`${res.sent.length} mensagem(ns) processada(s).`);
    ev.target.reset();
  };
}

async function studentHome(seq) {
  setTitle("Meu painel");
  const d = await api("/api/my/dashboard");
  if (!isCurrentRender(seq)) return;
  const latest = d.evaluations.at(-1);
  $("#view").innerHTML = `
    <section class="grid two">
      <div class="card"><h2>Resumo</h2><p><strong>${esc(d.student.name)}</strong></p><p class="muted">Objetivo: ${esc(goalLabel(d.student.goal))}<br>Dias pretendidos: ${esc(d.student.availability_days)}<br>Tempo semanal: ${esc(d.student.weekly_minutes)} minutos</p></div>
      <div class="card"><h2>Recomendação atual</h2>${latest ? `<p>Score: <strong>${esc(latest.qualia_score)}</strong> ${riskPill(latest.risk_level)}</p><p class="preline">${esc(latest.recommendations)}</p>` : "<p class='muted'>Ainda não há avaliação.</p>"}</div>
    </section>
    <section class="grid two" style="margin-top:16px">
      <div class="card"><h2>Evolução</h2>${chart(d.evaluations, "qualia_score", "Score")}</div>
      <div class="card"><h2>Presenças</h2>${attendanceTable(d.attendance)}</div>
    </section>`;
}

async function myqr(seq) {
  setTitle("Meu QR de presença");
  const qr = await api("/api/my/qr");
  if (!isCurrentRender(seq)) return;
  $("#view").innerHTML = `<section class="card"><h2>Apresente este QR ao estagiário</h2><img class="qr-img" src="${qr.png}" alt="QR de presença"><p class="muted">A equipe pode escanear este QR para registrar sua entrada ou saída na academia.</p><textarea readonly>${qr.payload}</textarea></section>`;
}

async function myevolution(seq) {
  setTitle("Minha evolução");
  const d = await api("/api/my/dashboard");
  if (!isCurrentRender(seq)) return;
  $("#view").innerHTML = `<section class="grid two"><div class="card"><h2>Score QualIA</h2>${chart(d.evaluations, "qualia_score", "Score")}</div><div class="card"><h2>Gordura corporal</h2>${chart(d.evaluations, "body_fat", "% gordura")}</div></section><section class="card" style="margin-top:16px"><h2>Bioimpedâncias</h2>${evalTable(d.evaluations)}</section>`;
}

async function myeval(seq) {
  setTitle("Nova avaliação");
  if (!isCurrentRender(seq)) return;
  $("#view").innerHTML = `<section class="card">${evaluationForm(null)}</section>`;
  wireEvaluationForm("#evaluationForm", () => render("student"));
}

function attendanceTable(rows) {
  if (!rows?.length) return "<p class='muted'>Nenhuma presença registrada.</p>";
  return `<div class="table-wrap"><table><thead><tr><th>Entrada</th><th>Saída</th><th>Minutos</th></tr></thead><tbody>${rows.map(a => `<tr><td>${fmtDate(a.check_in)}</td><td>${fmtDate(a.check_out)}</td><td>${a.minutes || 0}</td></tr>`).join("")}</tbody></table></div>`;
}

function evalTable(rows) {
  if (!rows?.length) return "<p class='muted'>Nenhuma avaliação.</p>";
  return `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Peso</th><th>Gordura</th><th>Muscular</th><th>Score</th><th>Risco</th></tr></thead><tbody>${rows.map(e => `<tr><td>${fmtDate(e.created_at)}</td><td>${e.weight}</td><td>${e.body_fat ?? "-"}</td><td>${e.muscle_mass ?? "-"}</td><td>${e.qualia_score}</td><td>${riskPill(e.risk_level)}</td></tr>`).join("")}</tbody></table></div>`;
}

function chart(rows, key, label) {
  const data = (rows || []).filter(r => r[key] !== null && r[key] !== undefined);
  if (!data.length) return "<p class='muted'>Sem dados para grafico.</p>";
  const values = data.map(r => Number(r[key]));
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => {
    const x = 20 + (i * (320 / Math.max(1, values.length - 1)));
    const y = 180 - ((v - min) / span) * 140;
    return `${x},${y}`;
  }).join(" ");
  return `<svg class="chart" viewBox="0 0 380 220" role="img" aria-label="${label}">
    <line x1="20" y1="180" x2="360" y2="180" stroke="#dce5df"/><line x1="20" y1="30" x2="20" y2="180" stroke="#dce5df"/>
    <polyline points="${points}" fill="none" stroke="#0f7b4f" stroke-width="4"/>
    ${values.map((v, i) => {
      const x = 20 + (i * (320 / Math.max(1, values.length - 1)));
      const y = 180 - ((v - min) / span) * 140;
      return `<circle cx="${x}" cy="${y}" r="5" fill="#2157a6"><title>${v}</title></circle>`;
    }).join("")}
    <text x="20" y="208" fill="#607067" font-size="12">${label}</text>
  </svg>`;
}

boot();
