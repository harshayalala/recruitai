/* ============================================================
   RecruitAI — script.js
   All frontend logic: upload, API calls, rendering, modal, export
   ============================================================ */

const API_BASE = "https://recruitai-backend-jdmx.onrender.com";

/* ── State ── */
let uploadedFiles = [];
let candidateResults = [];
let currentModalCandidate = null;

/* ── Section navigation ── */
function showSection(name) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
  const section = document.getElementById("section-" + name);
  if (section) section.classList.add("active");
  const navBtn = document.querySelector("[data-section='" + name + "']");
  if (navBtn) navBtn.classList.add("active");
  if (name === "candidates" || name === "leaderboard") setTimeout(animateBars, 80);
  closeSidebar();
  window.scrollTo(0, 0);
}

/* ── Mobile sidebar ── */
function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("sidebarOverlay").classList.toggle("active");
}
function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarOverlay").classList.remove("active");
}

/* ── Upload zone setup ── */
(function initUpload() {
  const zone = document.getElementById("uploadZone");
  const input = document.getElementById("fileInput");

  zone.addEventListener("click", () => input.click());
  zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("drag-over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    handleFiles([...e.dataTransfer.files]);
  });
  input.addEventListener("change", () => {
    handleFiles([...input.files]);
    input.value = "";
  });
})();

function handleFiles(files) {
  const pdfs = files.filter(f => f.name.toLowerCase().endsWith(".pdf"));
  const combined = [...uploadedFiles, ...pdfs];
  const seen = new Set();
  uploadedFiles = combined.filter(f => {
    if (seen.has(f.name)) return false;
    seen.add(f.name);
    return true;
  }).slice(0, 10);
  renderFileList();
}

function renderFileList() {
  const list = document.getElementById("fileList");
  const bar = document.getElementById("actionBar");
  const count = document.getElementById("fileCount");
  list.innerHTML = "";
  if (uploadedFiles.length === 0) { bar.style.display = "none"; return; }
  bar.style.display = "flex";
  count.textContent = uploadedFiles.length + " file" + (uploadedFiles.length !== 1 ? "s" : "") + " ready";
  uploadedFiles.forEach((file, idx) => {
    const item = document.createElement("div");
    item.className = "file-item";
    item.style.animationDelay = (idx * 0.05) + "s";
    item.innerHTML =
      '<span class="file-icon">📄</span>' +
      '<div class="file-info">' +
        '<div class="file-name">' + escapeHtml(file.name) + '</div>' +
        '<div class="file-size">' + formatBytes(file.size) + '</div>' +
      '</div>' +
      '<button class="file-remove" onclick="removeFile(' + idx + ')" title="Remove">✕</button>';
    list.appendChild(item);
  });
}

function removeFile(idx) {
  uploadedFiles.splice(idx, 1);
  renderFileList();
}

function clearAll() {
  uploadedFiles = [];
  renderFileList();
  resetPipelineSteps();
  document.getElementById("progressSection").style.display = "none";
}

/* ── Pipeline step UI ── */
function resetPipelineSteps() {
  [1,2,3,4].forEach(i => {
    const step = document.getElementById("pstep-" + i);
    const status = document.getElementById("ps" + i + "-status");
    if (step) { step.classList.remove("active","done"); }
    if (status) status.textContent = "Idle";
  });
}

function activatePipelineStep(n) {
  for (let i = 1; i < n; i++) {
    const step = document.getElementById("pstep-" + i);
    const status = document.getElementById("ps" + i + "-status");
    if (step) { step.classList.remove("active"); step.classList.add("done"); }
    if (status) status.textContent = "Done ✓";
  }
  const cur = document.getElementById("pstep-" + n);
  const curStatus = document.getElementById("ps" + n + "-status");
  if (cur) cur.classList.add("active");
  if (curStatus) curStatus.textContent = "Running…";
}

function finishAllPipelineSteps() {
  [1,2,3,4].forEach(i => {
    const step = document.getElementById("pstep-" + i);
    const status = document.getElementById("ps" + i + "-status");
    if (step) { step.classList.remove("active"); step.classList.add("done"); }
    if (status) status.textContent = "Done ✓";
  });
}

/* ── Main analysis ── */
async function startAnalysis() {
  if (uploadedFiles.length === 0) { showError("Please upload at least one PDF resume."); return; }

  // JD REQUIRED CHECK
const jd = document.getElementById("jobDescription").value.trim();

  const btn = document.getElementById("analyzeBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-icon">⬡</span> Analyzing…';

  document.getElementById("progressSection").style.display = "block";
  updateProgress(0, uploadedFiles.length);
  resetPipelineSteps();
  activatePipelineStep(1);
  startAgentStatusAnimation();

  try {
    const formData = new FormData();
    uploadedFiles.forEach(f => formData.append("files", f));
    formData.append("job_description", jd);

    const stepInterval = simulatePipelineProgress();

    const resp = await fetch(API_BASE + "/api/screen-resumes", {
      method: "POST",
      body: formData,
    });

    clearInterval(stepInterval);

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || "Server error");
    }

    const data = await resp.json();
    candidateResults = data.candidates || [];

    finishAllPipelineSteps();
    updateProgress(uploadedFiles.length, uploadedFiles.length);
    updateAgentPills("done");

    renderCandidates();
    renderLeaderboard();

    setTimeout(() => showSection("candidates"), 600);

  } catch (err) {
    showError("Analysis failed: " + err.message);
    resetPipelineSteps();
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">⬡</span> Analyze Resumes';
  }
}

function simulatePipelineProgress() {
  let step = 1;
  const labels = ["resume_analyzer","candidate_scorer","interview_generator","result_finalizer"];
  return setInterval(() => {
    step = Math.min(step + 1, 4);
    activatePipelineStep(step);
    updateAgentPills(labels[step - 1]);
  }, 3500);
}

function updateProgress(done, total) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  document.getElementById("globalProgressBar").style.width = pct + "%";
  document.getElementById("progressCount").textContent = done + " / " + total;
  document.getElementById("progressLabel").textContent =
    done >= total ? "Analysis complete ✓" : "Processing " + total + " candidate" + (total !== 1 ? "s" : "") + "…";
}

function startAgentStatusAnimation() {
  const row = document.getElementById("agentStatusRow");
  const agents = ["Resume Analyzer","Candidate Scorer","Interview Generator","Result Finalizer"];
  row.innerHTML = agents.map(a => '<span class="agent-pill" data-agent="' + a + '">' + a + '</span>').join("");
}

function updateAgentPills(activeKey) {
  const map = { "resume_analyzer":0,"candidate_scorer":1,"interview_generator":2,"result_finalizer":3,"done":-1 };
  const pills = document.querySelectorAll(".agent-pill");
  const activeIdx = map[activeKey] !== undefined ? map[activeKey] : -1;
  pills.forEach((p, i) => {
    p.classList.remove("running","done");
    if (activeKey === "done") p.classList.add("done");
    else if (i < activeIdx) p.classList.add("done");
    else if (i === activeIdx) p.classList.add("running");
  });
}

/* ── Candidate cards ── */
function renderCandidates() {
  const grid = document.getElementById("candidatesGrid");
  const subtitle = document.getElementById("resultsSubtitle");
  const actions = document.getElementById("headerActions");
  grid.innerHTML = "";
  subtitle.textContent = candidateResults.length + " candidate" + (candidateResults.length !== 1 ? "s" : "") + " analyzed";
  actions.style.display = "flex";
  if (candidateResults.length === 0) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">◎</div><p>No results returned.</p></div>';
    return;
  }
  candidateResults.forEach((c, idx) => grid.appendChild(buildCandidateCard(c, idx)));
  requestAnimationFrame(() => setTimeout(animateBars, 80));
}

function buildCandidateCard(c, idx) {
  const card = document.createElement("div");
  card.className = "candidate-card";
  card.style.animationDelay = (idx * 0.07) + "s";
  card.onclick = () => openModal(c);

  const recClass = recToClass(c.hiring_recommendation);
  const tierClass = "tier-" + (c.rank_tier || "C");
  const score = c.score || 0;
  const ringColor = scoreColor(score);
  const skillsHtml = (c.skills || []).slice(0, 5).map(s => '<span class="skill-tag">' + escapeHtml(s) + '</span>').join("");
  const flagHtml = buildFlags(c);

  card.innerHTML =
    '<div class="tier-badge ' + tierClass + '">' + (c.rank_tier || "C") + '</div>' +
    '<div class="card-top">' +
      '<div>' +
        '<div class="candidate-name">' + escapeHtml(c.candidate_name || c.file_name) + '</div>' +
        '<div class="candidate-file">' + escapeHtml(c.file_name || "") + '</div>' +
      '</div>' +
      '<div class="score-ring">' +
        '<svg width="64" height="64" viewBox="0 0 64 64"><circle class="score-ring-bg" cx="32" cy="32" r="26"/>' +
        '<circle class="score-ring-fill" cx="32" cy="32" r="26" stroke="' + ringColor + '" data-score="' + score + '" style="stroke-dashoffset:163"/></svg>' +
        '<div class="score-number" style="color:' + ringColor + '">' + score + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="recommendation-badge ' + recClass + '">' + recIcon(c.hiring_recommendation) + ' ' + (c.hiring_recommendation || "N/A") + '</div>' +
    '<div class="score-bars">' +
      scoreBar("Skills Match", c.skills_match_score || 0, 40, "bar-violet") +
      scoreBar("Experience",   c.experience_score   || 0, 30, "bar-teal") +
      scoreBar("Education",    c.education_score    || 0, 15, "bar-amber") +
      scoreBar("Additional",   c.additional_score   || 0, 15, "bar-rose") +
    '</div>' +
    (skillsHtml ? '<div class="card-skills">' + skillsHtml + ((c.skills||[]).length>5?'<span class="skill-tag">+'+((c.skills||[]).length-5)+'</span>':'') + '</div>' : '') +
    flagHtml;
  return card;
}

function scoreBar(label, val, max, cls) {
  const pct = max > 0 ? Math.round((val / max) * 100) : 0;
  return '<div class="score-bar-row">' +
    '<div class="score-bar-label"><span>' + label + '</span><span>' + val + '/' + max + '</span></div>' +
    '<div class="score-bar-track"><div class="score-bar-fill ' + cls + '" data-width="' + pct + '" style="width:0%"></div></div>' +
    '</div>';
}

function buildFlags(c) {
  const flags = [];
  if (c.keyword_stuffing_detected) flags.push("Keyword Stuffing");
  if ((c.inconsistencies||[]).length > 0) flags.push("Inconsistencies");
  if ((c.suspicious_claims||[]).length > 0) flags.push("Suspicious Claims");
  if (!flags.length) return "";
  return '<div class="flag-row">' + flags.map(f => '<span class="flag">⚠ ' + f + '</span>').join("") + '</div>';
}

function animateBars() {
  document.querySelectorAll(".score-bar-fill[data-width]").forEach(el => { el.style.width = el.dataset.width + "%"; });
  document.querySelectorAll(".score-ring-fill[data-score]").forEach(el => {
    const score = parseInt(el.dataset.score, 10);
    el.style.strokeDashoffset = 163 - (163 * score / 100);
  });
  document.querySelectorAll(".lb-bar-fill[data-width]").forEach(el => { el.style.width = el.dataset.width + "%"; });
}

/* ── Leaderboard ── */
function renderLeaderboard() {
  const container = document.getElementById("leaderboardContent");
  if (!candidateResults.length) return;
  const medals = ["🥇","🥈","🥉"];
  const rows = candidateResults.map((c, i) => {
    const medal = medals[i] || "#" + (i+1);
    const recClass = recToClass(c.hiring_recommendation);
    const tierClass = "tier-" + (c.rank_tier || "C");
    return '<tr>' +
      '<td><span class="rank-medal">' + medal + '</span></td>' +
      '<td><div style="font-weight:600">' + escapeHtml(c.candidate_name||c.file_name) + '</div>' +
           '<div style="font-size:12px;color:var(--text-muted)">' + escapeHtml(c.file_name||"") + '</div></td>' +
      '<td><span class="lb-score" style="color:' + scoreColor(c.score||0) + '">' + (c.score||0) + '</span></td>' +
      '<td><div class="lb-bar-track"><div class="lb-bar-fill" data-width="' + (c.score||0) + '" style="width:0%"></div></div></td>' +
      '<td><span class="recommendation-badge ' + recClass + '" style="font-size:11px;padding:3px 10px">' + (c.hiring_recommendation||"N/A") + '</span></td>' +
      '<td><span class="tier-badge ' + tierClass + '" style="position:static;width:28px;height:28px">' + (c.rank_tier||"C") + '</span></td>' +
      '<td><span style="font-size:13px;color:var(--text-muted)">' + (c.ats_score||0) + '%</span></td>' +
      '<td><button class="btn btn-ghost" style="padding:6px 12px;font-size:12px" onclick="openModal(candidateResults[' + i + '])">View →</button></td>' +
      '</tr>';
  }).join("");

  container.innerHTML =
    '<div class="card" style="padding:0;overflow:hidden;overflow-x:auto">' +
    '<table class="leaderboard-table"><thead><tr>' +
    '<th>Rank</th><th>Candidate</th><th>Score</th><th>Progress</th>' +
    '<th>Recommendation</th><th>Tier</th><th>ATS</th><th>Detail</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  setTimeout(animateBars, 80);
}

/* ── Modal ── */
function openModal(c) {
  currentModalCandidate = c;
  document.getElementById("modalTitle").textContent = c.candidate_name || c.file_name;
  document.getElementById("modalSubtitle").textContent =
    "Score: " + c.score + "/100 · " + (c.hiring_recommendation||"N/A") + " · Tier " + (c.rank_tier||"N/A");
  document.getElementById("modalBody").innerHTML = buildModalContent(c);
  document.getElementById("modalOverlay").classList.add("active");
  document.getElementById("detailModal").classList.add("active");
  setTimeout(animateBars, 120);
}

function closeModal() {
  document.getElementById("modalOverlay").classList.remove("active");
  document.getElementById("detailModal").classList.remove("active");
  currentModalCandidate = null;
}

function buildModalContent(c) {
  const sections = [];

  sections.push(
    '<div><div class="modal-section-title">Score Overview</div>' +
    '<div class="score-grid">' +
    scoreBox(c.score||0,"Overall Score") +
    scoreBox(c.ats_score||0,"ATS Score") +
    scoreBox(c.confidence_score||0,"AI Confidence") +
    scoreBox(c.skills_match_score||0,"Skills Match") +
    scoreBox(c.experience_score||0,"Experience") +
    scoreBox(c.education_score||0,"Education") +
    '</div></div>'
  );

  if (c.summary_report) sections.push(
    '<div><div class="modal-section-title">Executive Summary</div>' +
    '<div class="summary-box">' + escapeHtml(c.summary_report) + '</div></div>'
  );

  if (c.final_recommendation) sections.push(
    '<div><div class="modal-section-title">Final Recommendation</div>' +
    '<div class="summary-box" style="border-color:rgba(45,212,191,0.3)">' + escapeHtml(c.final_recommendation) + '</div></div>'
  );

  const allSkills = [...(c.skills||[]),...(c.tools||[])];
  if (allSkills.length) sections.push(
    '<div><div class="modal-section-title">Skills & Tools</div>' +
    '<div class="skills-wrap">' + allSkills.map(s=>'<span class="skill-chip">'+escapeHtml(s)+'</span>').join("") + '</div></div>'
  );

  if ((c.strengths||[]).length || (c.weaknesses||[]).length) sections.push(
    '<div><div class="modal-section-title">Strengths & Weaknesses</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">' +
    '<div><div style="font-size:12px;color:var(--emerald);font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em">Strengths</div>' +
    '<ul class="modal-list list-strengths">' + (c.strengths||[]).map(s=>'<li>'+escapeHtml(s)+'</li>').join("") + '</ul></div>' +
    '<div><div style="font-size:12px;color:var(--rose);font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em">Weaknesses</div>' +
    '<ul class="modal-list list-weaknesses">' + (c.weaknesses||[]).map(w=>'<li>'+escapeHtml(w)+'</li>').join("") + '</ul></div>' +
    '</div></div>'
  );

  if ((c.experience||[]).length) sections.push(
    '<div><div class="modal-section-title">Experience</div>' +
    c.experience.map(e =>
      '<div style="padding:12px 14px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px">' +
      '<div style="font-weight:600;font-size:14px">' + escapeHtml(e.role||"") + '</div>' +
      '<div style="font-size:13px;color:var(--teal)">' + escapeHtml(e.company||"") + '</div>' +
      '<div style="font-size:12px;color:var(--text-muted);margin-top:3px">' + escapeHtml(e.duration||"") + '</div>' +
      (e.description?'<div style="font-size:13px;color:var(--text-secondary);margin-top:6px">'+escapeHtml(e.description)+'</div>':'') +
      '</div>'
    ).join("") + '</div>'
  );

  if ((c.education||[]).length) sections.push(
    '<div><div class="modal-section-title">Education</div>' +
    c.education.map(e =>
      '<div style="padding:12px 14px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px">' +
      '<div style="font-weight:600;font-size:14px">' + escapeHtml(e.degree||"") + '</div>' +
      '<div style="font-size:13px;color:var(--violet-light)">' + escapeHtml(e.institution||"") + '</div>' +
      '<div style="font-size:12px;color:var(--text-muted)">' + escapeHtml(e.year||"") + (e.gpa?' · GPA: '+e.gpa:'') + '</div></div>'
    ).join("") + '</div>'
  );

  if ((c.projects||[]).length) sections.push(
    '<div><div class="modal-section-title">Projects</div>' +
    c.projects.map(p =>
      '<div style="padding:12px 14px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px">' +
      '<div style="font-weight:600;font-size:14px">' + escapeHtml(p.name||"") + '</div>' +
      (p.description?'<div style="font-size:13px;color:var(--text-secondary);margin-top:4px">'+escapeHtml(p.description)+'</div>':'') +
      ((p.technologies||[]).length?'<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">'+p.technologies.map(t=>'<span class="skill-chip">'+escapeHtml(t)+'</span>').join("")+'</div>':'') +
      '</div>'
    ).join("") + '</div>'
  );

  const flags = [
    ...(c.keyword_stuffing_detected?["Keyword stuffing detected — skills listed without demonstrated usage"]:[]),
    ...(c.inconsistencies||[]),
    ...(c.suspicious_claims||[]),
  ];
  if (flags.length) sections.push(
    '<div><div class="modal-section-title">Red Flags</div>' +
    '<ul class="modal-list list-flags">' + flags.map(f=>'<li>'+escapeHtml(f)+'</li>').join("") + '</ul></div>'
  );

  if ((c.interview_questions||[]).length) sections.push(
    '<div><div class="modal-section-title">Interview Questions</div>' +
    '<ul class="modal-list list-questions">' +
    c.interview_questions.map((q,i) =>
      '<li><div class="q-text">' + (i+1) + '. ' + escapeHtml(q.question||"") + '</div>' +
      '<div class="q-meta"><span class="q-type">' + escapeHtml(q.type||"") + '</span>' +
      (q.rationale?'<span class="q-rationale">'+escapeHtml(q.rationale)+'</span>':'') +
      '</div></li>'
    ).join("") + '</ul></div>'
  );

  if ((c.improvement_suggestions||[]).length) sections.push(
    '<div><div class="modal-section-title">Improvement Suggestions</div>' +
    '<ul class="modal-list list-suggestions">' + c.improvement_suggestions.map(s=>'<li>'+escapeHtml(s)+'</li>').join("") + '</ul></div>'
  );

  return sections.join("");
}

function scoreBox(val, label) {
  return '<div class="score-box"><div class="score-box-value">' + val + '</div><div class="score-box-label">' + label + '</div></div>';
}

/* ── PDF Export ── */
function exportCurrentPDF() {
  const c = currentModalCandidate;
  if (!c) return;
  const win = window.open("","_blank");
  win.document.write(
    '<!DOCTYPE html><html><head><title>RecruitAI — ' + escapeHtml(c.candidate_name||c.file_name) + '</title>' +
    '<style>body{font-family:Arial,sans-serif;padding:40px;color:#111;line-height:1.6}' +
    'h1{font-size:24px;margin-bottom:4px}h2{font-size:15px;color:#7c3aed;border-bottom:1px solid #e5e7eb;padding-bottom:6px;margin-top:24px}' +
    '.meta{color:#6b7280;font-size:13px;margin-bottom:24px}' +
    '.score-grid{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px}' +
    '.score-item{background:#f5f3ff;border-radius:8px;padding:12px 20px;text-align:center}' +
    '.score-value{font-size:28px;font-weight:800;color:#7c3aed}.score-label{font-size:11px;color:#6b7280;text-transform:uppercase}' +
    'ul{padding-left:20px}li{margin-bottom:6px}.tag{display:inline-block;background:#ede9fe;color:#6d28d9;border-radius:4px;padding:2px 8px;font-size:12px;margin:2px}' +
    '.flag{color:#dc2626;font-weight:600}.summary{background:#f0fdf4;border-left:3px solid #10b981;padding:12px 16px;border-radius:4px}' +
    '.q{margin-bottom:12px}.q-num{font-weight:700}.q-type{color:#7c3aed;font-size:12px}' +
    'footer{margin-top:40px;border-top:1px solid #e5e7eb;padding-top:16px;text-align:center;font-size:12px;color:#9ca3af}' +
    '</style></head><body>' +
    '<h1>' + escapeHtml(c.candidate_name||c.file_name) + '</h1>' +
    '<div class="meta">RecruitAI Analysis · ' + new Date().toLocaleDateString() + ' · ' + (c.hiring_recommendation||"") + ' · Tier ' + (c.rank_tier||"N/A") + '</div>' +
    '<div class="score-grid">' +
    '<div class="score-item"><div class="score-value">' + (c.score||0) + '</div><div class="score-label">Overall</div></div>' +
    '<div class="score-item"><div class="score-value">' + (c.ats_score||0) + '</div><div class="score-label">ATS Score</div></div>' +
    '<div class="score-item"><div class="score-value">' + (c.confidence_score||0) + '%</div><div class="score-label">Confidence</div></div>' +
    '</div>' +
    (c.summary_report?'<h2>Executive Summary</h2><div class="summary">'+escapeHtml(c.summary_report)+'</div>':'') +
    (c.final_recommendation?'<h2>Final Recommendation</h2><p>'+escapeHtml(c.final_recommendation)+'</p>':'') +
    ((c.skills||[]).length?'<h2>Skills & Tools</h2><div>'+[...(c.skills||[]),...(c.tools||[])].map(s=>'<span class="tag">'+escapeHtml(s)+'</span>').join("")+'</div>':'') +
    ((c.strengths||[]).length?'<h2>Strengths</h2><ul>'+c.strengths.map(s=>'<li>'+escapeHtml(s)+'</li>').join("")+'</ul>':'') +
    ((c.weaknesses||[]).length?'<h2>Weaknesses</h2><ul>'+c.weaknesses.map(w=>'<li>'+escapeHtml(w)+'</li>').join("")+'</ul>':'') +
    ((c.interview_questions||[]).length?'<h2>Interview Questions</h2>'+c.interview_questions.map((q,i)=>'<div class="q"><div class="q-num">'+(i+1)+'. '+escapeHtml(q.question||"")+'</div><div class="q-type">'+escapeHtml(q.type||"")+'</div></div>').join(""):'') +
    ((c.improvement_suggestions||[]).length?'<h2>Improvement Suggestions</h2><ul>'+c.improvement_suggestions.map(s=>'<li>'+escapeHtml(s)+'</li>').join("")+'</ul>':'') +
    '<footer>© 2025 RecruitAI — Generated ' + new Date().toLocaleString() + '</footer>' +
    '</body></html>'
  );
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 500);
}

/* ── JSON Export ── */
function exportAllJSON() {
  if (!candidateResults.length) return;
  const blob = new Blob([JSON.stringify(candidateResults, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "recruitai-results-" + Date.now() + ".json";
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Error banner ── */
function showError(msg) {
  const existing = document.querySelector(".error-banner");
  if (existing) existing.remove();
  const div = document.createElement("div");
  div.className = "error-banner";
  div.innerHTML = '⚠ ' + escapeHtml(msg) + ' <button onclick="this.parentNode.remove()" style="margin-left:12px;background:none;border:none;color:var(--rose);cursor:pointer;font-size:16px">✕</button>';
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 8000);
}

/* ── Helpers ── */
function recToClass(rec) {
  const map = {"Strong Hire":"rec-strong-hire","Hire":"rec-hire","Maybe":"rec-maybe","No Hire":"rec-no-hire"};
  return map[rec] || "rec-maybe";
}
function recIcon(rec) {
  const map = {"Strong Hire":"★","Hire":"✓","Maybe":"~","No Hire":"✗"};
  return map[rec] || "~";
}
function scoreColor(score) {
  if (score >= 80) return "var(--emerald)";
  if (score >= 60) return "var(--teal)";
  if (score >= 40) return "var(--amber)";
  return "var(--rose)";
}
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + " KB";
  return (bytes/1024/1024).toFixed(1) + " MB";
}
function escapeHtml(str) {
  if (typeof str !== "string") return String(str||"");
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

/* ── Keyboard ── */
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

/* ── Health check ── */
(async function checkHealth() {
  try {
    const r = await fetch(API_BASE + "/api/health");
    if (!r.ok) throw new Error("not ok");
    console.log("[RecruitAI] Backend connected ✓");
  } catch {
    console.warn("[RecruitAI] Backend not reachable — check Render service.");
  }
})();
