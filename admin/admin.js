const API = {
    session: '/api/auth/me',
    logout: '/api/auth/logout',
    roles: '/api/admin/roles',
    roleManagement: '/api/admin/roles',
    users: '/api/admin/users',
    sessions: '/api/admin/sessions'
};

const state = { user: null, users: [], roles: [], sessions: [], toastTimer: null };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

function showToast(message, isError = false) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.toggle('is-error', isError);
    toast.classList.add('is-visible');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3600);
}

async function request(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
        window.location.replace('/');
        throw new Error('Tu sesión no tiene permiso para esta acción.');
    }
    if (!response.ok || data.success === false) {
        throw new Error(data.message || `No se pudo completar la solicitud (${response.status}).`);
    }
    return data;
}

function isAdmin(user) {
    return Number(user?.rol_id) === 1 || String(user?.rol_nombre || '').toLocaleLowerCase('es').includes('administrador');
}

function formatDate(value) {
    if (!value) return '—';
    const date = new Date(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z'));
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatDuration(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < 0) return '—';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours ? `${hours} h ${minutes} min` : `${minutes} min`;
}

function initials(name = '') {
    return String(name).trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toLocaleUpperCase('es') || 'U';
}

function userCell(user) {
    return `<div class="user-cell"><span class="user-avatar">${escapeHtml(initials(user.nombre))}</span><span><strong>${escapeHtml(user.nombre || 'Sin nombre')}</strong><small>${escapeHtml(user.email || '')}</small></span></div>`;
}

function statusCell(user) {
    const active = Number(user.estado) === 1;
    return `<span class="status-pill${active ? ' active' : ''}">${active ? 'Activo' : 'Inactivo'}</span>`;
}

function emptyRow(columns, message) {
    return `<tr><td class="table-message" colspan="${columns}">${escapeHtml(message)}</td></tr>`;
}

function sessionRow(session) {
    return `<tr><td>${userCell({ nombre: session.nombre || session.user_nombre, email: session.email })}</td><td>${escapeHtml(formatDate(session.inicio))}</td><td>${escapeHtml(formatDate(session.fin))}</td><td>${escapeHtml(formatDuration(session.duracion))}</td><td>${escapeHtml(session.motivo_fin || (session.fin ? '—' : 'En curso'))}</td></tr>`;
}

function updateStats() {
    const activeUsers = state.users.filter((user) => Number(user.estado) === 1).length;
    const activeSessions = state.sessions.filter((session) => !session.fin).length;
    $('#statUsers').textContent = state.users.length;
    $('#statActiveUsers').textContent = `${activeUsers} activos`;
    $('#statRoles').textContent = state.roles.length;
    $('#statSessions').textContent = state.sessions.length;
    $('#statActiveSessions').textContent = `${activeSessions} en curso`;
    $('#navUserCount').textContent = state.users.length;
}

function renderRecent() {
    const users = [...state.users].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 5);
    $('#recentUsersBody').innerHTML = users.length ? users.map((user) => `<tr><td>${userCell(user)}</td><td><span class="role-pill">${escapeHtml(user.rol_nombre || roleName(user.rol_id))}</span></td><td>${statusCell(user)}</td><td>${escapeHtml(formatDate(user.created_at))}</td><td></td></tr>`).join('') : emptyRow(5, 'No hay usuarios para mostrar.');
    $('#recentSessionsBody').innerHTML = state.sessions.slice(0, 5).map(sessionRow).join('') || emptyRow(5, 'No hay sesiones registradas.');
}

function roleName(id) {
    return state.roles.find((role) => String(role.id) === String(id))?.nombre || 'Sin rol';
}

function populateRoleOptions() {
    const options = state.roles.map((role) => `<option value="${escapeHtml(role.id)}">${escapeHtml(role.nombre)}</option>`).join('');
    $('#roleFilter').innerHTML = '<option value="">Todos los roles</option>' + options;
    $('#formRole').innerHTML = options || '<option value="">No hay roles disponibles</option>';
}

function renderRoles() {
    const counts = new Map();
    state.users.forEach((user) => counts.set(String(user.rol_id), (counts.get(String(user.rol_id)) || 0) + 1));
    $('#rolesBody').innerHTML = state.roles.length ? state.roles.map((role) => {
        const assignedUsers = counts.get(String(role.id)) || 0;
        const isPrimaryAdminRole = Number(role.id) === 1;
        const deleteDisabled = assignedUsers > 0 || isPrimaryAdminRole;
        const deleteTitle = assignedUsers > 0
            ? 'No se puede eliminar: hay usuarios asignados'
            : isPrimaryAdminRole
                ? 'El rol administrador principal está protegido'
                : 'Eliminar rol';
        return `<tr><td><span class="role-pill">${escapeHtml(role.nombre)}</span></td><td>${assignedUsers}</td><td>${Number(role.estado) === 1 ? '<span class="status-pill active">Activo</span>' : '<span class="status-pill">Inactivo</span>'}</td><td><div class="row-actions"><button class="icon-button" type="button" data-edit-role="${escapeHtml(role.id)}" aria-label="Editar rol ${escapeHtml(role.nombre)}" title="Editar rol"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button class="icon-button danger" type="button" data-delete-role="${escapeHtml(role.id)}" aria-label="Eliminar rol ${escapeHtml(role.nombre)}" title="${deleteTitle}" ${deleteDisabled ? 'disabled' : ''}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16m-10 4v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div></td></tr>`;
    }).join('') : emptyRow(4, 'No se encontraron roles.');
}

function filteredUsers() {
    const term = $('#userSearch').value.trim().toLocaleLowerCase('es');
    const role = $('#roleFilter').value;
    const status = $('#statusFilter').value;
    return state.users.filter((user) => {
        const matchesTerm = `${user.nombre || ''} ${user.email || ''}`.toLocaleLowerCase('es').includes(term);
        return matchesTerm && (!role || String(user.rol_id) === role) && (status === '' || String(user.estado) === status);
    });
}

function renderUsers() {
    const users = filteredUsers();
    $('#usersBody').innerHTML = users.length ? users.map((user) => `<tr><td>${userCell(user)}</td><td><span class="role-pill">${escapeHtml(user.rol_nombre || roleName(user.rol_id))}</span></td><td>${statusCell(user)}</td><td>${escapeHtml(formatDate(user.created_at))}</td><td><div class="row-actions"><button class="icon-button" type="button" data-edit-user="${escapeHtml(user.id)}" aria-label="Editar ${escapeHtml(user.nombre)}" title="Editar"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button class="icon-button danger" type="button" data-delete-user="${escapeHtml(user.id)}" aria-label="Eliminar ${escapeHtml(user.nombre)}" title="Eliminar"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16m-10 4v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div></td></tr>`).join('') : emptyRow(5, state.users.length ? 'No hay usuarios que coincidan con los filtros.' : 'Aún no hay usuarios.');
    $('#userResultCount').textContent = `${users.length} ${users.length === 1 ? 'usuario' : 'usuarios'}`;
}

function filteredSessions() {
    const term = $('#sessionSearch').value.trim().toLocaleLowerCase('es');
    const status = $('#sessionStateFilter').value;
    return state.sessions.filter((session) => {
        const matchesTerm = `${session.nombre || session.user_nombre || ''} ${session.email || ''}`.toLocaleLowerCase('es').includes(term);
        return matchesTerm && (!status || (status === 'active' ? !session.fin : Boolean(session.fin)));
    });
}

function renderSessions() {
    const sessions = filteredSessions();
    $('#sessionsBody').innerHTML = sessions.map(sessionRow).join('') || emptyRow(5, state.sessions.length ? 'No hay sesiones que coincidan con los filtros.' : 'Aún no hay sesiones registradas.');
    $('#sessionResultCount').textContent = `${sessions.length} ${sessions.length === 1 ? 'sesión' : 'sesiones'}`;
}

async function loadUsers() {
    try {
        const data = await request(API.users);
        state.users = data.users || data.results || [];
        renderUsers();
        renderRecent();
        renderRoles();
        updateStats();
    } catch (error) {
        $('#usersBody').innerHTML = emptyRow(5, 'No se pudieron cargar usuarios. Verifica la ruta de administración del API.');
        $('#recentUsersBody').innerHTML = emptyRow(5, 'No fue posible cargar usuarios.');
        showToast(error.message, true);
    }
}

async function loadRoles() {
    try {
        const data = await request(API.roles);
        state.roles = data.roles || data.results || [];
        populateRoleOptions();
        renderRoles();
        updateStats();
    } catch (error) {
        $('#rolesBody').innerHTML = emptyRow(4, 'No se pudieron cargar los roles.');
        showToast(error.message, true);
    }
}

function openRoleDialog(role = null) {
    const editing = Boolean(role);
    $('#roleDialogTitle').textContent = editing ? 'Editar rol' : 'Nuevo rol';
    $('#editRoleId').value = role?.id || '';
    $('#formRoleName').value = role?.nombre || '';
    $('#formRoleStatus').value = String(role?.estado ?? 1);
    $('#roleStatusField').hidden = !editing;
    $('#saveRole').textContent = editing ? 'Guardar cambios' : 'Crear rol';
    $('#roleFormError').hidden = true;
    $('#roleFormError').textContent = '';
    $('#roleDialog').showModal();
    $('#formRoleName').focus();
}

async function saveRole(event) {
    event.preventDefault();
    const id = $('#editRoleId').value;
    const body = { nombre: $('#formRoleName').value.trim() };
    if (id) body.estado = Number($('#formRoleStatus').value);
    const button = $('#saveRole');
    button.disabled = true;
    button.textContent = 'Guardando...';
    try {
        await request(id ? `${API.roleManagement}/${encodeURIComponent(id)}` : API.roleManagement, {
            method: id ? 'PATCH' : 'POST',
            body: JSON.stringify(body)
        });
        $('#roleDialog').close();
        showToast(id ? 'El rol fue actualizado.' : 'El rol fue creado.');
        await Promise.all([loadRoles(), loadUsers()]);
    } catch (error) {
        $('#roleFormError').textContent = error.message;
        $('#roleFormError').hidden = false;
    } finally {
        button.disabled = false;
        button.textContent = id ? 'Guardar cambios' : 'Crear rol';
    }
}

async function deleteRole(id) {
    const role = state.roles.find((item) => String(item.id) === String(id));
    const assignedUsers = state.users.filter((user) => String(user.rol_id) === String(id)).length;
    if (!role || assignedUsers || !window.confirm(`¿Eliminar el rol "${role.nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
        await request(`${API.roleManagement}/${encodeURIComponent(id)}`, { method: 'DELETE' });
        showToast('El rol fue eliminado.');
        await Promise.all([loadRoles(), loadUsers()]);
    } catch (error) {
        showToast(error.message, true);
    }
}

async function loadSessions() {
    try {
        const data = await request(API.sessions);
        state.sessions = data.sessions || data.results || [];
        renderSessions();
        renderRecent();
        updateStats();
    } catch (error) {
        $('#sessionsBody').innerHTML = emptyRow(5, 'No se pudo cargar el historial. Verifica la ruta de sesiones del API.');
        $('#recentSessionsBody').innerHTML = emptyRow(5, 'No fue posible cargar actividad.');
        showToast(error.message, true);
    }
}

function openUserDialog(user = null) {
    const dialog = $('#userDialog');
    const editing = Boolean(user);
    $('#dialogTitle').textContent = editing ? 'Editar usuario' : 'Nuevo usuario';
    $('#editUserId').value = user?.id || '';
    $('#formName').value = user?.nombre || '';
    $('#formEmail').value = user?.email || '';
    $('#formRole').value = user?.rol_id || state.roles[0]?.id || '';
    $('#formStatus').value = String(user?.estado ?? 1);
    $('#formPassword').value = '';
    $('#formPassword').required = !editing;
    $('#passwordHint').textContent = editing ? 'Déjalo vacío para conservar la contraseña actual.' : 'Mínimo 8 caracteres.';
    $('#passwordField').hidden = false;
    $('#statusField').hidden = !editing;
    $('#saveUser').textContent = editing ? 'Guardar cambios' : 'Crear usuario';
    $('#formError').hidden = true;
    $('#formError').textContent = '';
    dialog.showModal();
    $('#formName').focus();
}

async function saveUser(event) {
    event.preventDefault();
    const id = $('#editUserId').value;
    const body = {
        nombre: $('#formName').value.trim(),
        email: $('#formEmail').value.trim().toLocaleLowerCase('es'),
        rol_id: Number($('#formRole').value)
    };
    const password = $('#formPassword').value;
    if (password) body.password = password;
    if (id) body.estado = Number($('#formStatus').value);
    const button = $('#saveUser');
    button.disabled = true;
    button.textContent = 'Guardando...';
    try {
        await request(id ? `${API.users}/${encodeURIComponent(id)}` : API.users, {
            method: id ? 'PATCH' : 'POST',
            body: JSON.stringify(body)
        });
        $('#userDialog').close();
        showToast(id ? 'Los cambios se guardaron.' : 'El usuario fue creado.');
        await loadUsers();
    } catch (error) {
        $('#formError').textContent = error.message;
        $('#formError').hidden = false;
    } finally {
        button.disabled = false;
        button.textContent = id ? 'Guardar cambios' : 'Crear usuario';
    }
}

async function deleteUser(id) {
    const user = state.users.find((item) => String(item.id) === String(id));
    if (!user || !window.confirm(`¿Desactivar a ${user.nombre}? Se conservará su historial de sesiones.`)) return;
    try {
        await request(`${API.users}/${encodeURIComponent(id)}`, { method: 'DELETE' });
        showToast('El usuario fue desactivado.');
        await loadUsers();
    } catch (error) {
        showToast(error.message, true);
    }
}

function setView(name) {
    $$('.view').forEach((view) => {
        const active = view.id === `view-${name}`;
        view.classList.toggle('is-visible', active);
        view.hidden = !active;
    });
    $$('.nav-item').forEach((button) => button.classList.toggle('is-active', button.dataset.view === name));
    const activeNav = $(`.nav-item[data-view="${name}"]`);
    $('#currentSection').textContent = activeNav?.textContent.trim() || 'Resumen';
}

async function startAdmin() {
    try {
        const data = await request(API.session);
        if (!data.authenticated || !isAdmin(data.user)) {
            window.location.replace('/');
            return;
        }
        state.user = data.user;
        $('#adminName').textContent = data.user.nombre || 'Administrador';
        $('#adminAvatar').textContent = initials(data.user.nombre);
        $('#todayDate').textContent = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date());
        await Promise.all([loadRoles(), loadUsers(), loadSessions()]);
    } catch (error) {
        if (window.location.pathname !== '/') showToast(error.message, true);
    }
}

$$('.nav-item').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
$$('[data-go-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.goView)));
$$('[data-open-user]').forEach((button) => button.addEventListener('click', () => openUserDialog()));
$('#userForm').addEventListener('submit', saveUser);
$('#cancelDialog').addEventListener('click', () => $('#userDialog').close());
$('#closeDialog').addEventListener('click', () => $('#userDialog').close());
$('#userDialog').addEventListener('click', (event) => { if (event.target === $('#userDialog')) $('#userDialog').close(); });
$('#newRoleButton').addEventListener('click', () => openRoleDialog());
$('#roleForm').addEventListener('submit', saveRole);
$('#cancelRoleDialog').addEventListener('click', () => $('#roleDialog').close());
$('#closeRoleDialog').addEventListener('click', () => $('#roleDialog').close());
$('#roleDialog').addEventListener('click', (event) => { if (event.target === $('#roleDialog')) $('#roleDialog').close(); });
$('#usersBody').addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit-user]');
    const remove = event.target.closest('[data-delete-user]');
    if (edit) openUserDialog(state.users.find((user) => String(user.id) === edit.dataset.editUser));
    if (remove) deleteUser(remove.dataset.deleteUser);
});
$('#rolesBody').addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit-role]');
    const remove = event.target.closest('[data-delete-role]');
    if (edit) openRoleDialog(state.roles.find((role) => String(role.id) === edit.dataset.editRole));
    if (remove && !remove.disabled) deleteRole(remove.dataset.deleteRole);
});
$('#userSearch').addEventListener('input', renderUsers);
$('#roleFilter').addEventListener('change', renderUsers);
$('#statusFilter').addEventListener('change', renderUsers);
$('#sessionSearch').addEventListener('input', renderSessions);
$('#sessionStateFilter').addEventListener('change', renderSessions);
$('#refreshUsers').addEventListener('click', loadUsers);
$('#refreshSessions').addEventListener('click', loadSessions);
$('#signoutButton').addEventListener('click', async () => {
    try { await request(API.logout, { method: 'POST' }); } catch (error) { console.error(error); }
    window.location.replace('/');
});

startAdmin();
