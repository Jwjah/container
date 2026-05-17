const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Configuration
// In a real scenario, the shop owner enters these once and they are saved.
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000/api';
const SHOP_ID = process.env.SHOP_ID || '1';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'YOUR_SHOP_OWNER_JWT_TOKEN_HERE';

const POLL_INTERVAL_MS = 3000; // Poll every 3 seconds
const TEMP_DIR = path.join(__dirname, 'temp_prints');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

// Function to download a file
async function downloadFile(url, dest) {
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
  });

  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(dest);
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

// Function to trigger OS print or open preview
function printFile(filePath) {
  console.log(`🖨️  [PRINTER AGENT] Triggering print for: ${filePath}`);
  
  // For testing without a physical printer, we will just OPEN the file on screen using OS default viewer.
  // To actually print, change 'open' to 'lp' (Mac/Linux) or 'PDFtoPrinter' (Windows).
  
  const isWindows = process.platform === 'win32';
  const openCommand = isWindows ? 'start' : 'open';

  exec(`"${openCommand}" "${filePath}"`, (err, stdout, stderr) => {
    if (err) {
      console.error('❌ Failed to execute command:', err.message);
      return;
    }
    console.log('✅ File processed successfully!');
  });
}

// Polling loop
async function pollForJobs() {
  try {
    const response = await axios.get(`${API_BASE_URL}/shops/${SHOP_ID}/poll-print`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` }
    });

    const jobs = response.data.jobs || [];
    
    if (jobs.length > 0) {
      console.log(`\n📥 Received ${jobs.length} new print jobs!`);
    }

    for (const job of jobs) {
      console.log(`⏳ Downloading Order #${job.orderId} - ${job.fileName}...`);
      const filePath = path.join(TEMP_DIR, `${job.orderId}_${job.fileName}`);
      
      await downloadFile(job.fileUrl, filePath);
      console.log(`💾 Saved to local disk: ${filePath}`);
      
      printFile(filePath);
    }
  } catch (error) {
    if (error.response && error.response.status === 403) {
      console.error('❌ Authentication failed! Check your AUTH_TOKEN and SHOP_ID.');
    } else {
      console.error('⚠️ Polling error:', error.message);
    }
  }

  // Schedule next poll
  setTimeout(pollForJobs, POLL_INTERVAL_MS);
}

console.log('🚀 CampusPrint Local Agent Started!');
console.log(`📡 Listening for print jobs for Shop ID: ${SHOP_ID}...`);
pollForJobs();
