const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const readline = require('readline');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const TEMP_DIR = path.join(__dirname, 'temp_prints');
const POLL_INTERVAL_MS = 3000; // Poll every 3 seconds

// Default Configurations
let API_BASE_URL = process.env.API_BASE_URL || 'https://container-ruby.vercel.app/api';
let SHOP_ID = process.env.SHOP_ID || '';
let AUTH_TOKEN = process.env.AUTH_TOKEN || '';

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

// Function to load local configurations
function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      API_BASE_URL = config.API_BASE_URL || API_BASE_URL;
      SHOP_ID = config.SHOP_ID || SHOP_ID;
      AUTH_TOKEN = config.AUTH_TOKEN || AUTH_TOKEN;
      return true;
    } catch (e) {
      console.error('⚠️ Could not parse config.json, using defaults.');
    }
  }
  return false;
}

// Function to prompt user for token and shop ID
function setupInteractiveConfig() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('\n⚙️  [PFM PRINT AGENT] First-time setup required!');
  rl.question('🏪 Enter your Shop ID (e.g. 8): ', (shopIdInput) => {
    rl.question('🔑 Paste your AUTH_TOKEN: ', (tokenInput) => {
      const config = {
        API_BASE_URL,
        SHOP_ID: shopIdInput.trim(),
        AUTH_TOKEN: tokenInput.trim()
      };

      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
      console.log('✅ Configuration securely saved to print-agent/config.json!');
      
      SHOP_ID = config.SHOP_ID;
      AUTH_TOKEN = config.AUTH_TOKEN;
      
      rl.close();
      startPolling();
    });
  });
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
      console.error('❌ Authentication failed! Check your AUTH_TOKEN and SHOP_ID in config.json.');
    } else {
      console.error('⚠️ Polling error:', error.message);
    }
  }

  // Schedule next poll
  setTimeout(pollForJobs, POLL_INTERVAL_MS);
}

function startPolling() {
  console.log('\n🚀 CampusPrint Local Agent Started!');
  console.log(`📡 Listening for print jobs for Shop ID: ${SHOP_ID}...`);
  pollForJobs();
}

// Main execution flow
const hasConfig = loadConfig();
if (hasConfig && SHOP_ID && AUTH_TOKEN) {
  startPolling();
} else {
  setupInteractiveConfig();
}
