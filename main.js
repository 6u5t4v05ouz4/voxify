const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { clipboard } = require('electron');
const { globalShortcut } = require('electron');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

let win;
let API_KEY = ''; // Will be set by the user

// Configuration file path
const CONFIG_PATH = path.join(app.getPath('userData'), 'voxify-config.json');

// Simple encryption key (in a real app, use a more secure method)
const ENCRYPTION_KEY = 'v0x1fy-s3cr3t-k3y';

// Modern encryption/decryption functions
function encrypt(text) {
  try {
    // Creating a 32-byte key from the original key (for AES-256)
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    // Creating a random 16-byte IV
    const iv = crypto.randomBytes(16);
    // Creating the cipher
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    // Encrypting the data
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Returning the IV and encrypted text concatenated
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    return null;
  }
}

function decrypt(encrypted) {
  try {
    // Separating IV from encrypted text
    const parts = encrypted.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    
    // Creating a 32-byte key from the original key (for AES-256)
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    
    // Creating the decipher
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    
    // Decrypting the data
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
}

// Function to delete existing configuration (used for format migration)
function resetConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      fs.unlinkSync(CONFIG_PATH);
      console.log('Configuration file reset successfully');
      return true;
    }
  } catch (error) {
    console.error('Error resetting config:', error);
  }
  return false;
}

// Load configuration
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      if (config.apiKey) {
        try {
          const decrypted = decrypt(config.apiKey);
          if (decrypted) {
            API_KEY = decrypted;
            return true;
          }
        } catch (error) {
          console.error('Could not decrypt API key with new format, resetting config');
          resetConfig();
          return false;
        }
      }
    }
  } catch (error) {
    console.error('Error loading config:', error);
    // If there was an error loading the configuration, reset to ensure correct format
    resetConfig();
  }
  return false;
}

// Save configuration
function saveConfig(apiKey) {
  try {
    const encrypted = encrypt(apiKey);
    const config = {
      apiKey: encrypted,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving config:', error);
    return false;
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 400,
    height: 500,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    show: true // Show window when created
  });

  win.loadFile('index.html');
  
  // For debugging
  win.webContents.openDevTools();

  // Hide window when closed instead of quitting
  win.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      win.hide();
    }
    return false;
  });

  return win;
}

// Get text from clipboard
function getClipboardText() {
  return clipboard.readText();
}

// Function to handle text-to-speech
async function narrateText(text) {
  if (!text || text.trim() === '') {
    win.webContents.send('error', 'No text selected');
    return;
  }
  
  if (!API_KEY) {
    win.webContents.send('error', 'API key not configured');
    return;
  }

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/audio/speech',
      {
        model: "tts-1",
        input: text,
        voice: "alloy"
      },
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer',
        timeout: 30000 // 30 seconds timeout
      }
    );
    
    if (!response.data || response.data.length === 0) {
      throw new Error('Empty API response');
    }
    
    // Send audio data to renderer process
    win.webContents.send('play-audio', Buffer.from(response.data).toString('base64'));
  } catch (error) {
    console.error('Error with OpenAI API:', error);
    let errorMessage = 'Failed to narrate text';
    
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      errorMessage = `API Error: ${error.response.status} - ${error.response.statusText}`;
      if (error.response.data && error.response.data.error) {
        errorMessage += `: ${error.response.data.error.message || JSON.stringify(error.response.data.error)}`;
      }
    } else if (error.request) {
      // The request was made but no response was received
      errorMessage = 'No response from server. Please check your internet connection.';
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = 'Request timeout. Please try again.';
    } else {
      // Something happened in setting up the request that triggered an Error
      errorMessage = `Error: ${error.message}`;
    }
    
    win.webContents.send('error', errorMessage);
  }
}

// App lifecycle
app.whenReady().then(() => {
  createWindow();

  // Register global shortcut
  const ret = globalShortcut.register('CommandOrControl+Shift+N', () => {
    try {
      const text = getClipboardText();
      narrateText(text);
    } catch (error) {
      console.error('Error in global shortcut handler:', error);
      win.webContents.send('error', 'Error processing shortcut');
    }
  });
  
  if (!ret) {
    console.error('Failed to register global shortcut');
    win.webContents.send('error', 'Failed to register global shortcut');
  }
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Clean up on quit
app.on('will-quit', () => {
  // Unregister all shortcuts
  globalShortcut.unregisterAll();
});

// IPC handlers
ipcMain.on('set-api-key', (event, key) => {
  console.log('Received API key');
  API_KEY = key;
  // Save the API key to config file
  if (saveConfig(key)) {
    console.log('API key saved to config');
  } else {
    console.error('Failed to save API key to config');
    // Notify renderer about the error
    if (win && !win.isDestroyed()) {
      win.webContents.send('error', 'Failed to save API key');
    }
  }
});

// Load saved API key when app starts
if (loadConfig()) {
  console.log('API key loaded from config');
}

ipcMain.on('show-window', () => {
  if (win) {
    win.show();
  }
});

// Initialization log
console.log('Main process initialized');
