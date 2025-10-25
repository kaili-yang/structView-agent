// frontend/main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const fs = require('fs'); // Added for safety check
// const dotenv = require('dotenv');
// dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

// --- Global Variables ---
let mainWindow;
let goProcess;
let goGrpcPort = null; 
let grpcClient = null; 
let goReadyPromise = null; // CRITICAL: Promise to track backend readiness

const injectedKeyStatus = process.env.AI_API_KEY ? 'LOADED' : 'MISSING (Must set in terminal)';
console.log(`[SEC-01 Check] Node.js Process AI_API_KEY Status: ${injectedKeyStatus}`);

// --- gRPC Client Initialization ---

// Note: This function is only called after the goReadyPromise resolves, guaranteeing 'port' is valid.
// frontend/main.js (REPLACE initializeGrpcClient function)

// Note: This function is now ASYNCHRONOUS and returns a Promise that resolves to the client instance.
function initializeGrpcClient(port) {
    const PROTO_PATH = path.join(__dirname, '..', 'backend', 'proto', 'agent_service.proto');
    
    // NOTE: protoLoader.loadSync is synchronous, but fast and fine for setup
    const packageDefinition = protoLoader.loadSync(PROTO_PATH, { /* ... options ... */ });
    
    const agent_proto = grpc.loadPackageDefinition(packageDefinition).agent_service;
    const target = `127.0.0.1:${port}`;

    if (grpcClient && grpcClient.target === target) {
        return grpcClient; 
    }
    
    console.log(`[gRPC Client] Creating client for target: ${target}`);
    // FIX: The client is created and immediately returned
    return new agent_proto.AIService(target, grpc.credentials.createInsecure());
}
// Function to handle the actual gRPC Ping call
async function pingBackend(message) {
    if (!grpcClient) {
        // If grpcClient is null, it means goReadyPromise failed or hasn't finished its .then() block
        throw new Error("gRPC Client not initialized after Go backend started.");
    }
    
    // Use the globally initialized client instance
    const client = grpcClient; 
    
    const deadline = new Date();
    deadline.setSeconds(deadline.getSeconds() + 3);
    
    return new Promise((resolve, reject) => {
        client.ping({ message: message }, { deadline: deadline }, (error, response) => { 
            if (error) {
                // If this fails, it's a genuine RPC error (timeout/network)
                console.error("gRPC Ping Error:", error);
                return reject(error.details || error.message);
            }
            resolve(response.reply);
        });
    });
}

// Function to handle the actual gRPC Feature Extraction call
async function extractFeaturesBackend(data) {
    const client = initializeGrpcClient(goGrpcPort); // Non-blocking call

    return new Promise((resolve, reject) => {
        client.extractFeatures({ 
            pageUrl: data.url,
            pageText: data.text,
            extractionFields: data.fields,
        }, (error, response) => {
            if (error) {
                console.error("gRPC Extraction Error:", error);
                return reject(error.details || error.message);
            }
            resolve(response); // Returns { extracted_json: "...", error_message: "..." }
        });
    });
}
// --- End gRPC Client Initialization ---


// --- Go Backend Management with Readiness Promise (RACE CONDITION FIX) ---
function startBackendService() {
    const relativeBackendPath = path.join(__dirname, '..', 'backend', 'structView-agent-backend');
    const backendPath = path.resolve(relativeBackendPath); 
    
    // Safety check for executable existence
    if (!fs.existsSync(backendPath)) {
        console.error(`[Main Process] FATAL ERROR: Backend executable not found at: ${backendPath}`);
        goReadyPromise = Promise.reject(new Error('Executable not found.'));
        return;
    }
    
    console.log(`[Main Process] Attempting to spawn: ${backendPath}`); 
    goProcess = spawn(backendPath);

    // FIX 1: Initialize the readiness promise
    goReadyPromise = new Promise((resolve, reject) => {
        
        // FIX 2: Check both stdout and stderr for the log message
        const logHandler = (data) => {
            const log = data.toString('utf8').trim();
            console.log(`[Go Backend LOG]: ${log}`);

            const portMatch = log.match(/listening on :(\d+)/);
            
            if (portMatch && !goGrpcPort) {
                goGrpcPort = portMatch[1];
                console.log(`[Main Process] Go backend ready on port: ${goGrpcPort}`);
                resolve(goGrpcPort); // RESOLVE THE PROMISE WHEN PORT IS FOUND
                
                // Stop listening once port is found
                goProcess.stdout.removeListener('data', logHandler);
                goProcess.stderr.removeListener('data', logHandler);
            }
        };

        goProcess.stdout.on('data', logHandler);
        goProcess.stderr.on('data', logHandler); 

        goProcess.on('error', (err) => {
            console.error(`[Main Process] FATAL: Failed to start Go executable! Error: ${err.message}`);
            reject(err);
        });
        
        // FIX 3: Explicitly close the child process's stdin
        if (goProcess.stdin) {
            goProcess.stdin.end();
        }
    });

    // Handle process exit (cleanup)
    goProcess.on('close', (code) => {
        console.log(`[Go Backend] process exited with code ${code}`);
    });
}

function stopBackendService() {
    if (goProcess) {
        console.log('[Main Process] Killing Go backend process...');
        goProcess.kill();
        goProcess = null;
    }
}
// --- End Go Backend Management ---


function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webviewTag: true // Allow <webview> in the DEV mode, False it when it's in the PROD mode.
        }
    });

    // FIX: Use an absolute path to ensure index.html is loaded correctly
    mainWindow.loadFile(path.join(__dirname, 'index.html')); 

    mainWindow.webContents.openDevTools(); 
}

app.whenReady().then(() => {
    startBackendService(); 
    createWindow();
    
    // FINAL FIX: Once Go is ready, create the gRPC client object once.
    goReadyPromise.then(port => {
        // Initialize client and store it globally
        grpcClient = initializeGrpcClient(port);
        console.log('[Main Process] FINAL gRPC Client successfully initialized.');
        
        // This is where you might add a success log to the terminal
        // The gRPC client is now stored in the global grpcClient variable
        // All IPC handlers will use this stored client instance.
        
    }).catch(err => {
        console.error('[Main Process] Failed to initialize gRPC client after Go start:', err);
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', stopBackendService);

// --- IPC Handler (The interface for the Renderer) ---

// Ping handler (Waits for Go service readiness)
ipcMain.handle('app:ping-backend', async (event, message) => {
    try {
        await goReadyPromise; // CRITICAL WAIT
        return await pingBackend(message);
    } catch (error) {
        console.error("IPC Ping Error (Final Catch):", error);
        throw new Error(`gRPC Failed: Go backend connection failed during startup.`);
    }
});

// Extraction handler (Waits for Go service readiness)
ipcMain.handle('app:extract-features', async (event, data) => {
    try {
        await goReadyPromise; // CRITICAL WAIT
        return await extractFeaturesBackend(data);
    } catch (error) {
        console.error("IPC Extraction Error (Final Catch):", error);
        throw new Error(`gRPC Failed: Go backend extraction failed during startup.`);
    }
});

// History Save handler (Placeholder)
ipcMain.handle('app:save-extracted-record', async (event, data) => {
    // Logic for Task BK-02/FE-03 will be implemented here later
    console.log(`[Main Process] Received request to save record for: ${data.url}`);
    return { success: true };
});
// --- End IPC Handler ---