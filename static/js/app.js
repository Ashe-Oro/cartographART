import { fetchWithPayment, isConnected, openModal, getAddress } from './wallet.js';

const API_BASE = '';
const PHOTON_API = 'https://photon.komoot.io/api';
let currentJobId = null;
let websocket = null;  // WebSocket connection
let searchTimeout = null;
let selectedLocation = null;
let lastRequest = null;  // Store last request for re-theming
let selectedRetheme = null;  // Selected theme in result view
let currentTheme = null;
let titleRotationInterval = null;
let currentTitleIndex = 0;
let startTime = null;
let statusTimerInterval = null;
let currentStatusMessage = 'Processing...';
let currentProgress = 0;

// Witty status titles to rotate through while generating
const statusTitles = [
    "Crafting Your Map",
    "Cartography in Progress",
    "Mapping the Streets",
    "Drawing Every Alley",
    "Tracing Urban Arteries",
    "Plotting Your City",
    "Rendering the Grid",
    "Weaving Street Patterns",
    "Capturing the Layout",
    "Charting Territory",
    "Sketching the Cityscape",
    "Inking the Roads"
];

// Update status text with elapsed time
function updateStatusWithTime() {
    if (!startTime) return;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const timeStr = elapsed > 60
        ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
        : `${elapsed}s`;
    document.getElementById('status-text').textContent = `${currentStatusMessage} (${currentProgress}% - ${timeStr})`;
}

// Start the status timer
function startStatusTimer() {
    startTime = Date.now();
    currentStatusMessage = 'Processing...';
    currentProgress = 0;
    // Update every second
    statusTimerInterval = setInterval(updateStatusWithTime, 1000);
}

// Stop the status timer
function stopStatusTimer() {
    if (statusTimerInterval) {
        clearInterval(statusTimerInterval);
        statusTimerInterval = null;
    }
    startTime = null;
}

// Load gallery on page load
async function loadGallery() {
    try {
        const response = await fetch(`${API_BASE}/api/gallery?limit=12`);
        const data = await response.json();
        renderGallery(data.posters);
    } catch (error) {
        console.error('Failed to load gallery:', error);
    }
}

// Render gallery items
function renderGallery(posters) {
    const grid = document.getElementById('gallery-grid');
    if (!grid) return;

    if (!posters || posters.length === 0) {
        grid.innerHTML = '<div class="gallery-empty">No community artwork yet. Be the first!</div>';
        return;
    }

    grid.innerHTML = posters.map(poster => `
        <div class="gallery-item"
             data-job-id="${poster.jobId}"
             data-city="${poster.city}"
             data-country="${poster.country}"
             data-theme="${poster.themeName}"
             title="${poster.city}, ${poster.country}">
            <img class="gallery-item-img"
                 src="${API_BASE}/api/gallery/thumbnail/${poster.jobId}"
                 alt="${poster.city}, ${poster.country}"
                 loading="lazy">
            <div class="gallery-item-overlay">
                <div class="gallery-item-city">${poster.city}</div>
            </div>
        </div>
    `).join('');

    // Add click handlers for lightbox
    grid.querySelectorAll('.gallery-item').forEach(item => {
        item.addEventListener('click', () => openLightbox(item));
    });
}

// Open lightbox with poster
function openLightbox(item) {
    const lightbox = document.getElementById('lightbox');
    const lightboxImage = document.getElementById('lightbox-image');
    const lightboxCaption = document.getElementById('lightbox-caption');

    const jobId = item.dataset.jobId;
    const city = item.dataset.city;
    const country = item.dataset.country;
    const theme = item.dataset.theme;

    lightboxImage.src = `${API_BASE}/api/gallery/image/${jobId}`;
    lightboxCaption.innerHTML = `
        <div class="caption-city">${city}, ${country}</div>
        <div class="caption-theme">${theme}</div>
    `;

    lightbox.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

// Close lightbox
function closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    lightbox.classList.add('hidden');
    document.body.style.overflow = '';
}

// Setup lightbox event listeners
function setupLightbox() {
    const lightbox = document.getElementById('lightbox');
    const closeBtn = document.getElementById('lightbox-close');

    if (closeBtn) {
        closeBtn.addEventListener('click', closeLightbox);
    }

    if (lightbox) {
        // Close on background click
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) {
                closeLightbox();
            }
        });

        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !lightbox.classList.contains('hidden')) {
                closeLightbox();
            }
        });
    }
}

// Load themes on page load
async function loadThemes() {
    try {
        const response = await fetch(`${API_BASE}/api/themes`);
        const data = await response.json();

        const gallery = document.getElementById('theme-gallery');
        const rethemeGallery = document.getElementById('retheme-gallery');

        // Mini map SVG for theme previews
        const miniMapSvg = `
            <svg class="theme-mini-map" viewBox="0 0 60 80" preserveAspectRatio="xMidYMid slice">
                <g stroke="currentColor" fill="none" opacity="0.5">
                    <path d="M10,0 L10,80" stroke-width="0.8"/>
                    <path d="M25,0 L25,80" stroke-width="0.5"/>
                    <path d="M40,0 L40,80" stroke-width="0.8"/>
                    <path d="M55,0 L55,80" stroke-width="0.5"/>
                    <path d="M0,15 L60,15" stroke-width="0.5"/>
                    <path d="M0,35 L60,35" stroke-width="0.8"/>
                    <path d="M0,55 L60,55" stroke-width="0.5"/>
                </g>
                <g stroke="currentColor" fill="none" opacity="0.7">
                    <path d="M0,25 Q30,35 60,20" stroke-width="1.2"/>
                    <path d="M15,0 Q20,40 10,80" stroke-width="1"/>
                </g>
            </svg>
        `;

        data.themes.forEach((theme, index) => {
            // Main form gallery
            const card = document.createElement('div');
            card.className = 'theme-card' + (theme.id === 'feature_based' ? ' selected' : '');
            card.dataset.themeId = theme.id;
            card.dataset.bg = theme.bg;
            card.dataset.text = theme.text;
            card.innerHTML = `
                <div class="theme-preview" style="background: ${theme.bg}; color: ${theme.text}">
                    ${miniMapSvg}
                    <span class="theme-name">${theme.name}</span>
                </div>
            `;
            card.onclick = () => selectTheme(theme.id, card, theme);
            card.title = theme.description || theme.name;

            // Stagger animation
            card.style.animation = `fadeInUp 0.5s var(--ease-out) ${0.3 + index * 0.05}s both`;

            gallery.appendChild(card);

            // Retheme gallery (on result page)
            const rethemeCard = document.createElement('div');
            rethemeCard.className = 'theme-card';
            rethemeCard.dataset.themeId = theme.id;
            rethemeCard.innerHTML = `
                <div class="theme-preview" style="background: ${theme.bg}; color: ${theme.text}">
                    ${miniMapSvg}
                    <span class="theme-name">${theme.name}</span>
                </div>
            `;
            rethemeCard.onclick = () => selectRetheme(theme.id, rethemeCard);
            rethemeCard.title = theme.description || theme.name;
            rethemeGallery.appendChild(rethemeCard);

            // Set initial theme
            if (theme.id === 'feature_based') {
                currentTheme = theme;
                updatePreview(theme);
            }
        });
    } catch (error) {
        console.error('Failed to load themes:', error);
    }
}

// Select theme in retheme gallery
function selectRetheme(themeId, card) {
    document.querySelectorAll('#retheme-gallery .theme-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedRetheme = themeId;
}

// Select theme from gallery
function selectTheme(themeId, card, theme) {
    // Update hidden input
    document.getElementById('theme').value = themeId;
    currentTheme = theme;

    // Update gallery selection
    document.querySelectorAll('#theme-gallery .theme-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');

    // Update live preview
    updatePreview(theme);
}

// Update the live preview poster
function updatePreview(theme) {
    const poster = document.getElementById('preview-poster');
    const mapLines = document.querySelector('.map-lines');

    if (poster && theme) {
        poster.style.backgroundColor = theme.bg;
        poster.style.color = theme.text;

        // Update SVG stroke colors
        if (mapLines) {
            mapLines.style.color = theme.text;
        }
    }
}

// Update preview text when location is selected
function updatePreviewText() {
    const cityInput = document.getElementById('city');
    const countryInput = document.getElementById('country');
    const previewCity = document.getElementById('preview-city');
    const previewCountry = document.getElementById('preview-country');

    if (previewCity && cityInput) {
        previewCity.textContent = cityInput.value.toUpperCase() || 'YOUR CITY';
    }
    if (previewCountry && countryInput) {
        previewCountry.textContent = countryInput.value.toUpperCase() || 'AWAITS';
    }
}

// Location autocomplete
async function searchLocations(query) {
    if (query.length < 2) {
        hideAutocomplete();
        return;
    }

    const resultsDiv = document.getElementById('autocomplete-results');
    resultsDiv.innerHTML = '<div class="autocomplete-loading">Searching...</div>';
    resultsDiv.classList.remove('hidden');

    try {
        const response = await fetch(`${PHOTON_API}?q=${encodeURIComponent(query)}&limit=5`);
        const data = await response.json();

        if (data.features && data.features.length > 0) {
            // Filter out states, counties, and countries - only keep cities and smaller
            const excludedTypes = ['state', 'county', 'country', 'administrative'];
            const filteredFeatures = data.features.filter(feature => {
                const type = feature.properties.type || feature.properties.osm_value || '';
                return !excludedTypes.includes(type.toLowerCase());
            });

            if (filteredFeatures.length === 0) {
                resultsDiv.innerHTML = '<div class="autocomplete-loading">No cities found. Try a more specific search.</div>';
                return;
            }

            resultsDiv.innerHTML = filteredFeatures.map((feature, index) => {
                const props = feature.properties;
                const name = props.name || '';
                const city = props.city || props.name || '';
                const state = props.state || '';
                const country = props.country || '';

                // Build display string
                const details = [state, country].filter(Boolean).join(', ');

                return `
                    <div class="autocomplete-item" data-index="${index}">
                        <div class="place-name">${name}</div>
                        ${details ? `<div class="place-details">${details}</div>` : ''}
                    </div>
                `;
            }).join('');

            // Store filtered features for selection
            resultsDiv.dataset.features = JSON.stringify(filteredFeatures);

            // Add click handlers
            resultsDiv.querySelectorAll('.autocomplete-item').forEach(item => {
                item.addEventListener('click', () => selectLocation(parseInt(item.dataset.index)));
            });
        } else {
            resultsDiv.innerHTML = '<div class="autocomplete-loading">No results found</div>';
        }
    } catch (error) {
        console.error('Search failed:', error);
        resultsDiv.innerHTML = '<div class="autocomplete-loading">Search failed</div>';
    }
}

function selectLocation(index) {
    const resultsDiv = document.getElementById('autocomplete-results');
    const features = JSON.parse(resultsDiv.dataset.features || '[]');
    const feature = features[index];

    if (!feature) return;

    const props = feature.properties;

    // Extract location components
    const city = props.name || props.city || '';
    const state = props.state || '';
    const country = props.country || '';

    // Update hidden form fields
    document.getElementById('city').value = city;
    document.getElementById('state').value = state;
    document.getElementById('country').value = country;

    // Update visible input with formatted location
    const displayParts = [city, state, country].filter(Boolean);
    document.getElementById('location-search').value = displayParts.join(', ');

    // Store selected location
    selectedLocation = { city, state, country };

    // Update live preview
    updatePreviewText();

    hideAutocomplete();
}

function hideAutocomplete() {
    document.getElementById('autocomplete-results').classList.add('hidden');
}

function setupAutocomplete() {
    const searchInput = document.getElementById('location-search');
    const resultsDiv = document.getElementById('autocomplete-results');

    // Debounced search on input
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        selectedLocation = null; // Clear selection when user types

        searchTimeout = setTimeout(() => {
            searchLocations(e.target.value);
        }, 300);
    });

    // Hide results when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-wrapper')) {
            hideAutocomplete();
        }
    });

    // Keyboard navigation
    searchInput.addEventListener('keydown', (e) => {
        const items = resultsDiv.querySelectorAll('.autocomplete-item');
        const activeItem = resultsDiv.querySelector('.autocomplete-item.active');
        let activeIndex = -1;

        if (activeItem) {
            activeIndex = Array.from(items).indexOf(activeItem);
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (activeItem) activeItem.classList.remove('active');
            const nextIndex = (activeIndex + 1) % items.length;
            items[nextIndex]?.classList.add('active');
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (activeItem) activeItem.classList.remove('active');
            const prevIndex = activeIndex <= 0 ? items.length - 1 : activeIndex - 1;
            items[prevIndex]?.classList.add('active');
        } else if (e.key === 'Enter' && activeItem) {
            e.preventDefault();
            selectLocation(parseInt(activeItem.dataset.index));
        } else if (e.key === 'Escape') {
            hideAutocomplete();
        }
    });
}

// Update wallet status display
function updateWalletStatus() {
    const statusElement = document.querySelector('.wallet-status');
    if (!statusElement) return;

    if (isConnected()) {
        const address = getAddress();
        const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
        statusElement.textContent = shortAddress;
        statusElement.classList.add('connected');
    } else {
        statusElement.textContent = 'Connect Wallet';
        statusElement.classList.remove('connected');
    }
}

// Form submission
async function handleSubmit(event) {
    event.preventDefault();

    // Validate location was selected
    const city = document.getElementById('city').value;
    const country = document.getElementById('country').value;

    if (!city || !country) {
        alert('Please select a location from the suggestions');
        document.getElementById('location-search').focus();
        return;
    }

    // Check wallet connection - prompt to connect if not connected
    if (!isConnected()) {
        const shouldConnect = confirm('Wallet not connected. This poster costs $0.10 USDC. Connect wallet to proceed?');
        if (shouldConnect) {
            await openModal();
            // Wait a moment for connection
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (!isConnected()) {
                alert('Please connect your wallet to continue');
                return;
            }
        } else {
            return;
        }
    }

    const formData = new FormData(event.target);
    const state = formData.get('state')?.trim();
    const showInGallery = document.getElementById('show-in-gallery')?.checked !== false;
    const request = {
        city: city,
        state: state || null,
        country: country,
        theme: formData.get('theme'),
        size: formData.get('size'),
        showInGallery: showInGallery
    };

    // Store for re-theming
    lastRequest = { ...request };

    submitPosterRequest(request, 'order-form');
}

// Start rotating status titles
function startTitleRotation() {
    currentTitleIndex = 0;
    const titleElement = document.querySelector('.status-title');
    if (titleElement) {
        titleElement.textContent = statusTitles[0];
    }

    // Rotate every 4 seconds
    titleRotationInterval = setInterval(() => {
        currentTitleIndex = (currentTitleIndex + 1) % statusTitles.length;
        if (titleElement) {
            titleElement.style.opacity = '0';
            setTimeout(() => {
                titleElement.textContent = statusTitles[currentTitleIndex];
                titleElement.style.opacity = '1';
            }, 300);
        }
    }, 4000);
}

// Stop rotating status titles
function stopTitleRotation() {
    if (titleRotationInterval) {
        clearInterval(titleRotationInterval);
        titleRotationInterval = null;
    }
}

// Submit poster request (used by both form and retheme)
async function submitPosterRequest(request, hideSection) {
    try {
        // Show status section
        document.getElementById(hideSection).classList.add('hidden');
        document.getElementById('status').classList.remove('hidden');
        document.getElementById('status-text').textContent = 'Initializing payment...';
        document.getElementById('progress').style.width = '0%';

        // Start rotating titles
        startTitleRotation();

        // Submit request with payment handling (fetchWithPayment handles 402 automatically)
        const response = await fetchWithPayment(`${API_BASE}/api/posters`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Request failed');
        }

        const result = await response.json();
        currentJobId = result.job_id;

        document.getElementById('status-text').textContent = 'Payment confirmed! Connecting to server...';
        startStatusTimer();

        // Connect WebSocket for real-time updates
        connectJobWebSocket(currentJobId);

    } catch (error) {
        console.error('Request failed:', error);
        stopTitleRotation();
        document.getElementById('status-text').textContent = `Error: ${error.message}`;

        // Show previous section again after delay
        setTimeout(() => {
            document.getElementById('status').classList.add('hidden');
            document.getElementById(hideSection).classList.remove('hidden');
        }, 3000);
    }
}

// Apply a different theme to the same location
async function applyNewTheme() {
    if (!selectedRetheme) {
        alert('Please select a theme first');
        return;
    }

    if (!lastRequest) {
        alert('No previous request found');
        return;
    }

    // Check wallet connection for re-theming (also requires payment)
    if (!isConnected()) {
        const shouldConnect = confirm('Wallet not connected. Re-theming costs $0.10 USDC. Connect wallet to proceed?');
        if (shouldConnect) {
            await openModal();
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (!isConnected()) {
                alert('Please connect your wallet to continue');
                return;
            }
        } else {
            return;
        }
    }

    // Create new request with different theme
    const request = { ...lastRequest, theme: selectedRetheme };
    lastRequest = request;  // Update stored request

    submitPosterRequest(request, 'result');
}

// Connect to WebSocket for real-time job updates
function connectJobWebSocket(jobId) {
    // Determine WebSocket URL (ws:// or wss:// based on current protocol)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/jobs/${jobId}`;

    console.log(`Connecting to WebSocket: ${wsUrl}`);
    websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
        console.log('WebSocket connected');
    };

    websocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('WebSocket message:', data);

        if (data.type === 'job_update') {
            handleJobUpdate(data);
        }
    };

    websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        // Fall back to polling if WebSocket fails
        fallbackToPolling();
    };

    websocket.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        websocket = null;
    };
}

// Close WebSocket connection
function closeWebSocket() {
    if (websocket) {
        websocket.close();
        websocket = null;
    }
}

// Handle job update from WebSocket
function handleJobUpdate(data) {
    // Update progress bar
    document.getElementById('progress').style.width = `${data.progress}%`;

    const progress = data.progress || 0;

    // Store the current status message for the timer to use
    if (data.status === 'processing') {
        currentStatusMessage = data.message || 'Processing...';
        currentProgress = progress;
    }

    switch (data.status) {
        case 'pending':
            document.getElementById('status-text').textContent = 'Queued for processing...';
            break;

        case 'processing':
            // Message will be updated by the timer interval
            updateStatusWithTime();
            break;

        case 'completed':
            stopTitleRotation();
            stopStatusTimer();
            closeWebSocket();
            showResult({
                job_id: data.job_id,
                status: data.status,
                download_url: data.download_url
            });
            break;

        case 'failed':
            stopTitleRotation();
            stopStatusTimer();
            closeWebSocket();
            document.getElementById('status-text').textContent =
                `Generation failed: ${data.error || 'Unknown error'}`;
            document.querySelector('.status-rings').style.display = 'none';
            break;
    }
}

// Fallback to polling if WebSocket fails
function fallbackToPolling() {
    console.log('Falling back to polling...');
    pollJobStatus();
}

// Poll job status (fallback for WebSocket failure)
async function pollJobStatus() {
    if (!currentJobId) return;

    try {
        const response = await fetch(`${API_BASE}/api/jobs/${currentJobId}`);
        const job = await response.json();

        handleJobUpdate({
            job_id: job.job_id,
            status: job.status,
            progress: job.progress,
            message: job.message,
            error: job.error,
            download_url: job.download_url
        });

        // Continue polling if not finished
        if (job.status === 'pending' || job.status === 'processing') {
            setTimeout(pollJobStatus, 3000);
        }
    } catch (error) {
        console.error('Status check failed:', error);
        setTimeout(pollJobStatus, 5000);
    }
}

// Show completed result
function showResult(job) {
    document.getElementById('status').classList.add('hidden');
    document.getElementById('result').classList.remove('hidden');

    // Switch right panel from preview to result display
    document.getElementById('preview-content').classList.add('hidden');
    document.getElementById('result-display').classList.remove('hidden');

    const imageUrl = `${API_BASE}/api/posters/${job.job_id}`;
    document.getElementById('result-image').src = imageUrl;
    document.getElementById('download-btn').href = imageUrl;

    // Make the result image clickable to download
    document.getElementById('result-image').onclick = () => {
        window.open(imageUrl, '_blank');
    };

    // Highlight current theme in retheme gallery
    const currentThemeId = lastRequest?.theme || 'feature_based';
    selectedRetheme = null;
    document.querySelectorAll('#retheme-gallery .theme-card').forEach(card => {
        card.classList.toggle('selected', card.dataset.themeId === currentThemeId);
    });

    // Refresh gallery after completion
    loadGallery();
}

// Reset to create another poster
function resetForm() {
    currentJobId = null;
    selectedLocation = null;
    stopStatusTimer();
    closeWebSocket();  // Close any open WebSocket connection

    document.getElementById('result').classList.add('hidden');
    document.getElementById('order-form').classList.remove('hidden');
    document.getElementById('poster-form').reset();

    // Switch right panel back to preview
    document.getElementById('result-display').classList.add('hidden');
    document.getElementById('preview-content').classList.remove('hidden');

    // Reset status visual
    const statusRings = document.querySelector('.status-rings');
    if (statusRings) statusRings.style.display = 'block';

    // Clear location fields
    document.getElementById('location-search').value = '';
    document.getElementById('city').value = '';
    document.getElementById('state').value = '';
    document.getElementById('country').value = '';

    // Reset theme selection to feature_based
    document.getElementById('theme').value = 'feature_based';
    document.querySelectorAll('#theme-gallery .theme-card').forEach((card) => {
        const isDefault = card.dataset.themeId === 'feature_based';
        card.classList.toggle('selected', isDefault);
        if (isDefault && card.dataset.bg) {
            updatePreview({
                bg: card.dataset.bg,
                text: card.dataset.text
            });
        }
    });

    // Reset preview text
    const previewCity = document.getElementById('preview-city');
    const previewCountry = document.getElementById('preview-country');
    if (previewCity) previewCity.textContent = 'YOUR CITY';
    if (previewCountry) previewCountry.textContent = 'AWAITS';
}

// Handle header fade on scroll
function setupHeaderScroll() {
    const formPanel = document.querySelector('.panel-form');
    const navLogo = document.querySelector('.nav-logo');
    const navTagline = document.querySelector('.nav-tagline');

    if (!formPanel || !navLogo || !navTagline) return;

    formPanel.addEventListener('scroll', () => {
        const scrollY = formPanel.scrollTop;
        const fadeStart = 50;  // Start fading at 50px scroll
        const fadeEnd = 150;   // Fully faded at 150px scroll

        // Calculate opacity (1 at top, 0 after fadeEnd)
        let opacity = 1 - Math.min(Math.max((scrollY - fadeStart) / (fadeEnd - fadeStart), 0), 1);

        // Calculate font scale (1 at top, smaller after scroll)
        const minScale = 0.6;
        let scale = 1 - (1 - minScale) * (1 - opacity);

        navLogo.style.opacity = opacity;
        navTagline.style.opacity = opacity;
        navLogo.style.fontSize = `${1.4 * scale}rem`;
        navTagline.style.fontSize = `${1.3 * scale}rem`;
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadThemes();
    loadGallery();
    setupAutocomplete();
    setupLightbox();
    setupHeaderScroll();

    const form = document.getElementById('poster-form');
    if (form) {
        form.addEventListener('submit', handleSubmit);
    }

    const newBtn = document.getElementById('new-poster-btn');
    if (newBtn) {
        newBtn.addEventListener('click', resetForm);
    }

    const applyBtn = document.getElementById('apply-theme-btn');
    if (applyBtn) {
        applyBtn.addEventListener('click', applyNewTheme);
    }

    // Update wallet status periodically
    setInterval(updateWalletStatus, 2000);
});
