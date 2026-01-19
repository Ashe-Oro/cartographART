const API_BASE = '';
let currentJobId = null;
let pollInterval = null;
let startTime = null;

// Load themes on page load
async function loadThemes() {
    try {
        const response = await fetch(`${API_BASE}/api/themes`);
        const data = await response.json();

        const gallery = document.getElementById('theme-gallery');

        data.themes.forEach((theme) => {
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
        });
    } catch (error) {
        console.error('Failed to load themes:', error);
    }
}

// Select theme from gallery
function selectTheme(themeId, card) {
    // Update hidden input
    document.getElementById('theme').value = themeId;

    // Update gallery selection
    document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
}

// Form submission
async function handleSubmit(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const state = formData.get('state')?.trim();
    const request = {
        city: formData.get('city'),
        state: state || null,
        country: formData.get('country'),
        theme: formData.get('theme'),
        distance: parseInt(formData.get('distance'))
    };

    try {
        // Show status section
        document.getElementById('order-form').classList.add('hidden');
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

        // Show form again after delay
        setTimeout(() => {
            document.getElementById('status').classList.add('hidden');
            document.getElementById('order-form').classList.remove('hidden');
        }, 3000);
    }
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
}

// Reset to create another poster
function resetForm() {
    currentJobId = null;
    startTime = null;
    if (pollInterval) clearTimeout(pollInterval);

    document.getElementById('result').classList.add('hidden');
    document.getElementById('order-form').classList.remove('hidden');
    document.getElementById('poster-form').reset();
    document.querySelector('.spinner').style.display = 'block';

    // Reset theme selection to feature_based
    document.getElementById('theme').value = 'feature_based';
    document.querySelectorAll('.theme-card').forEach((card) => {
        card.classList.toggle('selected', card.dataset.themeId === 'feature_based');
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadThemes();
    document.getElementById('poster-form').addEventListener('submit', handleSubmit);
    document.getElementById('new-poster-btn').addEventListener('click', resetForm);
});
