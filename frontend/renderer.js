// frontend/renderer.js

// --- 1. UI Element Definitions ---
const urlInput = document.getElementById('url-input');
const goBtn = document.getElementById('go-btn');
const backBtn = document.getElementById('back-btn');
const forwardBtn = document.getElementById('forward-btn');
const webview = document.getElementById('content-webview');
const pingBtn = document.getElementById('ping-btn');
const extractBtn = document.getElementById('extract-btn');
const statusBar = document.getElementById('status-bar');

const fieldsInput = document.getElementById('extraction-fields-input');
const outputContainer = document.getElementById('extracted-table-container');

// --- 2. Utility Functions ---

/**
 * Updates the status bar message.
 * @param {string} message 
 */
function updateStatus(message) {
    statusBar.textContent = `Status: ${message}`;
}

/**
 * Safely extracts clean text content from the current webview.
 * @returns {Promise<string>} The extracted text content.
 */
function getWebviewContent() {
    return webview.executeJavaScript(`
        // Get the inner text of the body, then simple cleanup (remove excessive whitespace)
        document.body.innerText.replace(/\\s\\s+/g, ' ').trim(); 
    `);
}

/**
 * Converts the AI's returned JSON string into an HTML table for display.
 * @param {string} jsonString - The JSON string returned by the Go backend.
 * @returns {string} The HTML table or an error message.
 */
function jsonToTable(jsonString) {
    try {
        const data = JSON.parse(jsonString);
        if (!Array.isArray(data) || data.length === 0) {
            return "<p>AI returned valid JSON, but the data array is empty. (Try different fields or a different page)</p>";
        }

        let html = '<table class="data-table"><thead><tr>';
        
        // Use keys of the first object for headers
        const headers = Object.keys(data[0]);
        headers.forEach(h => { html += `<th>${h}</th>`; });
        html += '</tr></thead><tbody>';

        // Add rows
        data.forEach(row => {
            html += '<tr>';
            headers.forEach(h => { html += `<td>${row[h] || 'N/A'}</td>`; });
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        return html;

    } catch (e) {
        console.error("JSON to Table conversion failed:", e);
        return `<p>Failed to parse final JSON output. Raw data: <pre>${jsonString.substring(0, 200)}...</pre></p>`;
    }
}


// --- 3. Navigation and Webview Handlers ---

function navigate() {
    let url = urlInput.value.trim();
    if (!url.match(/^[a-zA-Z]+:\/\//)) {
        url = 'http://' + url; // Basic prefix for testing
    }
    // webview.src = url;
    webview.src = "https://www.google.com"
    updateStatus(`Loading: test url`);
}

goBtn.addEventListener('click', navigate);
urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        navigate();
    }
});

backBtn.addEventListener('click', () => { webview.goBack(); });
forwardBtn.addEventListener('click', () => { webview.goForward(); });

// Update UI on navigation events
webview.addEventListener('did-navigate', (event) => {
    urlInput.value = event.url;
    updateStatus(`Loaded: ${event.url}`);
});


// --- 4. Task INTE-01: Ping Backend Test Logic ---

pingBtn.addEventListener('click', async () => {
    updateStatus("Pinging Go Backend...");
    
    // Call the safe exposed function from the preload script
    try {
        // window.api is exposed via preload.js (contextBridge)
        const response = await window.api.pingBackend("Hello from Renderer");
        updateStatus(`Backend Test Success: ${response}`);
    } catch (error) {
        // The main.js IPC handler is waiting for Go to start, so this catches the final failure.
        updateStatus(`Backend Test FAILED: ${error.message}`);
        console.error("Ping Test Error:", error);
    }
});


// --- 5. Task AI-01: Core Feature Extraction Logic ---

extractBtn.addEventListener('click', async () => {
    const url = urlInput.value;
    const fieldsText = fieldsInput.value.trim();
    
    if (url === 'about:blank' || webview.src === 'about:blank') {
        alert("Please load a webpage first.");
        return;
    }
    
    if (!fieldsText) {
        alert("Please enter the fields you wish to extract (e.g., Price, Features).");
        return;
    }

    try {
        updateStatus("Analyzing page and requesting AI extraction...");
        outputContainer.innerHTML = '<h4>Extraction Results</h4><p>Working on it... This may take a few seconds.</p>';

        // 1. Get page content
        const pageText = await getWebviewContent();

        // 2. Format fields array for gRPC request
        const fieldsArray = fieldsText.split(',').map(f => f.trim()).filter(f => f.length > 0);

        // 3. Call backend via IPC/gRPC
        const response = await window.api.extractFeatures(url, pageText, fieldsArray);

        if (response.errorMessage) {
            // Handle AI processing or JSON validation errors
            outputContainer.innerHTML = `
                <h4>Extraction Failed</h4>
                <p style="color: red;">Error: ${response.errorMessage}</p>
                <p>Raw AI Output (for debug): <pre>${response.extractedJson}</pre></p>`;
            updateStatus("AI Extraction failed.");
        } else {
            // Success: Render the table
            const tableHtml = jsonToTable(response.extractedJson);
            outputContainer.innerHTML = `<h4>Extraction Complete</h4>${tableHtml}`;
            updateStatus("Extraction successful! (Go backend processed JSON)");
            
            // Task FE-03/BK-03 Placeholder: Save the record to history
            window.api.saveExtractedRecord(url, response.extractedJson);
        }

    } catch (error) {
        updateStatus(`Extraction FAILED: ${error.message}`);
        console.error("Full Extraction Chain Error:", error);
    }
});


// --- 6. Task BK-03 Placeholder: History Logic ---

// Placeholder function to save record
window.api.saveExtractedRecord = async (url, dataJson) => {
    // The actual saving logic via gRPC is handled in the main process (ipcMain)
    // This function simply triggers the save request.
    console.log(`[History] Sending request to save record for: ${url}`);
    
    // NOTE: This is placeholder, the real gRPC call will be implemented in main.js later
    // return await window.api.saveExtractedRecord(url, dataJson);
};

// Placeholder for history button click (implementation later)
const historyBtn = document.getElementById('history-btn');
historyBtn.addEventListener('click', () => {
    // Toggle sidebar or load history view here
    updateStatus("History feature coming soon (Task BK-03)");
});


// --- 7. Initialization and Temporary Fixes ---

// Temporary: Enable buttons after a short delay to mitigate initial race condition
// The main.js Promise fix should handle the GPRC call timing, but this prevents quick user clicks.
// setTimeout(() => {
//     pingBtn.disabled = false;
//     extractBtn.disabled = false;
//     updateStatus("Ready. Backend initialization completed.");
// }, 1000); 

// Initial state
updateStatus("Application starting up...");

// --- 8. Auto-load on Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Check if the URL input has a non-blank default value
    if (urlInput.value !== 'about:blank') {
        // Automatically trigger the navigate function after a short delay
        setTimeout(navigate, 100); 
    }
});