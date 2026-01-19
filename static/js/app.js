const API_BASE = '';
const PHOTON_API = 'https://photon.komoot.io/api';
let currentJobId = null;
let pollInterval = null;
let startTime = null;
let searchTimeout = null;
let selectedLocation = null;
let lastRequest = null;  // Store last request for re-theming
let selectedRetheme = null;  // Selected theme in result view

// Load themes on page load
async function loadThemes() {
    try {
        const response = await fetch(`${API_BASE}/api/themes`);
        const data = await response.json();

        const gallery = document.getElementById('theme-gallery');
        const rethemeGallery = document.getElementById('retheme-gallery');

        data.themes.forEach((theme) => {
            // Main form gallery
            const card = document.createElement('div');
            card.className = 'theme-card' + (theme.id === 'feature_based' ? ' selected' : '');
            card.dataset.themeId = theme.id;
            card.innerHTML = `
                <div class="theme-preview" style="background: ${theme.bg}; color: ${theme.text}">
                    ${theme.name}
                </div>
            `;
            card.onclick = () => selectTheme(theme.id, card);
            card.title = theme.description || theme.name;
            gallery.appendChild(card);

            // Retheme gallery (on result page)
            const rethemeCard = document.createElement('div');
            rethemeCard.className = 'theme-card';
            rethemeCard.dataset.themeId = theme.id;
            rethemeCard.innerHTML = `
                <div class="theme-preview" style="background: ${theme.bg}; color: ${theme.text}">
                    ${theme.name}
                </div>
            `;
            rethemeCard.onclick = () => selectRetheme(theme.id, rethemeCard);
            rethemeCard.title = theme.description || theme.name;
            rethemeGallery.appendChild(rethemeCard);
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
function selectTheme(themeId, card) {
    // Update hidden input
    document.getElementById('theme').value = themeId;

    // Update gallery selection
    document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
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
            resultsDiv.innerHTML = data.features.map((feature, index) => {
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

            // Store features for selection
            resultsDiv.dataset.features = JSON.stringify(data.features);

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

    const formData = new FormData(event.target);
    const state = formData.get('state')?.trim();
    const request = {
        city: city,
        state: state || null,
        country: country,
        theme: formData.get('theme'),
        size: formData.get('size')
    };

    // Store for re-theming
    lastRequest = { ...request };

    submitPosterRequest(request, 'order-form');
}

// Submit poster request (used by both form and retheme)
async function submitPosterRequest(request, hideSection) {
    try {
        // Show status section
        document.getElementById(hideSection).classList.add('hidden');
        document.getElementById('status').classList.remove('hidden');
        document.getElementById('status-text').textContent = 'Starting generation...';
        document.getElementById('progress').style.width = '0%';

        // Submit request
        const response = await fetch(`${API_BASE}/api/posters`, {
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

        document.getElementById('status-text').textContent = 'Generating poster...';
        startTime = Date.now();

        // Start polling for status
        pollJobStatus();

    } catch (error) {
        console.error('Request failed:', error);
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

    // Create new request with different theme
    const request = { ...lastRequest, theme: selectedRetheme };
    lastRequest = request;  // Update stored request

    submitPosterRequest(request, 'result');
}

// Poll job status
async function pollJobStatus() {
    if (!currentJobId) return;

    try {
        const response = await fetch(`${API_BASE}/api/jobs/${currentJobId}`);
        const job = await response.json();

        // Update progress bar
        document.getElementById('progress').style.width = `${job.progress}%`;

        switch (job.status) {
            case 'pending':
                document.getElementById('status-text').textContent = 'Waiting in queue...';
                pollInterval = setTimeout(pollJobStatus, 2000);
                break;

            case 'processing':
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
                document.getElementById('status-text').textContent =
                    `Generating poster... (${timeStr} elapsed, typically takes 1-3 minutes)`;
                pollInterval = setTimeout(pollJobStatus, 3000);
                break;

            case 'completed':
                showResult(job);
                break;

            case 'failed':
                document.getElementById('status-text').textContent =
                    `Generation failed: ${job.error}`;
                document.querySelector('.spinner').style.display = 'none';
                break;
        }
    } catch (error) {
        console.error('Status check failed:', error);
        pollInterval = setTimeout(pollJobStatus, 5000);
    }
}

// Show completed result
function showResult(job) {
    document.getElementById('status').classList.add('hidden');
    document.getElementById('result').classList.remove('hidden');

    const imageUrl = `${API_BASE}/api/posters/${job.job_id}`;
    document.getElementById('result-image').src = imageUrl;
    document.getElementById('download-btn').href = imageUrl;

    // Highlight current theme in retheme gallery
    const currentTheme = lastRequest?.theme || 'feature_based';
    selectedRetheme = null;
    document.querySelectorAll('#retheme-gallery .theme-card').forEach(card => {
        card.classList.toggle('selected', card.dataset.themeId === currentTheme);
    });
}

// Reset to create another poster
function resetForm() {
    currentJobId = null;
    startTime = null;
    selectedLocation = null;
    if (pollInterval) clearTimeout(pollInterval);

    document.getElementById('result').classList.add('hidden');
    document.getElementById('order-form').classList.remove('hidden');
    document.getElementById('poster-form').reset();
    document.querySelector('.spinner').style.display = 'block';

    // Clear location fields
    document.getElementById('location-search').value = '';
    document.getElementById('city').value = '';
    document.getElementById('state').value = '';
    document.getElementById('country').value = '';

    // Reset theme selection to feature_based
    document.getElementById('theme').value = 'feature_based';
    document.querySelectorAll('.theme-card').forEach((card) => {
        card.classList.toggle('selected', card.dataset.themeId === 'feature_based');
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadThemes();
    setupAutocomplete();
    document.getElementById('poster-form').addEventListener('submit', handleSubmit);
    document.getElementById('new-poster-btn').addEventListener('click', resetForm);
    document.getElementById('apply-theme-btn').addEventListener('click', applyNewTheme);
});
