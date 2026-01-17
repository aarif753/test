// =============================================
// AI Image Upscaler - GitHub Pages Edition
// FIXED VERSION for aarif753.github.io
// =============================================

// Configuration
const CONFIG = {
    MODEL_PATH: 'models/2x/realesrgan-x2.onnx',
    TILE_SIZE: 512,
    MAX_INPUT_SIZE: 2048,
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    SUPPORTED_FORMATS: ['image/jpeg', 'image/png', 'image/webp']
};

// Global State
const STATE = {
    session: null,
    originalImage: null,
    upscaledCanvas: null,
    isProcessing: false,
    deviceCapability: 'detecting',
    currentFile: null,
    processingStartTime: null,
    isModelLoaded: false
};

// DOM Elements
const ELEMENTS = {
    // Loading
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingStatus: document.getElementById('loadingStatus'),
    
    // Upload
    dropArea: document.getElementById('dropArea'),
    fileInput: document.getElementById('fileInput'),
    selectBtn: document.getElementById('selectBtn'),
    imageInfo: document.getElementById('imageInfo'),
    fileName: document.getElementById('fileName'),
    imageDimensions: document.getElementById('imageDimensions'),
    fileSize: document.getElementById('fileSize'),
    
    // Controls
    upscaleBtn: document.getElementById('upscaleBtn'),
    tileProcessing: document.getElementById('tileProcessing'),
    preserveTransparency: document.getElementById('preserveTransparency'),
    tileSize: document.getElementById('tileSize'),
    deviceCapability: document.getElementById('deviceCapability'),
    
    // Images
    originalImage: document.getElementById('originalImage'),
    originalPlaceholder: document.getElementById('originalPlaceholder'),
    originalStats: document.getElementById('originalStats'),
    upscaledCanvas: document.getElementById('upscaledCanvas'),
    upscaledPlaceholder: document.getElementById('upscaledPlaceholder'),
    upscaledStats: document.getElementById('upscaledStats'),
    
    // Comparison
    comparisonSlider: document.getElementById('comparisonSlider'),
    
    // Progress
    progressContainer: document.getElementById('progressContainer'),
    progressStatus: document.getElementById('progressStatus'),
    progressPercent: document.getElementById('progressPercent'),
    progressFill: document.getElementById('progressFill'),
    timeEstimate: document.getElementById('timeEstimate'),
    
    // Results
    resultsSection: document.getElementById('resultsSection'),
    qualitySlider: document.getElementById('qualitySlider'),
    qualityValue: document.getElementById('qualityValue')
};

// =============================================
// CRITICAL: WAIT FOR ONNX RUNTIME
// =============================================

let ort = null;

async function waitForONNX() {
    console.log('⏳ Checking for ONNX Runtime...');
    
    // If ort is already loaded (from window.ort)
    if (window.ort && typeof window.ort.getAvailableProviders === 'function') {
        console.log('✅ ONNX Runtime already loaded');
        ort = window.ort;
        return ort;
    }
    
    // Wait for ort to be available
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 200; // Wait 20 seconds
        
        function check() {
            attempts++;
            
            console.log(`Attempt ${attempts}/200: Checking for ONNX...`);
            
            // Check if ort is now available
            if (window.ort && typeof window.ort.getAvailableProviders === 'function') {
                console.log('✅ ONNX Runtime loaded successfully!');
                ort = window.ort;
                
                // Configure paths for GitHub Pages
                if (ort.env && ort.env.wasm) {
                    ort.env.wasm.wasmPaths = 'libs/onnxruntime/';
                    console.log('🔧 Set WASM path to: libs/onnxruntime/');
                }
                
                resolve(ort);
                return;
            }
            
            if (attempts >= maxAttempts) {
                reject(new Error('ONNX Runtime failed to load. Please check: 1) Script order 2) File paths'));
                return;
            }
            
            // Try again
            setTimeout(check, 100);
        }
        
        // Start checking
        setTimeout(check, 500);
    });
}

// =============================================
// SIMPLIFIED INITIALIZATION
// =============================================

async function initApp() {
    console.log('🚀 Starting AI Image Upscaler for GitHub Pages...');
    
    try {
        // STEP 1: Wait for ONNX Runtime
        await waitForONNX();
        
        // STEP 2: Initialize UI
        setupEventListeners();
        initDragAndDrop();
        
        // STEP 3: Hide loading screen
        ELEMENTS.loadingOverlay.style.opacity = '0';
        setTimeout(() => {
            ELEMENTS.loadingOverlay.style.display = 'none';
        }, 300);
        
        console.log('✅ Application ready! You can now select images.');
        
        // Show success message
        setTimeout(() => {
            alert('🎉 AI Image Upscaler is ready!\n\nYou can now: 1) Select an image 2) Click "Upscale Image"');
        }, 1000);
        
    } catch (error) {
        console.error('❌ Initialization failed:', error);
        
        // Show friendly error
        ELEMENTS.loadingOverlay.innerHTML = `
            <div style="text-align: center; padding: 40px; color: white;">
                <i class="fas fa-exclamation-triangle fa-3x" style="color: #f56565;"></i>
                <h2 style="margin-top: 20px;">Setup Error</h2>
                <p>${error.message}</p>
                <div style="margin-top: 30px;">
                    <button onclick="location.reload()" style="
                        padding: 12px 24px;
                        background: #667eea;
                        color: white;
                        border: none;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 16px;
                        margin: 10px;
                    ">
                        <i class="fas fa-sync-alt"></i> Refresh Page
                    </button>
                    <button onclick="window.open('https://github.com/aarif753/test/tree/main/upscale', '_blank')" style="
                        padding: 12px 24px;
                        background: #48bb78;
                        color: white;
                        border: none;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 16px;
                        margin: 10px;
                    ">
                        <i class="fas fa-question-circle"></i> Check Files
                    </button>
                </div>
            </div>
        `;
    }
}

// =============================================
// EVENT HANDLERS (SIMPLIFIED)
// =============================================

function setupEventListeners() {
    // File input
    ELEMENTS.fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });
    
    // Select button
    ELEMENTS.selectBtn.addEventListener('click', () => {
        ELEMENTS.fileInput.click();
    });
    
    // Upscale button (simple fallback)
    ELEMENTS.upscaleBtn.addEventListener('click', async () => {
        if (!STATE.originalImage) {
            alert('Please select an image first!');
            return;
        }
        
        // Simple upscale (2x size)
        const canvas = document.createElement('canvas');
        canvas.width = STATE.originalImage.width * 2;
        canvas.height = STATE.originalImage.height * 2;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(STATE.originalImage, 0, 0, canvas.width, canvas.height);
        
        // Display result
        ELEMENTS.upscaledCanvas.width = canvas.width;
        ELEMENTS.upscaledCanvas.height = canvas.height;
        ELEMENTS.upscaledCanvas.getContext('2d').drawImage(canvas, 0, 0);
        ELEMENTS.upscaledPlaceholder.style.display = 'none';
        ELEMENTS.upscaledCanvas.style.display = 'block';
        
        alert('✅ Image upscaled 2x! (Basic version working)');
    });
    
    // Drop area click
    ELEMENTS.dropArea.addEventListener('click', () => {
        ELEMENTS.fileInput.click();
    });
}

// =============================================
// FILE HANDLING (SIMPLIFIED)
// =============================================

async function handleFileSelect(file) {
    try {
        // Validate file
        if (!CONFIG.SUPPORTED_FORMATS.includes(file.type)) {
            alert('Please select a JPG, PNG, or WebP image');
            return;
        }
        
        if (file.size > CONFIG.MAX_FILE_SIZE) {
            alert(`File too large! Max size: 10MB\nYour file: ${Math.round(file.size/1024/1024)}MB`);
            return;
        }
        
        // Load image
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                STATE.originalImage = img;
                ELEMENTS.originalImage.src = img.src;
                ELEMENTS.originalImage.style.display = 'block';
                ELEMENTS.originalPlaceholder.style.display = 'none';
                ELEMENTS.upscaleBtn.disabled = false;
                
                // Show image info
                ELEMENTS.imageInfo.style.display = 'block';
                ELEMENTS.fileName.textContent = file.name;
                ELEMENTS.imageDimensions.textContent = `${img.width}×${img.height}`;
                ELEMENTS.fileSize.textContent = formatBytes(file.size);
                
                alert('✅ Image loaded! Click "Upscale Image"');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
        
    } catch (error) {
        console.error('Error loading file:', error);
        alert('Failed to load image. Please try another file.');
    }
}

// =============================================
// UTILITY FUNCTIONS
// =============================================

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// =============================================
// DRAG & DROP
// =============================================

function initDragAndDrop() {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        ELEMENTS.dropArea.addEventListener(eventName, preventDefaults, false);
    });
    
    ['dragenter', 'dragover'].forEach(eventName => {
        ELEMENTS.dropArea.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        ELEMENTS.dropArea.addEventListener(eventName, unhighlight, false);
    });
    
    ELEMENTS.dropArea.addEventListener('drop', handleDrop, false);
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    function highlight() {
        ELEMENTS.dropArea.classList.add('drag-over');
    }
    
    function unhighlight() {
        ELEMENTS.dropArea.classList.remove('drag-over');
    }
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleFileSelect(files[0]);
        }
    }
}

// =============================================
// START APPLICATION
// =============================================

// Start when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

console.log('AI Image Upscaler (Basic Version) loaded for GitHub Pages!');
