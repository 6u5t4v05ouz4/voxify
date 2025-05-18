const { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage } = require('electron');
const { clipboard } = require('electron');
const { globalShortcut } = require('electron');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

let win;
let tray = null;
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

// Função para criar o menu da aplicação
function createMenu() {
  const template = [
    {
      label: 'Configurações',
      submenu: [
        {
          label: 'Configurar API Key',
          click: () => {
            showApiKeyDialog();
          }
        },
        { type: 'separator' },
        {
          label: 'Sair',
          click: () => {
            app.isQuitting = true;
            app.quit();
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Função para mostrar o diálogo de configuração da API Key
function showApiKeyDialog() {
  dialog.showMessageBox(win, {
    type: 'question',
    buttons: ['OK', 'Cancelar'],
    defaultId: 0,
    title: 'Configurar API Key',
    message: 'Insira sua OpenAI API Key:',
    detail: 'A API Key é necessária para usar o serviço de conversão de texto para fala.',
    inputBox: true
  }).then(result => {
    if (result.response === 0) {
      // Se o usuário clicou em OK, mostrar o diálogo de entrada personalizado
      win.webContents.send('show-api-key-dialog');
    }
  }).catch(err => {
    console.error('Erro ao mostrar diálogo:', err);
  });
}

// Configurar listeners IPC
function setupIPC() {
  // Receber resposta do diálogo de API Key
  ipcMain.on('api-key-dialog-response', (event, response) => {
    // Verifica se é o formato antigo (string direta) ou novo (objeto com propriedades)
    if (response && typeof response === 'object' && 'apiKey' in response) {
      // Novo formato: { canceled: boolean, apiKey: string }
      if (!response.canceled && response.apiKey) {
        API_KEY = response.apiKey.trim();
        saveConfig(API_KEY);
        win.webContents.send('api-key-updated', true);
      }
    } else if (response && typeof response === 'string') {
      // Formato antigo: string direta
      API_KEY = response.trim();
      saveConfig(API_KEY);
      win.webContents.send('api-key-updated', true);
    } else {
      console.error('API Key inválida recebida');
      win.webContents.send('error', 'API Key inválida. Por favor, tente novamente.');
    }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 480,
    height: 600,
    backgroundColor: '#1e1e2e', // Cor de fundo escura para combinar com o tema
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
  // win.webContents.openDevTools();

  // Hide window when closed instead of quitting
  win.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      win.hide();
    }
    return false;
  });

  // Criar o menu da aplicação
  createMenu();
  
  // Configurar IPC listeners
  setupIPC();

  return win;
}

// Get text from clipboard
function getClipboardText() {
  return clipboard.readText();
}

// Function to handle text-to-speech
async function narrateText(text) {
  if (!text || text.trim() === '') {
    win.webContents.send('error', 'Nenhum texto selecionado');
    return;
  }
  
  if (!API_KEY) {
    win.webContents.send('error', 'API Key não configurada');
    return;
  }

  try {
    console.log('Tentando narrar texto com API Key:', API_KEY.substring(0, 5) + '...');
    
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
      throw new Error('Resposta vazia da API');
    }
    
    // Send audio data to renderer process
    win.webContents.send('audio-ready', Buffer.from(response.data).toString('base64'));
  } catch (error) {
    console.error('Erro com a API OpenAI:', error);
    let errorMessage = 'Falha ao narrar texto';
    
    // Send error to renderer process using the new audio-error channel
    win.webContents.send('audio-error', errorMessage);
    
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      errorMessage = `Erro de API: ${error.response.status}`;
      
      // Verificar se é um erro de autenticação (401)
      if (error.response.status === 401) {
        errorMessage = 'API Key inválida. Por favor, configure uma API Key válida no menu Configurações.';
        // Mostrar diálogo de configuração da API Key
        setTimeout(() => {
          const template = Menu.getApplicationMenu().items.find(item => item.label === 'Configurações');
          if (template && template.submenu) {
            const configItem = template.submenu.items.find(item => item.label === 'Configurar API Key');
            if (configItem && configItem.click) {
              configItem.click();
            }
          }
        }, 1000);
      } else if (error.response.data) {
        try {
          // Tentar extrair a mensagem de erro do buffer
          const errorData = JSON.parse(Buffer.from(error.response.data).toString());
          if (errorData.error && errorData.error.message) {
            errorMessage += `: ${errorData.error.message}`;
          }
        } catch (e) {
          // Se não conseguir extrair a mensagem, usar o status text
          errorMessage += ` - ${error.response.statusText}`;
        }
      }
    } else if (error.request) {
      // The request was made but no response was received
      errorMessage = 'Sem resposta do servidor. Verifique sua conexão com a internet.';
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = 'Tempo limite da requisição. Por favor, tente novamente.';
    } else {
      // Something happened in setting up the request that triggered an Error
      errorMessage = `Erro: ${error.message}`;
    }
    
    win.webContents.send('error', errorMessage);
  }
}

// Função para criar o menu da aplicação
function createMenu() {
  const template = [
    {
      label: 'Arquivo',
      submenu: [
        { role: 'quit', label: 'Sair' }
      ]
    },
    {
      label: 'Configurações',
      submenu: [
        {
          label: 'Configurar API Key',
          click: () => {
            // Abrir diretamente a janela de configuração da API Key sem diálogo de confirmação
            // Criar uma janela temporária para input da API Key
            let apiKeyWindow = new BrowserWindow({
              parent: win,
              modal: true,
              width: 400,
              height: 200,
              backgroundColor: '#1e1e2e',
              webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                enableRemoteModule: false,
                preload: path.join(__dirname, 'preload.js')
              },
              minimizable: false,
              maximizable: false,
              resizable: true,
              fullscreenable: false,
              frame: false,
              autoHideMenuBar: true
            });
                
            // Criar HTML para o formulário de API Key
            const apiKeyFormHtml = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <title>Configurar API Key</title>
              <link rel="stylesheet" href="dark-theme.css">
              <style>
                body {
                  padding: 20px;
                  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                  color: #e0e0e0;
                  overflow-x: hidden;
                  margin: 0;
                }
                .container {
                  display: flex;
                  flex-direction: column;
                  gap: 15px;
                  width: 100%;
                  box-sizing: border-box;
                }
                h3 {
                  margin-top: 0;
                  margin-bottom: 10px;
                }
                input {
                  width: 100%;
                  padding: 8px;
                  border: 1px solid #4a4a5e;
                  border-radius: 4px;
                  background-color: #3a3a4c;
                  color: #e0e0e0;
                  box-sizing: border-box;
                  max-width: 100%;
                }
                .buttons {
                  display: flex;
                  justify-content: flex-end;
                  gap: 10px;
                  margin-top: 10px;
                }
                button {
                  padding: 8px 15px;
                  border: none;
                  border-radius: 4px;
                  cursor: pointer;
                  background-color: #2a5278;
                  color: white;
                }
                button:hover {
                  background-color: #1c3a56;
                }
                button.cancel {
                  background-color: #3a3a4c;
                }
                button.cancel:hover {
                  background-color: #4a4a5e;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <h3>Configurar API Key</h3>
                <p>Insira sua OpenAI API Key:</p>
                <input type="password" id="apiKeyInput" placeholder="sk-..." value="${API_KEY || ''}">
                <div class="buttons">
                  <button class="cancel" id="cancelBtn">Cancelar</button>
                  <button id="saveBtn">Salvar</button>
                </div>
              </div>
              <script>
                document.getElementById('apiKeyInput').focus();
                
                document.getElementById('cancelBtn').addEventListener('click', () => {
                  window.electron.send('api-key-dialog-response', { canceled: true });
                });
                
                document.getElementById('saveBtn').addEventListener('click', () => {
                  const apiKey = document.getElementById('apiKeyInput').value.trim();
                  window.electron.send('api-key-dialog-response', { canceled: false, apiKey });
                });
                
                document.getElementById('apiKeyInput').addEventListener('keypress', (e) => {
                  if (e.key === 'Enter') {
                    document.getElementById('saveBtn').click();
                  }
                });
              </script>
            </body>
            </html>
            `;
            
            // Salvar o HTML em um arquivo temporário
            const tempHtmlPath = path.join(app.getPath('temp'), 'api-key-form.html');
            fs.writeFileSync(tempHtmlPath, apiKeyFormHtml);
            
            // Carregar o arquivo HTML
            apiKeyWindow.loadFile(tempHtmlPath);
            
            // Configurar resposta do diálogo
            ipcMain.once('api-key-dialog-response', (event, response) => {
              if (!response.canceled && response.apiKey) {
                API_KEY = response.apiKey;
                saveConfig(API_KEY);
                win.webContents.send('api-key-updated', true);
              }
              
              // Fechar a janela e limpar o arquivo temporário
              apiKeyWindow.close();
              apiKeyWindow = null;
              try {
                fs.unlinkSync(tempHtmlPath);
              } catch (err) {
                console.error('Erro ao remover arquivo temporário:', err);
              }
            });
            
            // Garantir limpeza se a janela for fechada
            apiKeyWindow.on('closed', () => {
              apiKeyWindow = null;
              try {
                fs.unlinkSync(tempHtmlPath);
              } catch (err) {
                // Ignorar erros ao remover arquivo temporário
              }
            });

          }
        }
      ]
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: 'Sobre',
          click: () => {
            dialog.showMessageBox(win, {
              title: 'Sobre VOXIFY',
              message: 'VOXIFY - Conversor de texto para voz',
              detail: 'Versão 1.0.0\nUm aplicativo simples para converter texto em voz usando a API da OpenAI.',
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Função alternativa para configurar API Key (fallback)
function promptApiKey() {
  dialog.showMessageBox(win, {
    type: 'info',
    title: 'Configurar API Key',
    message: 'Para configurar sua API Key, vá para Configurações > Configurar API Key no menu principal.',
    buttons: ['OK']
  });
}

// Função para criar o ícone na bandeja do sistema
function createTray() {
  // Criar ícone para a bandeja do sistema
  const iconPath = path.join(__dirname, 'icon.svg');
  const trayIcon = nativeImage.createFromPath(iconPath);
  
  // Criar o ícone na bandeja
  tray = new Tray(trayIcon);
  tray.setToolTip('VOXIFY - Conversor de texto para voz');
  
  // Criar menu de contexto para o ícone na bandeja
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Mostrar/Ocultar',
      click: () => {
        if (win.isVisible()) {
          win.hide();
        } else {
          win.show();
          win.focus();
        }
      }
    },
    {
      label: 'Configurar API Key',
      click: () => {
        win.show();
        win.focus();
        showApiKeyDialog();
      }
    },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  // Definir o menu de contexto
  tray.setContextMenu(contextMenu);
  
  // Adicionar evento de clique no ícone da bandeja
  tray.on('click', () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });
}

// App lifecycle
app.whenReady().then(() => {
  createWindow();
  createTray();
  
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
  
  // Destruir o ícone da bandeja do sistema
  if (tray) {
    tray.destroy();
    tray = null;
  }
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
