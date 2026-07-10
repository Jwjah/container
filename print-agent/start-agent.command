#!/bin/bash
# Move into the folder where this script is located
cd "$(dirname "$0")"

clear
echo "=========================================="
echo "   PFM CAMPUSPRINT LOCAL AGENT LAUNCHER   "
echo "=========================================="
echo ""

# Check if node is installed
if ! command -v node &> /dev/null
then
    echo "❌ Node.js is not installed! Please download and install Node.js from: https://nodejs.org/"
    read -p "Press enter to exit..."
    exit 1
fi

# Install dependencies if node_modules is missing
if [ ! -d "node_modules" ]; then
    echo "📦 Initializing print agent dependencies..."
    npm install --no-audit --no-fund
fi

# Start the agent
node agent.js
