// ============================================================
// Brandigade HRIS - Frontend Application Logic
// Vanilla JS, no build step. Talks to the Express API below.
// ============================================================

const API_BASE = '/api';

const state = {
  token: localStorage.getItem('hris_token') || null,
  user: null,
  employee: null,
  currentPage: 'dashboard',
  googleClientId: null,
};

// ---------------- API helper ----------------
async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    logout();
    throw new Error('Session expired. Please log in again.');
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (!res.ok) throw new Error('Request failed (' + res.status + ')');
    return res; // caller handles non-JSON (e.g. PDF) responses
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function setToken(token) {
  state.token = token;
  if (token) localStorage.setItem('hris_token', token);
  else localStorage.removeItem('hris_token');
}

function logout() {
  setToken(null);
  state.user = null;
  state.employee = null;
  document.getElementById('app-shell').classList.remove('visible');
  document.getElementById('login-screen').style.display = 'flex';
  
  // Reinitialize Google Sign-In button on logout to ensure it's clickable again
  initGoogleSSO();
}

// ---------------- Boot ----------------
async function boot() {
  // 1. Fetch Google SSO config
  try {
    const config = await api('GET', '/auth/google-config');
    state.googleClientId = config.clientId;
    initGoogleSSO();
  } catch (err) {
    console.error('Failed to load Google SSO config:', err);
  }

  // Auto-login with hardcoded credentials for testing
  if (!state.token) {
    // Simulate successful authentication
    const fakeToken = 'test-token';
    setToken(fakeToken);
    state.user = { email: 'test@example.com', role: 'admin', mustChangePassword: false };
    state.employee = { id: 1, full_name: 'Test User' };
    enterApp();
    return;
  }
  // Existing auth flow when token present
  try {
    const data = await api('GET', '/auth/me');
    state.user = data.user;
    state.employee = data.employee;
    enterApp();
  } catch (err) {
    logout();
  }
}

// ---------------- Google SSO Initializer ----------------
function initGoogleSSO() {
  if (!state.googleClientId || !window.google) return;
  
  window.google.accounts.id.initialize({
    client_id: state.googleClientId,
    callback: handleGoogleSignIn,
  });
  
  window.google.accounts.id.renderButton(
    document.getElementById('google-sso-btn'),
    { theme: 'filled_dark', size: 'large', width: '340px' }
  );
}

async function handleGoogleSignIn(response) {
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  try {
    const data = await api('POST', '/auth/google-login', { credential: response.credential });
    setToken(data.token);
    state.user = data.user;
    state.employee = { id: data.user.employeeId, full_name: data.user.fullName };
    enterApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
}

function enterApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').classList.add('visible');

  document.getElementById('sidebar-name').textContent =
    state.employee ? state.employee.full_name : state.user.email;
    
  document.getElementById('sidebar-role').textContent = 
    state.user.role === 'admin' ? 'Administrator' : 'Employee';

  // Toggle admin sections
  const isAdmin = state.user.role === 'admin';
  document.getElementById('section-admin').style.display = isAdmin ? '' : 'none';
  document.getElementById('nav-employees').style.display = isAdmin ? '' : 'none';
  document.getElementById('nav-attendance').style.display = isAdmin ? '' : 'none';
  document.getElementById('nav-payroll').style.display = isAdmin ? '' : 'none';

  if (state.user.mustChangePassword) {
    document.getElementById('change-password-modal').classList.add('visible');
  }

  navigateTo('dashboard');
}

// ---------------- Login form ----------------
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';

  try {
    const data = await api('POST', '/auth/login', { email, password });
    setToken(data.token);
    state.user = data.user;
    state.employee = { id: data.user.employeeId, full_name: data.user.fullName };
    enterApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
});

document.getElementById('logout-btn').addEventListener('click', logout);

// ---------------- Change password modal ----------------
document.getElementById('submit-new-password').addEventListener('click', async () => {
  const newPw = document.getElementById('new-password').value;
  const confirmPw = document.getElementById('confirm-password').value;
  const errEl = document.getElementById('change-pw-error');
  errEl.style.display = 'none';

  if (newPw.length < 8) {
    errEl.textContent = 'Password must be at least 8 characters.';
    errEl.style.display = 'block';
    return;
  }
  if (newPw !== confirmPw) {
    errEl.textContent = 'Passwords do not match.';
    errEl.style.display = 'block';
    return;
  }

  try {
    await api('POST', '/auth/change-password', { newPassword: newPw });
    state.user.mustChangePassword = false;
    document.getElementById('change-password-modal').classList.remove('visible');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
});

// ---------------- Navigation ----------------
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => navigateTo(item.dataset.page));
});

function navigateTo(page) {
  state.currentPage = page;
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });
  renderPage(page);
}

function renderPage(page) {
  const renderers = {
    dashboard: renderDashboard,
    employees: renderEmployees,
    'org-chart': renderOrgChart,
    leave: renderLeave,
    attendance: renderAttendance,
    payroll: renderPayroll,
    payslips: renderMyPayslips,
  };
  (renderers[page] || renderDashboard)();
}

function setMain(html) {
  document.getElementById('main-content').innerHTML = html;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatMoney(amount, currency) {
  const n = Number(amount) || 0;
  return (currency || 'PKR') + ' ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusPill(status) {
  const map = {
    pending: '<span class="pill pill-amber">Pending</span>',
    approved: '<span class="pill pill-green">Approved</span>',
    rejected: '<span class="pill pill-red">Rejected</span>',
    cancelled: '<span class="pill pill-gray">Cancelled</span>',
  };
  return map[status] || status;
}

// ============================================================
// DASHBOARD
// ============================================================
async function renderDashboard() {
  setMain('<div class="page-header"><h2>Dashboard</h2></div><div class="empty-state">Loading…</div>');

  try {
    if (state.user.role === 'admin') {
      const employees = await api('GET', '/employees');
      const pendingLeave = await api('GET', '/leave/requests?status=pending');
      const active = employees.filter(e => e.employment_status === 'active');

      setMain(`
        <div class="page-header"><h2>Dashboard</h2></div>
        <div class="stat-grid">
          <div class="stat-card">
            <div class="stat-label">Active Employees</div>
            <div class="stat-value">${active.length}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Total Staff</div>
            <div class="stat-value">${employees.length}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Pending Leaves</div>
            <div class="stat-value">${pendingLeave.length}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Biometric Device</div>
            <div class="stat-value" style="font-size: 14px; margin-top: 10px;">
              ${state.googleClientId ? '<span class="pill pill-green">Online</span>' : '<span class="pill pill-gray">Inactive</span>'}
            </div>
          </div>
        </div>

        <div class="card">
          <h3 style="margin-bottom:18px;">Biometric Quick Sync (ZKTeco UFace 800)</h3>
          <p class="muted" style="margin-bottom:16px;">Trigger an immediate TCP download of all punch-logs from the office attendance device.</p>
          <button class="btn btn-primary" onclick="triggerBiometricSync(this)">⚡ Sync Device Attendance</button>
          <span id="biometric-quick-status" style="margin-left: 15px; font-weight: 600;"></span>
        </div>

        <div class="card">
          <h3 style="margin-bottom:14px;">Pending Leave Requests</h3>
          ${pendingLeave.length === 0 ? '<div class="muted">No pending requests.</div>' : `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th></th></tr>
                </thead>
                <tbody>
                  ${pendingLeave.map(r => `
                    <tr>
                      <td><strong>${escapeHtml(r.full_name)}</strong></td>
                      <td>${escapeHtml(r.leave_type_name)}</td>
                      <td>${r.start_date} → ${r.end_date}</td>
                      <td>${r.days}</td>
                      <td><a href="#" onclick="navigateTo('leave'); return false;" style="color:var(--blue-soft); font-weight:600;">Review →</a></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      `);
    } else {
      // Employee Dashboard
      const balances = await api('GET', '/leave/balances/' + state.employee.id);
      const myRequests = await api('GET', '/leave/requests');
      const todayStatus = await api('GET', '/attendance/today');

      const isCheckedIn = !!todayStatus.check_in;
      const isCheckedOut = !!todayStatus.check_out;

      setMain(`
        <div class="page-header"><h2>Welcome, ${escapeHtml(state.employee.full_name || '')}</h2></div>
        
        <!-- Live Check-In widget -->
        <div class="checkin-widget">
          <div class="checkin-status">
            <div class="cs-label">Today's Attendance Status</div>
            <div class="cs-time">
              ${isCheckedIn ? (isCheckedOut ? `Checked Out: ${todayStatus.check_out}` : `Checked In: ${todayStatus.check_in}`) : 'Not Clocked In'}
            </div>
            <div class="cs-detail">
              ${todayStatus.late ? '<span class="pill pill-red">Late Check-in</span>' : (isCheckedIn ? '<span class="pill pill-green">On Time</span>' : 'Biometric log pending')}
              ${todayStatus.status === 'half_day' ? ' | <span class="pill pill-amber">Half Day (under 4 hrs worked)</span>' : ''}
            </div>
          </div>
          <div class="checkin-actions">
            <button class="btn btn-primary" onclick="clockIn()" ${isCheckedIn ? 'disabled' : ''}>Clock In</button>
            <button class="btn btn-ghost" onclick="clockOut()" ${!isCheckedIn || isCheckedOut ? 'disabled' : ''}>Clock Out</button>
          </div>
        </div>

        <div class="stat-grid">
          ${balances.map(b => `
            <div class="stat-card">
              <div class="stat-label">${escapeHtml(b.leaveTypeName)}</div>
              <div class="stat-value">${b.remaining}</div>
              <div class="stat-sub">of ${b.allocated} days left</div>
            </div>
          `).join('')}
        </div>

        <div class="card">
          <h3 style="margin-bottom:14px;">My Recent Leave Requests</h3>
          ${myRequests.length === 0 ? '<div class="muted">No leave requests yet.</div>' : `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr><th>Type</th><th>Dates</th><th>Days</th><th>Status</th></tr>
                </thead>
                <tbody>
                  ${myRequests.slice(0, 5).map(r => `
                    <tr>
                      <td>${escapeHtml(r.leave_type_name)}</td>
                      <td>${r.start_date} → ${r.end_date}</td>
                      <td>${r.days}</td>
                      <td>${statusPill(r.status)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      `);
    }
  } catch (err) {
    setMain('<div class="alert alert-error">' + escapeHtml(err.message) + '</div>');
  }
}

async function clockIn() {
  try {
    const res = await api('POST', '/attendance/checkin');
    alert(`Clock-in successful at ${res.checkIn}.` + (res.late ? ' (Recorded as late arrival)' : ''));
    renderDashboard();
  } catch (err) {
    alert(err.message);
  }
}

async function clockOut() {
  try {
    const res = await api('POST', '/attendance/checkout');
    alert(`Clock-out successful at ${res.checkOut}.` + (res.halfDay ? ' (Under 4 hours worked. Logged as half-day)' : ''));
    renderDashboard();
  } catch (err) {
    alert(err.message);
  }
}

// ---------------- Biometric triggers ----------------
async function triggerBiometricSync(btn) {
  const statusEl = document.getElementById('biometric-quick-status');
  btn.disabled = true;
  statusEl.textContent = 'Connecting to ZKTeco device...';
  statusEl.className = 'muted';

  try {
    const r = await api('POST', '/attendance/sync-zkteco');
    if (r.errors && r.errors.length) {
      statusEl.innerHTML = `<span class="pill pill-red">Sync Completed with Errors</span><br>${r.errors.join('<br>')}`;
    } else {
      statusEl.innerHTML = `<span class="pill pill-green">Success</span> Synced ${r.synced} records (${r.skipped} unmapped skipped)`;
    }
  } catch (e) {
    statusEl.innerHTML = `<span class="pill pill-red">Failed</span> Connection timed out or config missing.`;
  } finally {
    btn.disabled = false;
  }
}

// ============================================================
// EMPLOYEES (admin only)
// ============================================================
async function renderEmployees() {
  setMain('<div class="page-header"><h2>Employees</h2></div><div class="empty-state">Loading…</div>');
  try {
    const employees = await api('GET', '/employees');
    setMain(`
      <div class="page-header">
        <h2>Employees</h2>
        <button class="btn btn-primary" onclick="openCreateEmployeeModal()">+ Add Employee</button>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Code</th><th>Name</th><th>Designation</th><th>Department</th><th>Shift Time</th><th>Salary</th><th>Account</th><th></th></tr>
            </thead>
            <tbody>
              ${employees.map(e => `
                <tr>
                  <td><code>${escapeHtml(e.employee_code)}</code></td>
                  <td><strong>${escapeHtml(e.full_name)}</strong></td>
                  <td>${escapeHtml(e.designation || '—')}</td>
                  <td>${escapeHtml(e.department || '—')}</td>
                  <td><span class="pill pill-cyan">${e.shift_start || '09:30'} - ${e.shift_end || '18:30'}</span></td>
                  <td>${formatMoney(e.base_salary, e.currency)}</td>
                  <td>${e.account_active ? '<span class="pill pill-green">Active</span>' : '<span class="pill pill-red">Disabled</span>'}</td>
                  <td><button class="btn btn-ghost btn-sm" onclick="openEmployeeDetail(${e.id})">Manage</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      ${employeeModalsHtml()}
    `);
  } catch (err) {
    setMain('<div class="alert alert-error">' + escapeHtml(err.message) + '</div>');
  }
}

function employeeModalsHtml() {
  return `
    <div class="modal-overlay" id="create-employee-modal">
      <div class="modal-box" style="width:520px;">
        <h3>Add Employee</h3>
        <div id="create-emp-error" class="alert alert-error" style="display:none;"></div>
        <div id="create-emp-success" class="alert alert-success" style="display:none;"></div>
        
        <div class="field"><label>Full name</label><input id="emp-full-name" required placeholder="John Doe"></div>
        <div class="field"><label>Work email (used as login)</label><input id="emp-email" type="email" required placeholder="name@gmail.com"></div>
        
        <div class="row">
          <div class="field"><label>Designation</label><input id="emp-designation" placeholder="Software Engineer"></div>
          <div class="field"><label>Department</label><input id="emp-department" placeholder="Engineering"></div>
        </div>

        <div class="row">
          <div class="field"><label>Shift Start (HH:MM)</label><input id="emp-shift-start" value="09:30"></div>
          <div class="field"><label>Shift End (HH:MM)</label><input id="emp-shift-end" value="18:30"></div>
        </div>

        <div class="row">
          <div class="field"><label>Date of joining</label><input id="emp-doj" type="date"></div>
          <div class="field"><label>Base salary (PKR/month)</label><input id="emp-salary" type="number" min="0" value="50000"></div>
        </div>
        
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="closeModal('create-employee-modal')">Close</button>
          <button class="btn btn-primary" id="create-emp-submit" onclick="submitCreateEmployee()">Create Account</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" id="employee-detail-modal">
      <div class="modal-box" style="width:580px;" id="employee-detail-body"></div>
    </div>
  `;
}

function closeModal(id) {
  document.getElementById(id).classList.remove('visible');
}

function openCreateEmployeeModal() {
  document.getElementById('create-employee-modal').classList.add('visible');
}

async function submitCreateEmployee() {
  const errEl = document.getElementById('create-emp-error');
  const okEl = document.getElementById('create-emp-success');
  errEl.style.display = 'none';
  okEl.style.display = 'none';

  const payload = {
    fullName: document.getElementById('emp-full-name').value.trim(),
    email: document.getElementById('emp-email').value.trim(),
    designation: document.getElementById('emp-designation').value.trim(),
    department: document.getElementById('emp-department').value.trim(),
    shiftStart: document.getElementById('emp-shift-start').value.trim(),
    shiftEnd: document.getElementById('emp-shift-end').value.trim(),
    dateOfJoining: document.getElementById('emp-doj').value,
    baseSalary: Number(document.getElementById('emp-salary').value) || 0,
  };

  if (!payload.fullName || !payload.email) {
    errEl.textContent = 'Full name and email are required.';
    errEl.style.display = 'block';
    return;
  }

  try {
    const result = await api('POST', '/employees', payload);
    okEl.innerHTML = `Account created for <strong>${escapeHtml(payload.fullName)}</strong> (${escapeHtml(result.employeeCode)}).
      <div class="temp-pw-box">Email: ${escapeHtml(result.email)}<br>Temporary password: ${escapeHtml(result.temporaryPassword)}</div>
      <div class="muted" style="margin-top:8px;">Copy and share this password with the employee securely.</div>`;
    okEl.style.display = 'block';
    
    // Clear form fields
    document.getElementById('emp-full-name').value = '';
    document.getElementById('emp-email').value = '';
    
    setTimeout(() => { renderEmployees(); }, 5000);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
}

async function openEmployeeDetail(id) {
  const modal = document.getElementById('employee-detail-modal');
  const body = document.getElementById('employee-detail-body');
  body.innerHTML = '<div class="empty-state">Loading…</div>';
  modal.classList.add('visible');

  try {
    const emp = await api('GET', '/employees/' + id);
    const allEmployees = await api('GET', '/employees');
    const managerOptions = allEmployees.filter(e => e.id !== id);

    body.innerHTML = `
      <h3>Modify ${escapeHtml(emp.full_name)} <span class="muted">(${escapeHtml(emp.employee_code)})</span></h3>
      <br>
      <div class="field"><label>Designation</label><input id="d-designation" value="${escapeHtml(emp.designation || '')}"></div>
      <div class="field"><label>Department</label><input id="d-department" value="${escapeHtml(emp.department || '')}"></div>
      
      <div class="row">
        <div class="field"><label>Shift Start (HH:MM)</label><input id="d-shift-start" value="${escapeHtml(emp.shift_start || '09:30')}"></div>
        <div class="field"><label>Shift End (HH:MM)</label><input id="d-shift-end" value="${escapeHtml(emp.shift_end || '18:30')}"></div>
      </div>

      <div class="field"><label>Reports to (manager)</label>
        <select id="d-manager">
          <option value="">— none (top level) —</option>
          ${managerOptions.map(m => `<option value="${m.id}" ${emp.manager_id===m.id?'selected':''}>${escapeHtml(m.full_name)}</option>`).join('')}
        </select>
      </div>

      <div class="field"><label>Employment status</label>
        <select id="d-status">
          ${['active','on_leave','terminated','resigned'].map(s => `<option value="${s}" ${emp.employment_status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      
      <button class="btn btn-primary btn-sm" onclick="saveEmployeeBasics(${id})">Save Settings</button>

      <hr class="divider">
      <h3 style="font-size:15px;">Adjust Base Salary</h3>
      <p class="muted">Increment or configure base salary. This updates the history log.</p>
      <div class="muted" style="margin-bottom:8px; font-weight:700;">Current Salary: ${formatMoney(emp.base_salary, emp.currency)}</div>
      <div class="row">
        <div class="field"><input id="d-new-salary" type="number" placeholder="New base salary amount"></div>
        <div class="field"><input id="d-salary-reason" placeholder="Reason (e.g. Increment)"></div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="applyIncrement(${id})">Apply Base Salary Update</button>
      
      ${emp.salaryHistory && emp.salaryHistory.length ? `
        <table style="margin-top:16px;">
          <thead>
            <tr><th>Date</th><th>Old</th><th>New</th><th>Reason</th></tr>
          </thead>
          <tbody>
            ${emp.salaryHistory.map(h => `<tr><td>${h.effective_date}</td><td>${formatMoney(h.old_salary, emp.currency)}</td><td>${formatMoney(h.new_salary, emp.currency)}</td><td>${escapeHtml(h.reason||'—')}</td></tr>`).join('')}
          </tbody>
        </table>
      ` : ''}

      <hr class="divider">
      <h3 style="font-size:15px;">Account Credentials</h3>
      <div class="row" style="margin-top:10px;">
        <button class="btn btn-danger btn-sm" onclick="toggleAccountStatus(${id}, ${emp.account_active ? 'false' : 'true'})">
          ${emp.account_active ? 'Disable Account' : 'Re-enable Account'}
        </button>
        <button class="btn btn-ghost btn-sm" onclick="resetEmployeePassword(${id})">Issue Temp Password</button>
      </div>
      <div id="reset-pw-result"></div>

      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal('employee-detail-modal')">Close</button>
      </div>
    `;
  } catch (err) {
    body.innerHTML = '<div class="alert alert-error">' + escapeHtml(err.message) + '</div>';
  }
}

async function saveEmployeeBasics(id) {
  try {
    const managerVal = document.getElementById('d-manager').value;
    await api('PUT', '/employees/' + id, {
      designation: document.getElementById('d-designation').value.trim(),
      department: document.getElementById('d-department').value.trim(),
      shiftStart: document.getElementById('d-shift-start').value.trim(),
      shiftEnd: document.getElementById('d-shift-end').value.trim(),
      employmentStatus: document.getElementById('d-status').value,
      managerId: managerVal ? Number(managerVal) : null,
    });
    renderEmployees();
    closeModal('employee-detail-modal');
  } catch (err) {
    alert(err.message);
  }
}

async function applyIncrement(id) {
  const newSalary = Number(document.getElementById('d-new-salary').value);
  const reason = document.getElementById('d-salary-reason').value;
  if (!newSalary || newSalary <= 0) { alert('Enter a valid new salary.'); return; }
  try {
    await api('POST', '/employees/' + id + '/salary-increment', { newSalary, reason });
    openEmployeeDetail(id);
  } catch (err) {
    alert(err.message);
  }
}

async function toggleAccountStatus(id, isActive) {
  try {
    await api('POST', '/employees/' + id + '/account-status', { isActive: isActive === 'true' || isActive === true });
    openEmployeeDetail(id);
  } catch (err) {
    alert(err.message);
  }
}

async function resetEmployeePassword(id) {
  try {
    const result = await api('POST', '/employees/' + id + '/reset-password');
    document.getElementById('reset-pw-result').innerHTML =
      `<div class="temp-pw-box" style="margin-top:10px;">New temporary password: ${escapeHtml(result.temporaryPassword)}</div>`;
  } catch (err) {
    alert(err.message);
  }
}

// ============================================================
// ORG CHART
// ============================================================
async function renderOrgChart() {
  setMain('<div class="page-header"><h2>Org Chart</h2></div><div class="empty-state">Loading…</div>');
  try {
    const tree = await api('GET', '/employees/org-chart');
    setMain(`
      <div class="page-header"><h2>Org Chart</h2></div>
      <div class="card">${tree.length ? renderOrgNodes(tree) : '<div class="empty-state">No employees found.</div>'}</div>
    `);
  } catch (err) {
    setMain('<div class="alert alert-error">' + escapeHtml(err.message) + '</div>');
  }
}

function renderOrgNodes(nodes) {
  return '<div class="org-tree">' + nodes.map(n => `
    <div class="org-node">
      <div class="org-box">
        <div class="org-name">${escapeHtml(n.full_name)}</div>
        <div class="org-role">${escapeHtml(n.designation || '')}${n.department ? ' · ' + escapeHtml(n.department) : ''}</div>
      </div>
      ${n.children && n.children.length ? `<div class="org-children">${renderOrgNodes(n.children)}</div>` : ''}
    </div>
  `).join('') + '</div>';
}

// ============================================================
// LEAVE MANAGEMENT
// ============================================================
async function renderLeave() {
  setMain('<div class="page-header"><h2>Leave</h2></div><div class="empty-state">Loading…</div>');
  try {
    const leaveTypes = await api('GET', '/leave/types');

    if (state.user.role === 'admin') {
      const requests = await api('GET', '/leave/requests');
      setMain(`
        <div class="page-header"><h2>Leave Requests</h2></div>
        <div class="card">
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                ${requests.map(r => `
                  <tr>
                    <td><strong>${escapeHtml(r.full_name)}</strong></td>
                    <td>${escapeHtml(r.leave_type_name)}</td>
                    <td>${r.start_date} → ${r.end_date}</td>
                    <td>${r.days}</td>
                    <td>${escapeHtml(r.reason || '—')}</td>
                    <td>${statusPill(r.status)}</td>
                    <td>
                      ${r.status === 'pending' ? `
                        <button class="btn btn-success btn-sm" onclick="decideLeave(${r.id}, 'approved')">Approve</button>
                        <button class="btn btn-danger btn-sm" onclick="decideLeave(${r.id}, 'rejected')">Reject</button>
                      ` : '—'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `);
    } else {
      const balances = await api('GET', '/leave/balances/' + state.employee.id);
      const myRequests = await api('GET', '/leave/requests');
      setMain(`
        <div class="page-header">
          <h2>My Leave Requests</h2>
          <button class="btn btn-primary" onclick="openApplyLeaveModal()">Apply for Leave</button>
        </div>
        <div class="stat-grid">
          ${balances.map(b => `
            <div class="stat-card">
              <div class="stat-label">${escapeHtml(b.leaveTypeName)}</div>
              <div class="stat-value">${b.remaining}</div>
              <div class="stat-sub">of ${b.allocated} days remaining</div>
            </div>
          `).join('')}
        </div>
        <div class="card">
          <h3 style="margin-bottom:14px;">Request History</h3>
          ${myRequests.length === 0 ? '<div class="muted">No leave requests logged.</div>' : `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th></tr>
                </thead>
                <tbody>
                  ${myRequests.map(r => `
                    <tr>
                      <td>${escapeHtml(r.leave_type_name)}</td>
                      <td>${r.start_date} → ${r.end_date}</td>
                      <td>${r.days}</td>
                      <td>${escapeHtml(r.reason || '—')}</td>
                      <td>${statusPill(r.status)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>

        <div class="modal-overlay" id="apply-leave-modal">
          <div class="modal-box">
            <h3>Apply for Leave</h3>
            <div id="apply-leave-error" class="alert alert-error" style="display:none;"></div>
            
            <div class="field">
              <label>Leave type</label>
              <select id="al-type">
                ${leaveTypes.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}
              </select>
            </div>
            
            <div class="row">
              <div class="field"><label>Start date</label><input id="al-start" type="date"></div>
              <div class="field"><label>End date</label><input id="al-end" type="date"></div>
            </div>
            <div class="field"><label>Reason</label><textarea id="al-reason" rows="3" placeholder="State reason..."></textarea></div>
            
            <div class="modal-actions">
              <button class="btn btn-ghost" onclick="closeModal('apply-leave-modal')">Cancel</button>
              <button class="btn btn-primary" onclick="submitLeaveRequest()">Submit</button>
            </div>
          </div>
        </div>
      `);
    }
  } catch (err) {
    setMain('<div class="alert alert-error">' + escapeHtml(err.message) + '</div>');
  }
}

async function openApplyLeaveModal() {
  document.getElementById('apply-leave-modal').classList.add('visible');
}

async function submitLeaveRequest() {
  const errEl = document.getElementById('apply-leave-error');
  errEl.style.display = 'none';
  const payload = {
    leaveTypeId: Number(document.getElementById('al-type').value),
    startDate: document.getElementById('al-start').value,
    endDate: document.getElementById('al-end').value,
    reason: document.getElementById('al-reason').value.trim(),
  };
  if (!payload.startDate || !payload.endDate) {
    errEl.textContent = 'Please choose start and end dates.';
    errEl.style.display = 'block';
    return;
  }
  try {
    await api('POST', '/leave/requests', payload);
    closeModal('apply-leave-modal');
    renderLeave();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
}

async function decideLeave(id, decision) {
  try {
    await api('POST', '/leave/requests/' + id + '/decision', { decision });
    renderLeave();
  } catch (err) {
    alert(err.message);
  }
}

// ============================================================
// ATTENDANCE (admin only)
// ============================================================
async function renderAttendance() {
  const today = new Date().toISOString().slice(0, 10);
  setMain('<div class="page-header"><h2>Attendance Control</h2></div><div class="empty-state">Loading…</div>');
  try {
    const employees = await api('GET', '/employees');
    const active = employees.filter(e => e.employment_status === 'active');

    setMain(`
      <div class="page-header"><h2>Daily Attendance Control</h2></div>
      
      <div class="card">
        <h3 style="margin-bottom:14px;">Bulk Log Attendance</h3>
        <div class="row" style="align-items:flex-end; margin-bottom: 16px;">
          <div class="field"><label>Select Date</label><input id="att-date" type="date" value="${today}"></div>
          <div class="field"><label>Default status for everyone</label>
            <select id="att-default-status">
              <option value="present">Present (On Time)</option>
              <option value="holiday">Holiday</option>
              <option value="weekend">Weekend</option>
            </select>
          </div>
          <button class="btn btn-primary" style="height:42px;" onclick="bulkMarkAttendance()">Bulk Apply</button>
        </div>

        <p class="muted" style="margin-top: 24px; margin-bottom: 12px; font-weight:700;">Employee Status Overrides</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Employee</th><th>Shift Timing</th><th>Override Status</th></tr>
            </thead>
            <tbody>
              ${active.map(e => `
                <tr>
                  <td><strong>${escapeHtml(e.full_name)}</strong> <code class="muted">(${e.employee_code})</code></td>
                  <td><span class="pill pill-gray">${e.shift_start || '09:30'} - ${e.shift_end || '18:30'}</span></td>
                  <td>
                    <select id="att-override-${e.id}" style="width:180px;">
                      <option value="">— use default —</option>
                      <option value="present">Present</option>
                      <option value="absent">Absent</option>
                      <option value="half_day">Half day</option>
                      <option value="leave">Leave</option>
                    </select>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div id="attendance-result"></div>
    `);
  } catch (err) {
    setMain('<div class="alert alert-error">' + escapeHtml(err.message) + '</div>');
  }
}

async function bulkMarkAttendance() {
  const date = document.getElementById('att-date').value;
  const defaultStatus = document.getElementById('att-default-status').value;
  const employees = await api('GET', '/employees');
  const active = employees.filter(e => e.employment_status === 'active');

  const exceptions = [];
  active.forEach(e => {
    const sel = document.getElementById('att-override-' + e.id);
    if (sel && sel.value) exceptions.push({ employeeId: e.id, status: sel.value });
  });

  try {
    const result = await api('POST', '/attendance/bulk', { date, defaultStatus, exceptions });
    document.getElementById('attendance-result').innerHTML =
      `<div class="alert alert-success">Marked attendance successfully for ${result.employeesMarked} employees on ${escapeHtml(date)}.</div>`;
  } catch (err) {
    document.getElementById('attendance-result').innerHTML =
      `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
  }
}

// ============================================================
// PAYROLL (admin only)
// ============================================================
async function renderPayroll() {
  const now = new Date();
  setMain('<div class="page-header"><h2>Payroll</h2></div><div class="empty-state">Loading…</div>');
  try {
    const runs = await api('GET', '/payroll/runs');
    setMain(`
      <div class="page-header"><h2>Payroll Management</h2></div>
      
      <div class="card">
        <h3 style="margin-bottom:14px;">Open or Start a Payroll Period</h3>
        <div class="row" style="align-items:flex-end;">
          <div class="field"><label>Month</label>
            <select id="pr-month">
              ${Array.from({length:12}, (_,i) => `<option value="${i+1}" ${i+1===now.getMonth()+1?'selected':''}>${new Date(2000,i,1).toLocaleString('en',{month:'long'})}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Year</label><input id="pr-year" type="number" value="${now.getFullYear()}"></div>
          <button class="btn btn-primary" style="height:42px;" onclick="startPayrollRun()">Start / Open Period</button>
        </div>
      </div>

      <div class="card">
        <h3 style="margin-bottom:14px;">Payroll Period Runs History</h3>
        ${runs.length === 0 ? '<div class="muted">No payroll runs logged yet.</div>' : `
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Payroll Period</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                ${runs.map(r => `
                  <tr>
                    <td><strong>${new Date(r.period_year, r.period_month-1, 1).toLocaleString('en',{month:'long', year:'numeric'})}</strong></td>
                    <td>${r.status === 'finalized' ? '<span class="pill pill-green">Finalized &amp; Sent</span>' : '<span class="pill pill-amber">Draft</span>'}</td>
                    <td><button class="btn btn-ghost btn-sm" onclick="openPayrollRun(${r.id})">Open Summary</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
      <div id="payroll-run-detail"></div>
    `);
  } catch (err) {
    setMain('<div class="alert alert-error">' + escapeHtml(err.message) + '</div>');
  }
}

async function startPayrollRun() {
  const month = Number(document.getElementById('pr-month').value);
  const year = Number(document.getElementById('pr-year').value);
  try {
    const run = await api('POST', '/payroll/runs', { month, year });
    openPayrollRun(run.id);
  } catch (err) {
    alert(err.message);
  }
}

async function openPayrollRun(runId) {
  const container = document.getElementById('payroll-run-detail');
  container.innerHTML = '<div class="empty-state">Loading payroll information...</div>';
  try {
    const runs = await api('GET', '/payroll/runs');
    const run = runs.find(r => r.id === runId);
    if (!run) throw new Error('Run not found.');

    const monthStr = new Date(run.period_year, run.period_month-1,1).toLocaleString('en',{month:'long',year:'numeric'});

    if (run.status === 'finalized') {
      const payslips = await api('GET', '/payroll/runs/' + runId + '/payslips');
      container.innerHTML = `
        <div class="card">
          <h3 style="margin-bottom:16px;">${monthStr} — Locked &amp; Finalized</h3>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Employee</th><th>Base Salary</th><th>Attendance Deductions</th><th>Performance Stats</th><th>Commission</th><th>Spiffs</th><th>Bonus</th><th>Net Paid</th><th></th></tr>
              </thead>
              <tbody>
                ${payslips.map(p => `
                  <tr>
                    <td><strong>${escapeHtml(p.full_name)}</strong> <code class="muted">(${escapeHtml(p.employee_code)})</code></td>
                    <td>${formatMoney(p.base_salary, p.currency)}</td>
                    <td>${formatMoney(p.unpaid_leave_deduction + p.other_deductions, p.currency)}</td>
                    <td>
                      <span class="pill pill-cyan">Sch: ${p.meetings_scheduled || 0}</span>
                      <span class="pill pill-green">Show: ${p.showups || 0}</span>
                      <span class="pill pill-red">NoShow: ${p.no_shows || 0}</span>
                    </td>
                    <td><strong>${formatMoney(p.commission, p.currency)}</strong></td>
                    <td><strong>${formatMoney(p.spiffs, p.currency)}</strong></td>
                    <td>${formatMoney(p.bonus, p.currency)}</td>
                    <td><strong class="text-gradient">${formatMoney(p.net_pay, p.currency)}</strong></td>
                    <td><button class="btn btn-ghost btn-sm" onclick="downloadPayslip(event, ${p.id})">Download PDF</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else {
      const preview = await api('GET', '/payroll/runs/' + runId + '/preview');
      container.innerHTML = `
        <div class="card">
          <h3 style="margin-bottom:16px;">${monthStr} — Draft Calculations</h3>
          <p class="muted" style="margin-bottom:18px;">
            Configure individual parameters below. Enter numbers of showups, scheduled meetings, and no-shows for performance records. 
            Directly input the Commission and Spiffs amounts. Base salaries are pro-rated automatically.
          </p>
          
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Base Salary</th>
                  <th>Days Present</th>
                  <th>Leave Deduct.</th>
                  <th>Performance (Sch / Show / NoShow)</th>
                  <th>Commission</th>
                  <th>Spiffs</th>
                  <th>Extra Bonus</th>
                  <th>Extra Deduct.</th>
                  <th>Net Estimate</th>
                </tr>
              </thead>
              <tbody>
                ${preview.map(p => `
                  <tr data-emp-id="${p.employeeId}">
                    <td><strong>${escapeHtml(p.employee.full_name)}</strong></td>
                    <td>${formatMoney(p.baseSalary, p.employee.currency)}</td>
                    <td>${p.daysPresent} / ${p.daysInPeriod}</td>
                    <td>${formatMoney(p.unpaidLeaveDeduction, p.employee.currency)}</td>
                    
                    <!-- Commission metrics inputs -->
                    <td>
                      <div style="display:flex; gap:6px;">
                        <input type="number" id="sch-${p.employeeId}" value="0" style="width:58px;" min="0" placeholder="Sch">
                        <input type="number" id="show-${p.employeeId}" value="0" style="width:58px;" min="0" placeholder="Show">
                        <input type="number" id="noshow-${p.employeeId}" value="0" style="width:58px;" min="0" placeholder="NoShow">
                      </div>
                    </td>
                    
                    <!-- Commission & Spiffs inputs -->
                    <td><input type="number" id="comm-${p.employeeId}" value="0" style="width:90px;" min="0" onchange="recalculateRowManual(${p.employeeId}, ${p.baseSalary}, ${p.unpaidLeaveDeduction})"></td>
                    <td><input type="number" id="spiff-${p.employeeId}" value="0" style="width:90px;" min="0" onchange="recalculateRowManual(${p.employeeId}, ${p.baseSalary}, ${p.unpaidLeaveDeduction})"></td>
                    
                    <!-- Manual override inputs -->
                    <td><input type="number" id="bonus-${p.employeeId}" value="0" style="width:90px;" min="0" onchange="recalculateRowManual(${p.employeeId}, ${p.baseSalary}, ${p.unpaidLeaveDeduction})"></td>
                    <td><input type="number" id="ded-${p.employeeId}" value="0" style="width:90px;" min="0" onchange="recalculateRowManual(${p.employeeId}, ${p.baseSalary}, ${p.unpaidLeaveDeduction})"></td>
                    
                    <!-- Row Total netPay Output -->
                    <td id="net-${p.employeeId}" style="font-weight: 700; color: var(--blue-soft);">${formatMoney(p.netPay, p.employee.currency)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div class="modal-actions" style="margin-top:24px;">
            <button class="btn btn-primary" onclick="finalizePayroll(${runId})">Finalize &amp; Email All Payslips</button>
          </div>
        </div>
      `;
    }
  } catch (err) {
    container.innerHTML = '<div class="alert alert-error">' + escapeHtml(err.message) + '</div>';
  }
}

// Client-side instant recalculation wrapper to assist the Admin
function recalculateRowManual(empId, baseSalary, leaveDeduct) {
  const comm = Number(document.getElementById(`comm-${empId}`).value) || 0;
  const spiff = Number(document.getElementById(`spiff-${empId}`).value) || 0;
  const bonus = Number(document.getElementById(`bonus-${empId}`).value) || 0;
  const ded = Number(document.getElementById(`ded-${empId}`).value) || 0;

  const net = baseSalary - leaveDeduct + bonus - ded + comm + spiff;
  document.getElementById(`net-${empId}`).textContent = formatMoney(net, 'PKR');
}

async function finalizePayroll(runId) {
  const preview = await api('GET', '/payroll/runs/' + runId + '/preview');
  const overrides = preview.map(p => ({
    employeeId: p.employeeId,
    bonus: Number(document.getElementById('bonus-' + p.employeeId)?.value) || 0,
    otherDeductions: Number(document.getElementById('ded-' + p.employeeId)?.value) || 0,
    commission: Number(document.getElementById('comm-' + p.employeeId)?.value) || 0,
    spiffs: Number(document.getElementById('spiff-' + p.employeeId)?.value) || 0,
    showups: Number(document.getElementById('show-' + p.employeeId)?.value) || 0,
    meetingsScheduled: Number(document.getElementById('sch-' + p.employeeId)?.value) || 0,
    noShows: Number(document.getElementById('noshow-' + p.employeeId)?.value) || 0,
  }));

  if (!confirm('Finalize this payroll period? This will lock calculations and immediately email PDF payslips to all employees.')) return;

  try {
    await api('POST', '/payroll/runs/' + runId + '/finalize', { overrides });
    openPayrollRun(runId);
  } catch (err) {
    alert(err.message);
  }
}

async function downloadPayslip(event, payslipId) {
  event.preventDefault();
  try {
    const res = await api('GET', '/payroll/payslips/' + payslipId + '/pdf');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  } catch (err) {
    alert(err.message);
  }
}

// ============================================================
// MY PAYSLIPS (everyone)
// ============================================================
async function renderMyPayslips() {
  setMain('<div class="page-header"><h2>My Payslips</h2></div><div class="empty-state">Loading…</div>');
  try {
    const payslips = await api('GET', '/payroll/my-payslips');
    setMain(`
      <div class="page-header"><h2>My Payslips History</h2></div>
      <div class="card">
        ${payslips.length === 0 ? '<div class="muted">No payslips found in your record.</div>' : `
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Period</th><th>Performance Stats</th><th>Commission / Spiffs</th><th>Net Paid Amount</th><th>Payslip Doc</th></tr>
              </thead>
              <tbody>
                ${payslips.map(p => `
                  <tr>
                    <td><strong>${new Date(p.period_year, p.period_month-1,1).toLocaleString('en',{month:'long',year:'numeric'})}</strong></td>
                    <td>
                      <span class="pill pill-cyan">Sch: ${p.meetings_scheduled || 0}</span>
                      <span class="pill pill-green">Show: ${p.showups || 0}</span>
                      <span class="pill pill-red">NoShow: ${p.no_shows || 0}</span>
                    </td>
                    <td>
                      <div>Commission: ${formatMoney(p.commission, 'PKR')}</div>
                      <div>Spiffs: ${formatMoney(p.spiffs, 'PKR')}</div>
                    </td>
                    <td><strong>${formatMoney(p.net_pay, 'PKR')}</strong></td>
                    <td><button class="btn btn-ghost btn-sm" onclick="downloadPayslip(event, ${p.id})">View PDF</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `);
  } catch (err) {
    setMain('<div class="alert alert-error">' + escapeHtml(err.message) + '</div>');
  }
}

// ---------------- Init ----------------
boot();
