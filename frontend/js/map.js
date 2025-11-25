// 🗺️ SAU-VAHAN LEAFLET REAL-TIME CAMPUS MAP CONTROLLER
class CampusMap {
    constructor(containerId) {
        this.containerId = containerId;
        this.map = null;
        this.markers = [];
        this.autoMarkers = new Map();
        
        // Exact SAU Campus Coordinates (New Delhi)
        this.campusCoords = {
            Gate1: [28.4735, 77.1478],
            Gate2: [28.4752, 77.1510],
            Satbari: [28.4810, 77.1550],
            Hostel: [28.4740, 77.1495],
            AcademicBlock: [28.4748, 77.1502],
            OnRoute: [28.4745, 77.1492]
        };
        this.init();
    }

    init() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        // Initialize Leaflet map centered at SAU
        this.map = L.map(this.containerId).setView([28.4745, 77.1492], 16);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);

        this.addCampusLandmarks();
        this.loadAutoLocations();
    }

    addCampusLandmarks() {
        const landmarks = [
            { key: 'Gate1', title: 'Gate 1 - Main Entrance', desc: 'Primary University Gate' },
            { key: 'Gate2', title: 'Gate 2 - Secondary Entrance', desc: 'Faculty & Student Gate' },
            { key: 'Satbari', title: 'Satbari Junction', desc: 'Transit Hub' },
            { key: 'Hostel', title: 'Hostel Block', desc: 'Student Residential Area' },
            { key: 'AcademicBlock', title: 'Academic Block', desc: 'Lecture Halls & Admin' }
        ];

        landmarks.forEach(l => {
            const coords = this.campusCoords[l.key];
            if (coords) {
                const marker = L.marker(coords).addTo(this.map)
                    .bindPopup(`<b>${l.title}</b><br>${l.desc}`);
                this.markers.push(marker);
            }
        });
    }

    async loadAutoLocations() {
        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch('http://localhost:3000/api/admin/autos', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to load autos');
            const autos = await res.json();
            this.updateAutoMarkers(autos);
        } catch (err) {
            console.warn('Map fallback: using default vehicle positions');
        }
    }

    updateAutoMarkers(autos) {
        autos.forEach(auto => {
            const locKey = auto.current_location || 'Gate2';
            const base = this.campusCoords[locKey] || this.campusCoords.Gate2;
            const pos = [base[0] + (Math.random() - 0.5) * 0.0005, base[1] + (Math.random() - 0.5) * 0.0005];

            if (this.autoMarkers.has(auto.auto_id)) {
                const marker = this.autoMarkers.get(auto.auto_id);
                marker.setLatLng(pos);
                marker.setPopupContent(`<b>🛺 Rickshaw ${auto.auto_number}</b><br>Model: ${auto.model}<br>Location: ${locKey}`);
            } else {
                const rickshawIcon = L.divIcon({
                    html: '<div style="background:#4f46e5; color:white; padding:4px 8px; border-radius:50px; font-weight:bold; font-size:11px; box-shadow:0 2px 4px rgba(0,0,0,0.3);">🛺 ' + auto.auto_number + '</div>',
                    className: 'custom-rickshaw-icon'
                });
                const marker = L.marker(pos, { icon: rickshawIcon }).addTo(this.map)
                    .bindPopup(`<b>🛺 Rickshaw ${auto.auto_number}</b><br>Model: ${auto.model}<br>Location: ${locKey}`);
                
                this.autoMarkers.set(auto.auto_id, marker);
            }
        });
    }

    updateSingleAuto(autoId, locationKey) {
        const base = this.campusCoords[locationKey] || this.campusCoords.Gate2;
        if (this.autoMarkers.has(Number(autoId))) {
            const marker = this.autoMarkers.get(Number(autoId));
            marker.setLatLng(base);
            marker.openPopup();
            this.map.setView(base, 17);
        } else {
            this.loadAutoLocations();
        }
    }

    refresh() {
        this.loadAutoLocations();
    }

    destroy() {
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
        this.markers = [];
        this.autoMarkers.clear();
    }
}

let studentMap = null;
let adminMap = null;

function initializeAllMaps() {
    setTimeout(() => {
        if (document.getElementById('student-map')) {
            if (studentMap) studentMap.destroy();
            studentMap = new CampusMap('student-map');
        }
        if (document.getElementById('admin-map')) {
            if (adminMap) adminMap.destroy();
            adminMap = new CampusMap('admin-map');
        }
    }, 400);
}

window.initializeAllMaps = initializeAllMaps;