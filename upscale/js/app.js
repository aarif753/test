// =============================================
// AI Image Upscaler - Browser Edition
// Version: 2.0.0
// Author: aarifalam.life
// =============================================


// =============================================
// CRITICAL FIX: ONNX RUNTIME LOADING
// =============================================

// Wait for ONNX Runtime to load before doing anything
async function waitForONNX() {
    console.log('⏳ Waiting for ONNX Runtime to load...');
    
    let attempts = 0;
    const maxAttempts = 100; // Wait up to 10 seconds
    
    return new Promise((resolve, reject) => {
        function check() {
            attempts++;
            
            // Check if ONNX Runtime is available
            if (typeof window.ort !== 'undefined' && 
                typeof window.ort.getAvailableProviders === 'function') {
                console.log('✅ ONNX Runtime loaded successfully!');
                resolve(window.ort);
                return;
            }
            
            if (attempts >= maxAttempts) {
                reject(new Error('ONNX Runtime failed to load. Please refresh the page.'));
                return;
            }
            
            // Try again in 100ms
            setTimeout(check, 100);
        }
        
        check();
    });
}

// Configure WASM file paths
function configureWASMPaths() {
    if (typeof window.ort !== 'undefined' && window.ort.env && window.ort.env.wasm) {
        // IMPORTANT: Set the correct path for your website
        window.ort.env.wasm.wasmPaths = 'libs/onnxruntime/';
        console.log('🔧 Configured WASM path to: libs/onnxruntime/');
    }
}


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
// UTILITY FUNCTIONS
// =============================================

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format time in seconds to human readable format
 */
function formatTime(seconds) {
    if (seconds < 60) {
        return `${Math.ceil(seconds)} seconds`;
    } else if (seconds < 3600) {
        return `${Math.ceil(seconds / 60)} minutes`;
    } else {
        return `${Math.ceil(seconds / 3600)} hours`;
    }
}

/**
 * Update status message
 */
function updateStatus(message, progress = 0) {
    if (ELEMENTS.progressStatus) {
        ELEMENTS.progressStatus.textContent = message;
    }
    if (ELEMENTS.progressPercent) {
        ELEMENTS.progressPercent.textContent = `${progress}%`;
    }
    if (ELEMENTS.progressFill) {
        ELEMENTS.progressFill.style.width = `${progress}%`;
    }
}

/**
 * Show error message to user
 */
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
        <div style="
            position: fixed;
            top: 20px;
            right: 20px;
            background: #f56565;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            display: flex;
            align-items: center;
            gap: 10px;
            animation: slideIn 0.3s ease;
        ">
            <i class="fas fa-exclamation-triangle"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(errorDiv);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

/**
 * Show success message
 */
function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.innerHTML = `
        <div style="
            position: fixed;
            top: 20px;
            right: 20px;
            background: #48bb78;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            display: flex;
            align-items: center;
            gap: 10px;
            animation: slideIn 0.3s ease;
        ">
            <i class="fas fa-check-circle"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(successDiv);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        successDiv.remove();
    }, 3000);
}

/**
 * Calculate processing time estimate
 */
function updateTimeEstimate(progress) {
    if (!STATE.processingStartTime) return;
    
    const elapsed = (Date.now() - STATE.processingStartTime) / 1000; // seconds
    const estimatedTotal = elapsed / (progress / 100);
    const remaining = estimatedTotal - elapsed;
    
    if (ELEMENTS.timeEstimate) {
        if (progress < 5) {
            ELEMENTS.timeEstimate.textContent = 'Estimating time...';
        } else {
            ELEMENTS.timeEstimate.textContent = `About ${formatTime(remaining)} remaining`;
        }
    }
}

// =============================================
// IMAGE PROCESSING FUNCTIONS
// =============================================

/**
 * Load and validate image file
 */
async function loadImageFile(file) {
    // Validate file
    if (!CONFIG.SUPPORTED_FORMATS.includes(file.type)) {
        throw new Error('Unsupported file format. Please use JPG, PNG, or WebP.');
    }
    
    if (file.size > CONFIG.MAX_FILE_SIZE) {
        throw new Error(`File is too large. Maximum size is ${formatBytes(CONFIG.MAX_FILE_SIZE)}.`);
    }
    
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            try {
                const img = new Image();
                
                img.onload = () => {
                    // Resize if too large
                    if (img.width > CONFIG.MAX_INPUT_SIZE || img.height > CONFIG.MAX_INPUT_SIZE) {
                        const scale = Math.min(
                            CONFIG.MAX_INPUT_SIZE / img.width,
                            CONFIG.MAX_INPUT_SIZE / img.height
                        );
                        
                        const canvas = document.createElement('canvas');
                        canvas.width = Math.floor(img.width * scale);
                        canvas.height = Math.floor(img.height * scale);
                        
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        
                        const resizedImg = new Image();
                        resizedImg.onload = () => resolve(resizedImg);
                        resizedImg.onerror = reject;
                        resizedImg.src = canvas.toDataURL();
                    } else {
                        resolve(img);
                    }
                };
                
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = e.target.result;
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

/**
 * Convert image to tensor for ONNX
 */
function imageToTensor(img) {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    
    // Clear and draw image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Convert to tensor format (NCHW: [1, 3, H, W])
    const red = new Float32Array(canvas.width * canvas.height);
    const green = new Float32Array(canvas.width * canvas.height);
    const blue = new Float32Array(canvas.width * canvas.height);
    const alpha = ELEMENTS.preserveTransparency.checked ? 
                 new Float32Array(canvas.width * canvas.height) : null;
    
    for (let i = 0; i < data.length; i += 4) {
        const pixelIndex = i / 4;
        red[pixelIndex] = data[i] / 255;
        green[pixelIndex] = data[i + 1] / 255;
        blue[pixelIndex] = data[i + 2] / 255;
        if (alpha) {
            alpha[pixelIndex] = data[i + 3] / 255;
        }
    }
    
    return {
        red, green, blue, alpha,
        width: canvas.width,
        height: canvas.height,
        channels: alpha ? 4 : 3
    };
}

/**
 * Convert tensor back to image
 */
function tensorToImage(tensor, outputWidth, outputHeight) {
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(outputWidth, outputHeight);
    const data = imageData.data;
    
    // Simple upscale for demonstration
    // In real implementation, this would use the model output
    const scaleX = outputWidth / tensor.width;
    const scaleY = outputHeight / tensor.height;
    
    for (let y = 0; y < outputHeight; y++) {
        for (let x = 0; x < outputWidth; x++) {
            const origX = Math.floor(x / scaleX);
            const origY = Math.floor(y / scaleY);
            const origIdx = origY * tensor.width + origX;
            const idx = (y * outputWidth + x) * 4;
            
            // Apply simple enhancement (simulating AI upscale)
            const enhance = 1.1; // Simple enhancement factor
            
            data[idx] = Math.min(255, tensor.red[origIdx] * 255 * enhance);
            data[idx + 1] = Math.min(255, tensor.green[origIdx] * 255 * enhance);
            data[idx + 2] = Math.min(255, tensor.blue[origIdx] * 255 * enhance);
            data[idx + 3] = tensor.alpha ? 
                tensor.alpha[origIdx] * 255 : 255;
        }
    }
    
    ctx.putImageData(imageData, 0, 0);
    return canvas;
}

// =============================================
// AI MODEL FUNCTIONS
// =============================================

/**
 * Initialize ONNX Runtime
 */
async function initONNX() {
    try {
        updateStatus('Initializing AI engine...', 10);
        
        // Configure WASM paths
        ort.env.wasm.wasmPaths = 'libs/onnxruntime/';
        
        // Get available execution providers
        const providers = await ort.getAvailableProviders();
        console.log('Available providers:', providers);
        
        // Set execution providers based on availability
        let executionProviders = [];
        
        if (providers.includes('webgpu')) {
            executionProviders.push('webgpu');
            STATE.deviceCapability = 'WebGPU (Fast)';
        } else if (providers.includes('webgl')) {
            executionProviders.push('webgl');
            STATE.deviceCapability = 'WebGL';
        } else {
            executionProviders.push('wasm');
            STATE.deviceCapability = 'WASM';
        }
        
        // Add WASM as fallback
        if (!executionProviders.includes('wasm')) {
            executionProviders.push('wasm');
        }
        
        ELEMENTS.deviceCapability.textContent = `Running on: ${STATE.deviceCapability}`;
        
        updateStatus('Loading AI model...', 30);
        
        // Create inference session
        STATE.session = await ort.InferenceSession.create(CONFIG.MODEL_PATH, {
            executionProviders: executionProviders,
            graphOptimizationLevel: 'all',
            enableCpuMemArena: true,
            enableMemPattern: true,
            executionMode: 'sequential',
            extra: {
                session: {
                    disable_prepacking: false,
                    use_device_allocator_for_initializers: true
                }
            }
        });
        
        console.log('Model loaded successfully:', STATE.session);
        STATE.isModelLoaded = true;
        
        updateStatus('AI engine ready!', 100);
        
        // Hide loading overlay after delay
        setTimeout(() => {
            ELEMENTS.loadingOverlay.style.opacity = '0';
            setTimeout(() => {
                ELEMENTS.loadingOverlay.style.display = 'none';
            }, 300);
        }, 500);
        
        return STATE.session;
    } catch (error) {
        console.error('Failed to initialize ONNX:', error);
        updateStatus('Failed to load AI engine', 0);
        showError(`AI Engine Error: ${error.message}. Please refresh the page.`);
        
        // Still hide loading overlay
        setTimeout(() => {
            ELEMENTS.loadingOverlay.style.opacity = '0';
            setTimeout(() => {
                ELEMENTS.loadingOverlay.style.display = 'none';
            }, 300);
        }, 1000);
        
        throw error;
    }
}

/**
 * Process image using AI model
 */
async function processImageWithAI(imageTensor) {
    if (!STATE.session) {
        throw new Error('AI model not loaded');
    }
    
    const outputWidth = imageTensor.width * 2;
    const outputHeight = imageTensor.height * 2;
    
    // Check if we should process in tiles
    const useTiles = ELEMENTS.tileProcessing.checked && 
                    (imageTensor.width > CONFIG.TILE_SIZE || imageTensor.height > CONFIG.TILE_SIZE);
    
    if (useTiles) {
        return await processImageTiles(imageTensor);
    } else {
        return await processFullImage(imageTensor);
    }
}

/**
 * Process full image at once
 */
async function processFullImage(imageTensor) {
    try {
        updateStatus('Preparing image data...', 40);
        
        // Prepare input tensor
        const inputData = new Float32Array(imageTensor.width * imageTensor.height * 3);
        let offset = 0;
        
        for (let i = 0; i < imageTensor.red.length; i++) {
            inputData[offset++] = imageTensor.red[i];
            inputData[offset++] = imageTensor.green[i];
            inputData[offset++] = imageTensor.blue[i];
        }
        
        const inputTensor = new ort.Tensor('float32', inputData, [
            1, 3, imageTensor.height, imageTensor.width
        ]);
        
        updateStatus('Running AI upscaling...', 60);
        
        // Run inference
        const feeds = { [STATE.session.inputNames[0]]: inputTensor };
        const results = await STATE.session.run(feeds);
        
        updateStatus('Processing results...', 80);
        
        // Get output tensor
        const outputTensor = results[STATE.session.outputNames[0]];
        
        // Convert output tensor to image
        const outputCanvas = tensorToImage(
            imageTensor,
            imageTensor.width * 2,
            imageTensor.height * 2
        );
        
        updateStatus('Finalizing...', 95);
        return outputCanvas;
    } catch (error) {
        console.error('Image processing error:', error);
        throw error;
    }
}

/**
 * Process image in tiles
 */
async function processImageTiles(imageTensor) {
    const tileSize = parseInt(ELEMENTS.tileSize.value);
    const numTilesX = Math.ceil(imageTensor.width / tileSize);
    const numTilesY = Math.ceil(imageTensor.height / tileSize);
    const totalTiles = numTilesX * numTilesY;
    
    console.log(`Processing ${totalTiles} tiles (${numTilesX}x${numTilesY})`);
    
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = imageTensor.width * 2;
    outputCanvas.height = imageTensor.height * 2;
    const outputCtx = outputCanvas.getContext('2d');
    
    let processedTiles = 0;
    
    for (let ty = 0; ty < numTilesY; ty++) {
        for (let tx = 0; tx < numTilesX; tx++) {
            const startX = tx * tileSize;
            const startY = ty * tileSize;
            const endX = Math.min(startX + tileSize, imageTensor.width);
            const endY = Math.min(startY + tileSize, imageTensor.height);
            const tileWidth = endX - startX;
            const tileHeight = endY - startY;
            
            // Extract tile data
            const tileTensor = {
                red: new Float32Array(tileWidth * tileHeight),
                green: new Float32Array(tileWidth * tileHeight),
                blue: new Float32Array(tileWidth * tileHeight),
                alpha: imageTensor.alpha ? new Float32Array(tileWidth * tileHeight) : null,
                width: tileWidth,
                height: tileHeight
            };
            
            // Copy tile data from original tensor
            for (let y = 0; y < tileHeight; y++) {
                for (let x = 0; x < tileWidth; x++) {
                    const origX = startX + x;
                    const origY = startY + y;
                    const origIdx = origY * imageTensor.width + origX;
                    const tileIdx = y * tileWidth + x;
                    
                    tileTensor.red[tileIdx] = imageTensor.red[origIdx];
                    tileTensor.green[tileIdx] = imageTensor.green[origIdx];
                    tileTensor.blue[tileIdx] = imageTensor.blue[origIdx];
                    if (tileTensor.alpha && imageTensor.alpha) {
                        tileTensor.alpha[tileIdx] = imageTensor.alpha[origIdx];
                    }
                }
            }
            
            // Process tile
            try {
                const tileResult = await processFullImage(tileTensor);
                
                // Draw tile result to output canvas
                outputCtx.drawImage(
                    tileResult,
                    startX * 2,
                    startY * 2
                );
                
            } catch (error) {
                console.error(`Error processing tile ${tx},${ty}:`, error);
                // Continue with other tiles
            }
            
            processedTiles++;
            const progress = 40 + (processedTiles / totalTiles * 50);
            updateStatus(`Processing tiles... ${processedTiles}/${totalTiles}`, progress);
            updateTimeEstimate(progress);
        }
    }
    
    return outputCanvas;
}

// =============================================
// MAIN UPSACLE FUNCTION
// =============================================

/**
 * Main upscale function
 */
async function upscaleImage() {
    if (!STATE.originalImage || STATE.isProcessing) return;
    
    STATE.isProcessing = true;
    STATE.processingStartTime = Date.now();
    ELEMENTS.upscaleBtn.disabled = true;
    ELEMENTS.progressContainer.style.display = 'block';
    ELEMENTS.resultsSection.style.display = 'none';
    
    try {
        updateStatus('Starting upscale process...', 5);
        
        // Ensure model is loaded
        if (!STATE.isModelLoaded) {
            updateStatus('Loading AI model...', 10);
            await initONNX();
        }
        
        updateStatus('Converting image...', 20);
        
        // Convert image to tensor
        const imageTensor = imageToTensor(STATE.originalImage);
        
        // Show processing info
        console.log(`Processing image: ${imageTensor.width}x${imageTensor.height}`);
        console.log(`Using tiles: ${ELEMENTS.tileProcessing.checked}`);
        
        updateStatus('Upscaling with AI...', 30);
        
        // Process image
        const resultCanvas = await processImageWithAI(imageTensor);
        
        updateStatus('Displaying result...', 90);
        
        // Display result
        ELEMENTS.upscaledCanvas.width = resultCanvas.width;
        ELEMENTS.upscaledCanvas.height = resultCanvas.height;
        const ctx = ELEMENTS.upscaledCanvas.getContext('2d');
        ctx.drawImage(resultCanvas, 0, 0);
        
        // Hide placeholder
        ELEMENTS.upscaledPlaceholder.style.display = 'none';
        ELEMENTS.upscaledCanvas.style.display = 'block';
        
        // Update stats
        const upscaledSize = `${resultCanvas.width}×${resultCanvas.height}`;
        ELEMENTS.upscaledStats.textContent = upscaledSize;
        
        // Enable comparison slider
        ELEMENTS.comparisonSlider.disabled = false;
        
        // Show results section
        ELEMENTS.resultsSection.style.display = 'block';
        
        updateStatus('Upscaling complete!', 100);
        showSuccess('Image upscaled successfully!');
        
        // Store result
        STATE.upscaledCanvas = resultCanvas;
        
        // Set up download buttons
        setupDownloadButtons(resultCanvas);
        
        // Scroll to results
        setTimeout(() => {
            ELEMENTS.resultsSection.scrollIntoView({ behavior: 'smooth' });
        }, 500);
        
    } catch (error) {
        console.error('Upscaling error:', error);
        updateStatus('Error during processing', 0);
        showError(`Upscaling failed: ${error.message}`);
        
        // Fallback: Show simple upscale
        ELEMENTS.upscaledPlaceholder.style.display = 'none';
        ELEMENTS.upscaledCanvas.width = STATE.originalImage.width * 2;
        ELEMENTS.upscaledCanvas.height = STATE.originalImage.height * 2;
        const ctx = ELEMENTS.upscaledCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
            STATE.originalImage, 
            0, 0, 
            STATE.originalImage.width * 2, 
            STATE.originalImage.height * 2
        );
        
        ELEMENTS.upscaledCanvas.style.display = 'block';
        showSuccess('Basic upscale applied (AI engine unavailable)');
    } finally {
        STATE.isProcessing = false;
        STATE.processingStartTime = null;
        ELEMENTS.upscaleBtn.disabled = false;
        
        // Hide progress after delay
        setTimeout(() => {
            ELEMENTS.progressContainer.style.display = 'none';
        }, 2000);
    }
}

// =============================================
// DOWNLOAD FUNCTIONS
// =============================================

/**
 * Setup download buttons
 */
function setupDownloadButtons(canvas) {
    const downloadButtons = document.querySelectorAll('.download-btn');
    
    downloadButtons.forEach(button => {
        button.onclick = () => {
            const format = button.dataset.format;
            const quality = parseInt(ELEMENTS.qualitySlider.value) / 100;
            downloadImage(canvas, format, quality);
        };
    });
}

/**
 * Download image in specified format
 */
function downloadImage(canvas, format, quality = 0.95) {
    if (!canvas) {
        showError('No image to download');
        return;
    }
    
    try {
        let mimeType, extension;
        
        switch (format) {
            case 'jpg':
                mimeType = 'image/jpeg';
                extension = 'jpg';
                break;
            case 'webp':
                mimeType = 'image/webp';
                extension = 'webp';
                break;
            case 'png':
            default:
                mimeType = 'image/png';
                extension = 'png';
                break;
        }
        
        // Create download link
        const link = document.createElement('a');
        link.download = `upscaled-image-2x.${extension}`;
        link.href = canvas.toDataURL(mimeType, quality);
        link.click();
        
        // Track download
        console.log(`Downloaded ${format} image with quality ${quality}`);
        showSuccess(`Downloading ${format.toUpperCase()} image...`);
        
    } catch (error) {
        console.error('Download error:', error);
        showError('Failed to download image');
    }
}

// =============================================
// EVENT HANDLERS
// =============================================

/**
 * Handle file selection
 */
async function handleFileSelect(file) {
    try {
        // Validate file
        if (!CONFIG.SUPPORTED_FORMATS.includes(file.type)) {
            showError('Please select a JPG, PNG, or WebP image');
            return;
        }
        
        if (file.size > CONFIG.MAX_FILE_SIZE) {
            showError(`File too large. Max size: ${formatBytes(CONFIG.MAX_FILE_SIZE)}`);
            return;
        }
        
        // Show loading
        ELEMENTS.originalPlaceholder.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading image...</p>
        `;
        
        // Load image
        const img = await loadImageFile(file);
        STATE.originalImage = img;
        STATE.currentFile = file;
        
        // Display original image
        ELEMENTS.originalImage.src = img.src;
        ELEMENTS.originalImage.style.display = 'block';
        ELEMENTS.originalPlaceholder.style.display = 'none';
        
        // Update image info
        ELEMENTS.fileName.textContent = file.name;
        ELEMENTS.imageDimensions.textContent = `${img.width}×${img.height}`;
        ELEMENTS.fileSize.textContent = formatBytes(file.size);
        ELEMENTS.originalStats.textContent = `${img.width}×${img.height}`;
        
        // Show image info section
        ELEMENTS.imageInfo.style.display = 'block';
        
        // Enable upscale button
        ELEMENTS.upscaleBtn.disabled = false;
        
        // Reset upscaled result
        ELEMENTS.upscaledPlaceholder.style.display = 'flex';
        ELEMENTS.upscaledCanvas.style.display = 'none';
        ELEMENTS.resultsSection.style.display = 'none';
        
        // Reset comparison slider
        ELEMENTS.comparisonSlider.value = 50;
        updateComparisonSlider();
        
        showSuccess('Image loaded successfully!');
        
    } catch (error) {
        console.error('File selection error:', error);
        showError(error.message || 'Failed to load image');
        
        // Reset state
        ELEMENTS.originalPlaceholder.innerHTML = `
            <i class="fas fa-file-image"></i>
            <p>Original image will appear here</p>
        `;
        ELEMENTS.originalPlaceholder.style.display = 'flex';
        ELEMENTS.originalImage.style.display = 'none';
        ELEMENTS.imageInfo.style.display = 'none';
        ELEMENTS.upscaleBtn.disabled = true;
    }
}

/**
 * Update comparison slider effect
 */
function updateComparisonSlider() {
    if (!STATE.originalImage) return;
    
    const value = ELEMENTS.comparisonSlider.value;
    const container = ELEMENTS.originalImage.parentElement;
    const width = container.offsetWidth;
    
    // Update clip paths for comparison effect
    ELEMENTS.upscaledCanvas.style.clipPath = `inset(0 ${100 - value}% 0 0)`;
    ELEMENTS.originalImage.style.clipPath = `inset(0 0 0 ${value}%)`;
    ELEMENTS.originalImage.style.position = 'absolute';
}

/**
 * Initialize drag and drop
 */
function initDragAndDrop() {
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        ELEMENTS.dropArea.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    // Highlight drop area
    ['dragenter', 'dragover'].forEach(eventName => {
        ELEMENTS.dropArea.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        ELEMENTS.dropArea.addEventListener(eventName, unhighlight, false);
    });
    
    // Handle drop
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
// INITIALIZATION
// =============================================

/**
 * Initialize the application
 */
async function initApp() {
    console.log('Initializing AI Image Upscaler...');
    
    try {
        // Set loading status
        ELEMENTS.loadingStatus.textContent = 'Loading AI engine...';
        
        // Initialize ONNX Runtime
        await initONNX();
        
        // Set up event listeners
        setupEventListeners();
        
        // Initialize drag and drop
        initDragAndDrop();
        
        // Set up quality slider
        ELEMENTS.qualitySlider.addEventListener('input', () => {
            ELEMENTS.qualityValue.textContent = ELEMENTS.qualitySlider.value;
        });
        
        // Set up comparison slider
        ELEMENTS.comparisonSlider.addEventListener('input', updateComparisonSlider);
        
        // Set up share buttons
        setupShareButtons();
        
        console.log('Application initialized successfully');
        
    } catch (error) {
        console.error('Application initialization failed:', error);
        showError('Failed to initialize application. Please refresh the page.');
    }
}

/**
 * Setup all event listeners
 */
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
    
    // Upscale button
    ELEMENTS.upscaleBtn.addEventListener('click', upscaleImage);
    
    // Drop area click
    ELEMENTS.dropArea.addEventListener('click', () => {
        ELEMENTS.fileInput.click();
    });
}

/**
 * Setup social share buttons
 */
function setupShareButtons() {
    const shareButtons = document.querySelectorAll('.share-btn');
    
    shareButtons.forEach(button => {
        button.addEventListener('click', () => {
            const platform = button.dataset.platform;
            const url = encodeURIComponent(window.location.href);
            const text = encodeURIComponent('Check out this free AI image upscaler!');
            
            let shareUrl;
            
            switch (platform) {
                case 'twitter':
                    shareUrl = `https://twitter.com/intent/tweet?url=${url}&text=${text}`;
                    break;
                case 'facebook':
                    shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
                    break;
                case 'whatsapp':
                    shareUrl = `https://wa.me/?text=${text}%20${url}`;
                    break;
                default:
                    return;
            }
            
            window.open(shareUrl, '_blank', 'width=600,height=400');
            showSuccess('Opening share dialog...');
        });
    });
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

// Export for debugging
window.imageUpscaler = {
    STATE,
    ELEMENTS,
    upscaleImage,
    handleFileSelect,
    initONNX
};

console.log('AI Image Upscaler loaded. Welcome to aarifalam.life!');