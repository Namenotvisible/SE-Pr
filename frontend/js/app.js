let currentUser = null;
let authToken = null;
let selectedPortalRole = 'student';

const BACKEND_ORIGIN = window.location.port === '3000' ? window.location.origin : 'http://localhost:3000';
const API_BASE_URL = `${BACKEND_ORIGIN}/api`;
let socket = null;

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupAuthListeners();
});

function initializeApp() {
    const savedToken = localStorage.getItem('authToken');
    const savedUser = localStorage.getItem('currentUser');
    if (savedToken && savedUser) {
        try {
            authToken = savedToken;
            currentUser = JSON.parse(savedUser);
            showApp();
        } catch (e) {
            logout();
        }
    } else {
        showLanding();
    }
    initializeRealTimeConnection();
}

function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    const iconClass = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    document.getElementById('theme-icon').className = iconClass;
    const appIcon = document.getElementById('app-theme-icon');
    if (appIcon) appIcon.className = iconClass;
}

function openAuthModal(role = 'student') {
    document.getElementById('landing-section').classList.add('hidden');
    document.getElementById('auth-modal').classList.remove('hidden');
    switchPortalRole(role);
}

function closeAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
    document.getElementById('landing-section').classList.remove('hidden');
}

function showLanding() {
    document.getElementById('landing-section').classList.remove('hidden');
    document.getElementById('auth-modal').classList.add('hidden');
    document.getElementById('app-section').classList.add('hidden');
}

function switchPortalRole(role) {
    selectedPortalRole = role;
    document.querySelectorAll('.user-type-btn').forEach(btn => btn.classList.remove('active'));
    event?.currentTarget?.classList.add('active');

    const titles = { student: 'Student Portal Login', driver: 'Driver Portal Login', admin: 'Admin Portal Login' };
    document.getElementById('modal-title').textContent = titles[role];
    document.getElementById('student-reg-toggle').style.display = role === 'student' ? 'block' : 'none';
}

function setupAuthListeners() {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;

            try {
                const res = await fetch(`${API_BASE_URL}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, userType: selectedPortalRole })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    authToken = data.token;
                    currentUser = data.user;
                    localStorage.setItem('authToken', authToken);
                    localStorage.setItem('currentUser', JSON.stringify(currentUser));
                    closeAuthModal();
                    showApp();
                    showNotification(`Welcome back, ${currentUser.name}!`, 'success');
                } else {
                    showNotification(data.error || 'Login failed', 'error');
                }
            } catch (err) {
                showNotification('Server connection error', 'error');
            }
        });
    }

    const rideForm = document.getElementById('request-ride-form');
    if (rideForm) {
        rideForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const pickup_point = document.getElementById('pickup-point').value;
            const dropoff_point = document.getElementById('dropoff-point').value;

            if (pickup_point === dropoff_point) {
                showNotification('Pickup and dropoff cannot be the same', 'error');
                return;
            }

            try {
                const res = await fetch(`${API_BASE_URL}/rides`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pickup_point, dropoff_point })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    showNotification('Free campus ride requested successfully!', 'success');
                    loadStudentRides();
                } else {
                    showNotification(data.error || 'Failed to request ride', 'error');
                }
            } catch (err) {
                showNotification('Error requesting ride', 'error');
            }
        });
    }

    // Admin Add Driver & Auto form listeners
    const addDriverForm = document.getElementById('add-driver-form');
    if (addDriverForm) {
        addDriverForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const full_name = document.getElementById('admin-driver-name').value;
            const email = document.getElementById('admin-driver-email').value;
            const phone_number = document.getElementById('admin-driver-phone').value;
            const license_number = document.getElementById('admin-driver-license').value;

            const res = await fetch(`${API_BASE_URL}/admin/drivers`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ full_name, email, phone_number, license_number, password: 'password' })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showNotification('Driver registered successfully!', 'success');
                addDriverForm.reset();
                loadAdminDrivers();
            } else {
                showNotification(data.error || 'Failed to add driver', 'error');
            }
        });
    }

    const addAutoForm = document.getElementById('add-auto-form');
    if (addAutoForm) {
        addAutoForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const auto_number = document.getElementById('admin-auto-number').value;
            const model = document.getElementById('admin-auto-type').value;
            const capacity = document.getElementById('admin-auto-capacity').value;
            const current_location = document.getElementById('admin-auto-location').value;

            const res = await fetch(`${API_BASE_URL}/admin/autos`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ auto_number, model, capacity, current_location })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showNotification('Vehicle registered successfully!', 'success');
                addAutoForm.reset();
                loadAdminDashboard();
            } else {
                showNotification(data.error || 'Failed to add vehicle', 'error');
            }
        });
    }
}

function showApp() {
    document.getElementById('landing-section').classList.add('hidden');
    document.getElementById('auth-modal').classList.add('hidden');
    document.getElementById('app-section').classList.remove('hidden');

    if (currentUser) {
        document.getElementById('user-name').textContent = currentUser.name;
        document.getElementById('app-portal-title').textContent = `SAU-Vahan (${currentUser.userType.toUpperCase()})`;
    }

    document.querySelectorAll('.dashboard-content').forEach(d => d.classList.add('hidden'));
    document.getElementById(`${currentUser.userType}-dashboard`).classList.remove('hidden');

    if (currentUser.userType === 'admin') loadAdminDashboard();
    else if (currentUser.userType === 'driver') loadDriverRequests();
    else if (currentUser.userType === 'student') loadStudentRides();

    // Initialize Leaflet Maps
    if (typeof initializeAllMaps === 'function') {
        initializeAllMaps();
    }
}

function logout() {
    authToken = null;
    currentUser = null;
    localStorage.clear();
    showLanding();
    showNotification('Logged out successfully', 'info');
}

function initializeRealTimeConnection() {
    if (typeof io !== 'undefined') {
        socket = io(BACKEND_ORIGIN);
        
        socket.on('new-ride-request', () => { if (currentUser?.userType === 'driver') loadDriverRequests(); });
        
        socket.on('ride-status-updated', () => {
            if (currentUser?.userType === 'student') loadStudentRides();
            if (currentUser?.userType === 'driver') loadDriverRequests();
            if (currentUser?.userType === 'admin') loadAdminDashboard();
        });

        socket.on('location-updated', (data) => {
            if (studentMap) studentMap.updateSingleAuto(data.auto_id || data.driver_id, data.location);
            if (adminMap) adminMap.updateSingleAuto(data.auto_id || data.driver_id, data.location);
        });
    }
}

function broadcastDriverLocation(locationName) {
    if (!locationName) return;
    if (socket && currentUser?.userType === 'driver') {
        socket.emit('driver-location-update', {
            driver_id: currentUser.id,
            location: locationName,
            auto_number: currentUser.auto_number || 'A1'
        });
        showNotification(`Broadcasted live location: ${formatLocation(locationName)}`, 'success');
    }
}

// Data Loaders & Management
async function loadStudentRides() {
    const res = await fetch(`${API_BASE_URL}/rides/my-rides`, { headers: { 'Authorization': `Bearer ${authToken}` } });
    if (!res.ok) return;
    const rides = await res.json();
    const container = document.getElementById('student-rides-list');
    if (!container) return;

    if (rides.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted)">No rides requested yet.</p>`;
        return;
    }

    container.innerHTML = rides.map(r => `
        <div style="padding:10px; margin-bottom:8px; border:1px solid var(--border-color); border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <strong>${formatLocation(r.pickup_point)} ➔ ${formatLocation(r.dropoff_point)}</strong>
                <div style="font-size:0.8rem; color:var(--text-muted);">Driver: ${r.driver_name || 'Pending assignment'}</div>
            </div>
            <span class="status-badge status-${r.status}">${r.status}</span>
        </div>
    `).join('');
}

async function loadDriverRequests() {
    const res = await fetch(`${API_BASE_URL}/driver/requests`, { headers: { 'Authorization': `Bearer ${authToken}` } });
    if (!res.ok) return;
    const rides = await res.json();
    const container = document.getElementById('driver-requests-list');
    if (!container) return;

    if (rides.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted)">No active ride requests.</p>`;
        return;
    }

    container.innerHTML = rides.map(r => `
        <div style="padding:10px; margin-bottom:8px; border:1px solid var(--border-color); border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <strong>${formatLocation(r.pickup_point)} ➔ ${formatLocation(r.dropoff_point)}</strong>
                <div style="font-size:0.8rem; color:var(--text-muted);">Student: ${r.student_name} (${r.student_phone || 'N/A'})</div>
            </div>
            <div style="display:flex; gap:6px;">
                ${r.status === 'requested' ? `<button class="btn-primary" style="padding:4px 10px; font-size:0.8rem;" onclick="acceptRide(${r.ride_id})">Accept</button>` : ''}
                ${r.status === 'accepted' ? `<button class="btn-primary" style="padding:4px 10px; font-size:0.8rem;" onclick="updateRideStatus(${r.ride_id}, 'in_progress')">Start</button>` : ''}
                ${r.status === 'in_progress' ? `<button class="btn-primary" style="padding:4px 10px; font-size:0.8rem; background:var(--success)" onclick="updateRideStatus(${r.ride_id}, 'completed')">Complete</button>` : ''}
                <span class="status-badge status-${r.status}">${r.status}</span>
            </div>
        </div>
    `).join('');
}

async function acceptRide(id) {
    await fetch(`${API_BASE_URL}/rides/${id}/accept`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${authToken}` } });
    loadDriverRequests();
    showNotification('Ride accepted!', 'success');
}

async function updateRideStatus(id, status) {
    await fetch(`${API_BASE_URL}/rides/${id}/status`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
    });
    loadDriverRequests();
    showNotification(`Ride status updated to ${status}`, 'success');
}

async function updateDriverStatus(status) {
    if (!currentUser || currentUser.userType !== 'driver') return;
    const res = await fetch(`${API_BASE_URL}/driver/availability`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_available: status === 'available', current_status: status })
    });
    const data = await res.json();
    if (res.ok && data.success) {
        document.querySelectorAll('.status-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-status="${status}"]`)?.classList.add('active');
        document.getElementById('current-driver-status').textContent = formatDriverStatus(status);
        showNotification(`Status updated to ${formatDriverStatus(status)}`, 'success');
    }
}

async function loadAdminDashboard() {
    const res = await fetch(`${API_BASE_URL}/admin/dashboard`, { headers: { 'Authorization': `Bearer ${authToken}` } });
    if (!res.ok) return;
    const stats = await res.json();
    document.getElementById('total-students').textContent = stats.totalStudents;
    document.getElementById('total-drivers').textContent = stats.totalDrivers;
    document.getElementById('total-rides').textContent = stats.totalRides;
    loadAdminStudents();
    loadAdminDrivers();
}

async function loadAdminStudents() {
    const res = await fetch(`${API_BASE_URL}/admin/students`, { headers: { 'Authorization': `Bearer ${authToken}` } });
    const students = await res.json();
    document.getElementById('students-tbody').innerHTML = students.map(s => `
        <tr><td>${s.roll_number}</td><td>${s.full_name}</td><td>${s.email}</td><td>${s.department || '-'}</td><td>${s.hostel_name || '-'}</td><td>${s.total_rides_taken}</td><td><button class="btn-secondary" style="padding:2px 6px; color:var(--danger)" onclick="deleteStudent(${s.student_id})">Delete</button></td></tr>
    `).join('');
}

async function loadAdminDrivers() {
    const res = await fetch(`${API_BASE_URL}/admin/drivers`, { headers: { 'Authorization': `Bearer ${authToken}` } });
    const drivers = await res.json();
    document.getElementById('drivers-tbody').innerHTML = drivers.map(d => `
        <tr><td>${d.driver_code}</td><td>${d.full_name}</td><td>${d.phone_number}</td><td>${d.auto_number || 'Unassigned'}</td><td><span class="status-badge status-${d.current_status}">${d.current_status}</span></td><td>${d.total_rides_completed}</td><td><button class="btn-secondary" style="padding:2px 6px; color:var(--danger)" onclick="deleteDriver(${d.driver_id})">Delete</button></td></tr>
    `).join('');
}

async function deleteStudent(id) {
    if(!confirm('Delete student?')) return;
    await fetch(`${API_BASE_URL}/admin/students/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${authToken}` } });
    loadAdminStudents();
}

async function deleteDriver(id) {
    if(!confirm('Delete driver?')) return;
    await fetch(`${API_BASE_URL}/admin/drivers/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${authToken}` } });
    loadAdminDrivers();
}

function formatDriverStatus(status) {
    return { available: 'Available', on_break: 'On Break', off_duty: 'Off Duty', on_trip: 'On Trip' }[status] || status;
}

function formatLocation(location) {
    return { Gate1: 'Gate 1', Gate2: 'Gate 2', Satbari: 'Satbari', Hostel: 'Hostel Block', AcademicBlock: 'Academic Block', OnRoute: 'On Route' }[location] || location;
}

function showNotification(msg, type = 'info') {
    document.querySelectorAll('.notification').forEach(n => n.remove());
    const n = document.createElement('div');
    n.className = `notification`;
    n.textContent = msg;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 3500);
}

function toggleRegisterView(show) {
    const loginForm = document.getElementById('login-form');
    const modalTitle = document.getElementById('modal-title');
    const regToggle = document.getElementById('student-reg-toggle');
    
    // Check if we already injected a registration form or need to show/hide fields
    let regForm = document.getElementById('dynamic-register-form');
    
    if (show) {
        if (loginForm) loginForm.style.display = 'none';
        if (regToggle) regToggle.style.display = 'none';
        if (modalTitle) modalTitle.textContent = 'Student Registration';
        
        if (!regForm) {
            regForm = document.createElement('form');
            regForm.id = 'dynamic-register-form';
            regForm.innerHTML = `
                <div class="form-group"><label>Roll Number</label><input type="text" id="reg-roll" class="form-control" required placeholder="2023004"></div>
                <div class="form-group"><label>Full Name</label><input type="text" id="reg-name" class="form-control" required placeholder="Your Name"></div>
                <div class="form-group"><label>Email</label><input type="email" id="reg-email" class="form-control" required placeholder="student@sau.ac.in"></div>
                <div class="form-group"><label>Department</label><input type="text" id="reg-dept" class="form-control" placeholder="CSE"></div>
                <div class="form-group"><label>Hostel Name</label><input type="text" id="reg-hostel" class="form-control" placeholder="Hostel-A"></div>
                <div class="form-group"><label>Password</label><input type="password" id="reg-pass" class="form-control" required placeholder="••••••••"></div>
                <button type="button" class="btn-primary" onclick="submitDynamicRegister()" style="margin-top:0.5rem;">Register Now</button>
                <button type="button" class="btn-secondary" onclick="toggleRegisterView(false)" style="margin-top:0.5rem; width:100%;">Back to Login</button>
            `;
            document.getElementById('auth-modal').querySelector('.auth-card').appendChild(regForm);
        } else {
            regForm.style.display = 'block';
        }
    } else {
        if (loginForm) loginForm.style.display = 'block';
        if (regToggle) regToggle.style.display = 'block';
        if (modalTitle) modalTitle.textContent = 'Student Portal Login';
        if (regForm) regForm.style.display = 'none';
    }
}

async function submitDynamicRegister() {
    const rollNumber = document.getElementById('reg-roll').value;
    const fullName = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const department = document.getElementById('reg-dept').value;
    const hostelName = document.getElementById('reg-hostel').value;
    const password = document.getElementById('reg-pass').value;

    try {
        const res = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userType: 'student', rollNumber, fullName, email, password, department, hostelName })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showNotification('Registration successful! Please login.', 'success');
            toggleRegisterView(false);
        } else {
            showNotification(data.error || 'Registration failed', 'error');
        }
    } catch (e) {
        showNotification('Connection error', 'error');
    }
}

async function quickDemoLogin(email, password, userType) {
    selectedPortalRole = userType;
    try {
        const res = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, userType })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            closeAuthModal();
            showApp();
            showNotification(`Logged in instantly as ${userType}!`, 'success');
        } else {
            showNotification(data.error || 'Quick login failed', 'error');
        }
    } catch (e) {
        showNotification('Connection error', 'error');
    }
}
window.quickDemoLogin = quickDemoLogin;

window.toggleRegisterView = toggleRegisterView;
window.submitDynamicRegister = submitDynamicRegister;
window.toggleTheme = toggleTheme;
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.switchPortalRole = switchPortalRole;
window.logout = logout;
window.acceptRide = acceptRide;
window.updateRideStatus = updateRideStatus;
window.updateDriverStatus = updateDriverStatus;
window.broadcastDriverLocation = broadcastDriverLocation;
window.deleteStudent = deleteStudent;
window.deleteDriver = deleteDriver;
window.loadAdminStudents = loadAdminStudents;
window.loadAdminDrivers = loadAdminDrivers;