#!/bin/bash
# Move into the folder where this script is located
cd "$(dirname "$0")"

clear
echo "=========================================="
echo "   PFM CAMPUSPRINT LOCAL AGENT LAUNCHER   "
echo "=========================================="
echo ""

# Start the agent
node agent.js
