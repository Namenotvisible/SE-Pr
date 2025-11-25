DROP DATABASE IF EXISTS SAU_Er_Transport;
CREATE DATABASE SAU_Er_Transport;
USE SAU_Er_Transport;

-- 1. Admin Table
CREATE TABLE admin (
    admin_id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role ENUM('super_admin', 'transport_manager') DEFAULT 'transport_manager',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL
);

-- 2. Auto (Vehicle) Table
CREATE TABLE auto (
    auto_id INT PRIMARY KEY AUTO_INCREMENT,
    registration_number VARCHAR(20) UNIQUE NOT NULL,
    auto_number VARCHAR(10) UNIQUE NOT NULL,
    model VARCHAR(50),
    capacity INT NOT NULL DEFAULT 4,
    current_location ENUM('Gate1', 'Gate2', 'Satbari', 'Hostel', 'AcademicBlock', 'OnRoute') DEFAULT 'Gate2',
    battery_level INT DEFAULT 100,
    is_available BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Auto Driver Table
CREATE TABLE auto_driver (
    driver_id INT PRIMARY KEY AUTO_INCREMENT,
    auto_id INT NULL,
    driver_code VARCHAR(10) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone_number VARCHAR(15) UNIQUE NOT NULL,
    license_number VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    experience_years INT DEFAULT 1,
    is_on_duty BOOLEAN DEFAULT TRUE,
    is_available BOOLEAN DEFAULT TRUE,
    current_status ENUM('available', 'on_break', 'off_duty', 'on_trip') DEFAULT 'available',
    total_rides_completed INT DEFAULT 0,
    average_rating DECIMAL(3,2) DEFAULT 4.50,
    joined_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (auto_id) REFERENCES auto(auto_id) ON DELETE SET NULL
);

-- 4. Student Table (Added password_hash!)
CREATE TABLE student (
    student_id INT PRIMARY KEY AUTO_INCREMENT,
    roll_number VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone_number VARCHAR(15),
    department VARCHAR(50),
    hostel_name VARCHAR(50),
    room_number VARCHAR(10),
    preferred_pickup_point ENUM('Gate1', 'Gate2', 'Satbari', 'Hostel', 'AcademicBlock') DEFAULT 'Gate2',
    total_rides_taken INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Ride Table (auto_id and driver_id are NULLABLE when status = 'requested')
CREATE TABLE ride (
    ride_id INT PRIMARY KEY AUTO_INCREMENT,
    student_id INT NOT NULL,
    auto_id INT NULL,
    driver_id INT NULL,
    pickup_point VARCHAR(50) NOT NULL,
    dropoff_point VARCHAR(50) NOT NULL,
    ride_date DATE NOT NULL,
    ride_time TIME NOT NULL,
    actual_start_time TIMESTAMP NULL,
    actual_end_time TIMESTAMP NULL,
    status ENUM('requested', 'accepted', 'in_progress', 'completed', 'cancelled') DEFAULT 'requested',
    fare DECIMAL(8,2) DEFAULT 20.00,
    rating_by_student TINYINT NULL,
    feedback_text TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES student(student_id) ON DELETE CASCADE,
    FOREIGN KEY (auto_id) REFERENCES auto(auto_id) ON DELETE SET NULL,
    FOREIGN KEY (driver_id) REFERENCES auto_driver(driver_id) ON DELETE SET NULL,
    INDEX idx_status (status),
    INDEX idx_date (ride_date)
);

-- Seed Data (Default password for all accounts: "password")
-- Bcrypt hash for "password": $2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi

INSERT INTO admin (username, password_hash, email, full_name, role) VALUES 
('admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin@sau.ac.in', 'SAU Transport Admin', 'super_admin');

INSERT INTO auto (registration_number, auto_number, model, capacity, current_location, battery_level) VALUES
('DL01AB1234', 'A1', 'Mahindra Treo Electric', 4, 'Gate2', 92),
('DL01CD5678', 'A2', 'Kinetic Green Safar', 4, 'Gate1', 85),
('DL01EF9012', 'A3', 'Yatri Super E-Ride', 4, 'Satbari', 78);

INSERT INTO auto_driver (auto_id, driver_code, full_name, email, phone_number, license_number, password_hash, experience_years, current_status, total_rides_completed, average_rating, joined_date) VALUES
(1, 'D1', 'Rajesh Kumar', 'rajesh.driver@sau.ac.in', '9876543210', 'DL123456789', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 3, 'available', 18, 4.80, '2024-01-15'),
(2, 'D2', 'Mohan Singh', 'mohan.driver@sau.ac.in', '9876543211', 'DL123456790', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 2, 'available', 12, 4.60, '2024-02-20'),
(3, 'D3', 'Suresh Patel', 'suresh.driver@sau.ac.in', '9876543212', 'DL123456791', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 4, 'on_break', 25, 4.90, '2024-01-10');

INSERT INTO student (roll_number, full_name, email, password_hash, phone_number, department, hostel_name, room_number, total_rides_taken) VALUES
('2023001', 'Amit Sharma', 'amit.sharma@sau.ac.in', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', '9876543213', 'CSE', 'Hostel-A', '101', 5),
('2023002', 'Priya Singh', 'priya.singh@sau.ac.in', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', '9876543214', 'ECE', 'Hostel-B', '205', 3),
('2023003', 'Rahul Verma', 'rahul.verma@sau.ac.in', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', '9876543215', 'Management', 'Hostel-A', '304', 2);

INSERT INTO ride (student_id, auto_id, driver_id, pickup_point, dropoff_point, ride_date, ride_time, status, fare, rating_by_student) VALUES
(1, 1, 1, 'Gate1', 'Gate2', CURDATE(), '09:15:00', 'completed', 20.00, 5),
(2, 2, 2, 'Satbari', 'Gate1', CURDATE(), '10:30:00', 'completed', 25.00, 4),
(1, NULL, NULL, 'Gate2', 'Satbari', CURDATE(), '14:00:00', 'requested', 25.00, NULL);