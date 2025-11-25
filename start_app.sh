#!/bin/bash

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Change to project directory
cd "$(dirname "$0")"

echo -e "${BLUE}🚀 SAU E-Rickshaw Transport System${NC}"
echo "=================================="
echo ""

# Check if MySQL is running
if ! pgrep -x "mysqld" > /dev/null; then
    echo -e "${RED}❌ MySQL is not running!${NC}"
    echo -e "${YELLOW}Starting MySQL...${NC}"
    brew services start mysql
    sleep 3
fi

# Kill any existing processes
echo -e "${YELLOW}🛑 Stopping any existing servers...${NC}"
pkill -f "node.*server.js" 2>/dev/null
pkill -f "http-server" 2>/dev/null
sleep 2

# Check if http-server is installed
if ! command -v http-server &> /dev/null; then
    echo -e "${RED}❌ http-server not found!${NC}"
    echo -e "${YELLOW}Installing http-server...${NC}"
    npm install -g http-server
fi

# Start Backend
echo -e "${GREEN}🔧 Starting backend server...${NC}"
cd backend

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install
fi

npm run dev > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait for backend
echo -e "${YELLOW}⏳ Waiting for backend to start...${NC}"
sleep 5

# Check if backend started successfully
if ! curl -s http://localhost:3000/api/health > /dev/null; then
    echo -e "${RED}❌ Backend failed to start! Check backend.log${NC}"
    tail -n 20 backend.log
    exit 1
fi

echo -e "${GREEN}✅ Backend is running!${NC}"

# Start Frontend
echo -e "${GREEN}🌐 Starting frontend server...${NC}"
cd frontend
http-server -p 8000 -c-1 > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

# Wait for servers to start
sleep 3

# Check if frontend started
if ! curl -s http://localhost:8000 > /dev/null; then
    echo -e "${RED}❌ Frontend failed to start! Check frontend.log${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Frontend is running!${NC}"

# Open browser automatically
echo -e "${BLUE}📖 Opening browser...${NC}"
open "http://localhost:8000"

echo ""
echo -e "${GREEN}✅ Application is running!${NC}"
echo -e "${BLUE}🌐 Frontend: http://localhost:8000${NC}"
echo -e "${BLUE}🔧 Backend:  http://localhost:3000${NC}"
echo ""
echo -e "${YELLOW}🔑 Login Credentials:${NC}"
echo "   Admin:   admin@sau.ac.in / password"
echo "   Student: amit.sharma@sau.ac.in / password"
echo "   Driver:  rajesh.driver@sau.ac.in / password"
echo ""
echo -e "${YELLOW}📝 Logs:${NC}"
echo "   Backend:  tail -f backend.log"
echo "   Frontend: tail -f frontend.log"
echo ""
echo -e "${RED}Press Ctrl+C to stop all servers${NC}"

# Cleanup on exit
trap 'echo -e "\n${YELLOW}🛑 Stopping servers...${NC}"; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit' INT TERM

# Keep script running
wait