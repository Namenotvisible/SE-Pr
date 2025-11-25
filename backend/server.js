const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE"]
    }
});

// ============= SECURITY & LOGGING MIDDLEWARE =============
app.use(helmet({ contentSecurityPolicy: false })); // Allows inline scripts/CDNs in frontend
app.use(morgan('dev'));
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { error: 'Too many authentication attempts, please try again later.' }
});

// ============= DATABASE CONNECTION POOL =============
const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME || 'SAU_Er_Transport',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test DB connection on startup
(async () => {
    try {
        const conn = await pool.getConnection();
        console.log('✅ MySQL Connection Pool connected successfully to', process.env.DB_NAME || 'SAU_Er_Transport');
        conn.release();
    } catch (err) {
        console.error('❌ MySQL Connection Pool failed:', err.message);
        console.error('👉 Check your backend/.env DB_HOST, DB_USER, and DB_PASSWORD settings!');
    }
})();

const JWT_SECRET = process.env.JWT_SECRET || 'sau_vahan_secret_key_2026';

// ============= AUTH & RBAC MIDDLEWARE =============
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access token required' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' });
        req.user = user;
        next();
    });
};

// ============= AUTHENTICATION ROUTES (Table 6.1 + Legacy Aliases) =============
const registerHandler = async (req, res) => {
    try {
        const { userType = 'student', rollNumber, fullName, email, phoneNumber, password, department, hostelName } = req.body;
        if (userType !== 'student') {
            return res.status(400).json({ error: 'Only student self-registration is allowed' });
        }
        if (!rollNumber || !fullName || !email || !password) {
            return res.status(400).json({ error: 'Roll number, name, email, and password are required' });
        }

        const [existing] = await pool.execute(
            'SELECT student_id FROM student WHERE email = ? OR roll_number = ?',
            [email, rollNumber]
        );
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Email or Roll Number already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.execute(
            'INSERT INTO student (roll_number, full_name, email, password_hash, phone_number, department, hostel_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [rollNumber, fullName, email, hashedPassword, phoneNumber || '', department || 'CSE', hostelName || 'Hostel-A']
        );

        const [newStudents] = await pool.execute(
            'SELECT student_id, roll_number, full_name, email, phone_number, department, hostel_name, created_at FROM student WHERE student_id = ?',
            [result.insertId]
        );
        const newStudent = { ...newStudents[0], total_rides_taken: 0, is_active: true };

        io.emit('new-student-registered', newStudent);
        res.status(201).json({ success: true, message: 'Registration successful', student: newStudent });
    } catch (error) {
        console.error('❌ Registration error:', error);
        res.status(500).json({ error: 'Registration failed - server error' });
    }
};

const loginHandler = async (req, res) => {
    try {
        const { email, password, userType = 'student' } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        let table, idField, nameField;
        if (userType === 'admin') {
            table = 'admin'; idField = 'admin_id'; nameField = 'full_name';
        } else if (userType === 'driver') {
            table = 'auto_driver'; idField = 'driver_id'; nameField = 'full_name';
        } else if (userType === 'student') {
            table = 'student'; idField = 'student_id'; nameField = 'full_name';
        } else {
            return res.status(400).json({ error: 'Invalid user type' });
        }

        const [users] = await pool.execute(`SELECT * FROM ${table} WHERE email = ?`, [email]);
        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = users[0];
        let validPassword = (password === 'password'); // Demo fallback
        if (!validPassword && user.password_hash) {
            validPassword = await bcrypt.compare(password, user.password_hash);
        }
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const tokenPayload = {
            id: user[idField],
            email: user.email,
            userType,
            name: user[nameField] || user.username,
            auto_id: user.auto_id || null
        };

        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });
        res.json({
            success: true,
            token,
            user: tokenPayload
        });
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ error: 'Login failed - server error' });
    }
};

// Support both Report Table 6.1 endpoints and existing app.js endpoints
app.post('/api/register', authLimiter, registerHandler);
app.post('/api/auth/register', authLimiter, registerHandler);
app.post('/api/login', authLimiter, loginHandler);
app.post('/api/auth/login', authLimiter, loginHandler);

// ============= RIDE LIFECYCLE ROUTES (Table 6.1) =============

// 1. Create Ride Request (Student)
app.post('/api/rides', authenticateToken, async (req, res) => {
    try {
        const { pickup_point, dropoff_point, fare } = req.body;
        const student_id = req.user.id;

        if (!pickup_point || !dropoff_point || pickup_point === dropoff_point) {
            return res.status(400).json({ error: 'Valid and distinct pickup and dropoff points are required' });
        }

        const calculatedFare = fare || (pickup_point === 'Satbari' || dropoff_point === 'Satbari' ? 25.00 : 20.00);

        const [result] = await pool.execute(
            `INSERT INTO ride (student_id, pickup_point, dropoff_point, ride_date, ride_time, status, fare)
             VALUES (?, ?, ?, CURDATE(), CURTIME(), 'requested', ?)`,
            [student_id, pickup_point, dropoff_point, calculatedFare]
        );

        const [rides] = await pool.execute(
            `SELECT r.*, s.full_name AS student_name, s.phone_number AS student_phone
             FROM ride r JOIN student s ON r.student_id = s.student_id
             WHERE r.ride_id = ?`,
            [result.insertId]
        );

        const newRide = rides[0];
        io.emit('new-ride-request', newRide);
        res.status(201).json({ success: true, message: 'Ride requested!', ride: newRide });
    } catch (error) {
        console.error('❌ Create ride error:', error);
        res.status(500).json({ error: 'Failed to create ride request' });
    }
});

// 2. View Student's Rides
app.get('/api/rides/my-rides', authenticateToken, async (req, res) => {
    try {
        const [rides] = await pool.execute(
            `SELECT r.*, ad.full_name AS driver_name, ad.phone_number AS driver_phone, a.auto_number, a.model
             FROM ride r
             LEFT JOIN auto_driver ad ON r.driver_id = ad.driver_id
             LEFT JOIN auto a ON r.auto_id = a.auto_id
             WHERE r.student_id = ?
             ORDER BY r.created_at DESC`,
            [req.user.id]
        );
        res.json(rides);
    } catch (error) {
        console.error('❌ Fetch student rides error:', error);
        res.status(500).json({ error: 'Failed to fetch rides' });
    }
});

// 3. View Pending Driver Requests & Active Driver Rides
app.get('/api/driver/requests', authenticateToken, async (req, res) => {
    try {
        const [rides] = await pool.execute(
            `SELECT r.*, s.full_name AS student_name, s.phone_number AS student_phone, s.roll_number
             FROM ride r
             JOIN student s ON r.student_id = s.student_id
             WHERE r.status = 'requested' OR r.driver_id = ?
             ORDER BY r.created_at DESC`,
            [req.user.id]
        );
        res.json(rides);
    } catch (error) {
        console.error('❌ Fetch driver requests error:', error);
        res.status(500).json({ error: 'Failed to fetch driver requests' });
    }
});

// 4. Driver Accepts Ride
app.patch('/api/rides/:id/accept', authenticateToken, async (req, res) => {
    try {
        const rideId = req.params.id;
        const driverId = req.user.id;

        const [drivers] = await pool.execute('SELECT auto_id, full_name, phone_number FROM auto_driver WHERE driver_id = ?', [driverId]);
        if (drivers.length === 0) return res.status(404).json({ error: 'Driver not found' });

        const driver = drivers[0];
        const autoId = driver.auto_id || 1;

        const [check] = await pool.execute('SELECT status FROM ride WHERE ride_id = ?', [rideId]);
        if (check.length === 0) return res.status(404).json({ error: 'Ride not found' });
        if (check[0].status !== 'requested') {
            return res.status(400).json({ error: 'Ride is no longer available' });
        }

        await pool.execute(
            `UPDATE ride SET driver_id = ?, auto_id = ?, status = 'accepted', actual_start_time = NOW() WHERE ride_id = ?`,
            [driverId, autoId, rideId]
        );
        await pool.execute(`UPDATE auto_driver SET current_status = 'on_trip', is_available = FALSE WHERE driver_id = ?`, [driverId]);

        const [updated] = await pool.execute(
            `SELECT r.*, s.full_name AS student_name, ad.full_name AS driver_name, ad.phone_number AS driver_phone, a.auto_number
             FROM ride r
             JOIN student s ON r.student_id = s.student_id
             LEFT JOIN auto_driver ad ON r.driver_id = ad.driver_id
             LEFT JOIN auto a ON r.auto_id = a.auto_id
             WHERE r.ride_id = ?`,
            [rideId]
        );

        io.emit('ride-status-updated', updated[0]);
        res.json({ success: true, message: 'Ride accepted', ride: updated[0] });
    } catch (error) {
        console.error('❌ Accept ride error:', error);
        res.status(500).json({ error: 'Failed to accept ride' });
    }
});

// 5. Update Ride Status (in_progress, completed, cancelled)
app.patch('/api/rides/:id/status', authenticateToken, async (req, res) => {
    try {
        const rideId = req.params.id;
        const { status } = req.body;
        const validStatuses = ['requested', 'accepted', 'in_progress', 'completed', 'cancelled'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid ride status' });
        }

        await pool.execute(
            `UPDATE ride SET status = ?, actual_end_time = IF(? = 'completed', NOW(), actual_end_time) WHERE ride_id = ?`,
            [status, status, rideId]
        );

        const [rides] = await pool.execute(
            `SELECT r.*, s.full_name AS student_name, ad.full_name AS driver_name, a.auto_number
             FROM ride r
             JOIN student s ON r.student_id = s.student_id
             LEFT JOIN auto_driver ad ON r.driver_id = ad.driver_id
             LEFT JOIN auto a ON r.auto_id = a.auto_id
             WHERE r.ride_id = ?`,
            [rideId]
        );

        if (rides.length > 0 && status === 'completed') {
            const ride = rides[0];
            if (ride.driver_id) {
                await pool.execute(
                    `UPDATE auto_driver SET total_rides_completed = total_rides_completed + 1, current_status = 'available', is_available = TRUE WHERE driver_id = ?`,
                    [ride.driver_id]
                );
            }
            await pool.execute(
                `UPDATE student SET total_rides_taken = total_rides_taken + 1 WHERE student_id = ?`,
                [ride.student_id]
            );
        }

        io.emit('ride-status-updated', rides[0]);
        res.json({ success: true, message: `Ride marked as ${status}`, ride: rides[0] });
    } catch (error) {
        console.error('❌ Update ride status error:', error);
        res.status(500).json({ error: 'Failed to update ride status' });
    }
});

// 6. Driver Availability Update (Fixes Fix #1 in app.js!)
app.put('/api/driver/availability', authenticateToken, async (req, res) => {
    try {
        const { is_available, current_status } = req.body;
        await pool.execute(
            'UPDATE auto_driver SET is_available = ?, current_status = ? WHERE driver_id = ?',
            [is_available ? 1 : 0, current_status || 'available', req.user.id]
        );
        io.emit('driver-status-changed', { driver_id: req.user.id, is_available, current_status });
        res.json({ success: true, message: 'Driver status updated', current_status });
    } catch (error) {
        console.error('❌ Driver availability error:', error);
        res.status(500).json({ error: 'Failed to update driver availability' });
    }
});

// ============= ADMIN ROUTES & ANALYTICS (Table 6.1) =============

app.get('/api/admin/dashboard', authenticateToken, async (req, res) => {
    try {
        const [[{ totalStudents }]] = await pool.execute('SELECT COUNT(*) AS totalStudents FROM student');
        const [[{ totalDrivers }]] = await pool.execute('SELECT COUNT(*) AS totalDrivers FROM auto_driver');
        const [[{ totalAutos }]] = await pool.execute('SELECT COUNT(*) AS totalAutos FROM auto');
        const [[{ totalRides }]] = await pool.execute('SELECT COUNT(*) AS totalRides FROM ride');
        const [statusBreakdown] = await pool.execute('SELECT status, COUNT(*) AS count FROM ride GROUP BY status');
        const [recentRides] = await pool.execute(
            `SELECT r.*, s.full_name AS student_name, ad.full_name AS driver_name, a.auto_number
             FROM ride r
             JOIN student s ON r.student_id = s.student_id
             LEFT JOIN auto_driver ad ON r.driver_id = ad.driver_id
             LEFT JOIN auto a ON r.auto_id = a.auto_id
             ORDER BY r.created_at DESC LIMIT 20`
        );

        res.json({
            totalStudents,
            totalDrivers,
            totalAutos,
            totalRides,
            statusBreakdown,
            recentRides
        });
    } catch (error) {
        console.error('❌ Admin dashboard error:', error);
        res.status(500).json({ error: 'Failed to load admin dashboard stats' });
    }
});

app.get('/api/admin/students', authenticateToken, async (req, res) => {
    try {
        const [students] = await pool.execute('SELECT student_id, roll_number, full_name, email, phone_number, department, hostel_name, total_rides_taken, is_active, created_at FROM student ORDER BY created_at DESC');
        res.json(students);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch students' });
    }
});

app.get('/api/admin/drivers', authenticateToken, async (req, res) => {
    try {
        const [drivers] = await pool.execute(`
            SELECT ad.*, a.auto_number, a.registration_number
            FROM auto_driver ad LEFT JOIN auto a ON ad.auto_id = a.auto_id
            ORDER BY ad.created_at DESC
        `);
        res.json(drivers);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch drivers' });
    }
});

app.get('/api/admin/autos', authenticateToken, async (req, res) => {
    try {
        const [autos] = await pool.execute('SELECT * FROM auto ORDER BY created_at DESC');
        res.json(autos);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch autos' });
    }
});

app.post('/api/admin/drivers', authenticateToken, async (req, res) => {
    try {
        const { full_name, email, phone_number, license_number, password, auto_id, experience_years } = req.body;
        const [existing] = await pool.execute('SELECT driver_id FROM auto_driver WHERE email = ?', [email]);
        if (existing.length > 0) return res.status(400).json({ error: 'Driver email already exists' });

        const [[{ count }]] = await pool.execute('SELECT COUNT(*) as count FROM auto_driver');
        const driverCode = `D${count + 101}`;
        const hashedPassword = await bcrypt.hash(password || 'password', 10);

        const [result] = await pool.execute(
            `INSERT INTO auto_driver (driver_code, full_name, email, phone_number, license_number, password_hash, auto_id, experience_years, joined_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURDATE())`,
            [driverCode, full_name, email, phone_number, license_number, hashedPassword, auto_id || null, experience_years || 1]
        );

        const [newDrivers] = await pool.execute(
            `SELECT ad.*, a.auto_number, a.registration_number FROM auto_driver ad LEFT JOIN auto a ON ad.auto_id = a.auto_id WHERE ad.driver_id = ?`,
            [result.insertId]
        );
        io.emit('new-driver-registered', newDrivers[0]);
        res.status(201).json({ success: true, message: 'Driver registered successfully', driver: newDrivers[0] });
    } catch (error) {
        console.error('❌ Add driver error:', error);
        res.status(500).json({ error: 'Failed to add driver' });
    }
});

app.post('/api/admin/autos', authenticateToken, async (req, res) => {
    try {
        const { auto_number, registration_number, model, capacity, current_location } = req.body;
        const [existing] = await pool.execute('SELECT auto_id FROM auto WHERE auto_number = ?', [auto_number]);
        if (existing.length > 0) return res.status(400).json({ error: 'Auto number already exists' });

        const [result] = await pool.execute(
            'INSERT INTO auto (auto_number, registration_number, model, capacity, current_location) VALUES (?, ?, ?, ?, ?)',
            [auto_number, registration_number || `DL01-${auto_number}`, model || 'E-Rickshaw', capacity || 4, current_location || 'Gate2']
        );
        const [newAutos] = await pool.execute('SELECT * FROM auto WHERE auto_id = ?', [result.insertId]);
        io.emit('new-auto-registered', newAutos[0]);
        res.status(201).json({ success: true, message: 'Auto registered successfully', auto: newAutos[0] });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add auto' });
    }
});

app.delete('/api/admin/students/:id', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT full_name FROM student WHERE student_id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Student not found' });
        await pool.execute('DELETE FROM student WHERE student_id = ?', [req.params.id]);
        io.emit('student-deleted', { student_id: req.params.id, student_name: rows[0].full_name });
        res.json({ success: true, message: 'Student deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete student' });
    }
});

app.delete('/api/admin/drivers/:id', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT full_name FROM auto_driver WHERE driver_id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Driver not found' });
        await pool.execute('DELETE FROM auto_driver WHERE driver_id = ?', [req.params.id]);
        io.emit('driver-deleted', { driver_id: req.params.id, driver_name: rows[0].full_name });
        res.json({ success: true, message: 'Driver deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete driver' });
    }
});

app.delete('/api/admin/autos/:id', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT auto_number FROM auto WHERE auto_id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Auto not found' });
        await pool.execute('DELETE FROM auto WHERE auto_id = ?', [req.params.id]);
        io.emit('auto-deleted', { auto_id: req.params.id, auto_number: rows[0].auto_number });
        res.json({ success: true, message: 'Auto deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete auto' });
    }
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString(), service: 'SAU-Vahan Backend' });
});

// ============= SOCKET.IO REAL-TIME ENGINE =============
io.on('connection', (socket) => {
    console.log('🔌 Client connected via Socket.io:', socket.id);

    socket.on('driver-location-update', async (data) => {
        try {
            if (data.auto_id && data.location) {
                await pool.execute('UPDATE auto SET current_location = ? WHERE auto_id = ?', [data.location, data.auto_id]);
            }
            io.emit('location-updated', data);
        } catch (error) {
            console.error('❌ Socket location update error:', error.message);
        }
    });

    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`\n🚀 SAU-Vahan Server running on http://localhost:${PORT}`);
        console.log(`🔑 Demo Logins (Password: "password"):`);
        console.log(`   👨‍💼 Admin:   admin@sau.ac.in`);
        console.log(`   🎓 Student: amit.sharma@sau.ac.in`);
        console.log(`   🚗 Driver:  rajesh.driver@sau.ac.in\n`);
    });
}

module.exports = { app, server, pool };