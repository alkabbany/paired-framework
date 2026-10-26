// ============================================================
// PAIRED Extension — Content Script
// Injected into Claude, ChatGPT, and Gemini conversation tabs.
// Responsibilities:
// 1. Extract conversation ID from URL
// 2. Render the PAIRED logging panel
// 3. Read conversation transcript from page DOM
// 4. Communicate with background service worker
// 5. Handle end-of-session trigger (manual + beforeunload)
// ============================================================

(function () {
    'use strict';

    // Prevent double injection
    if (document.getElementById('paired-panel')) return;

    // ----------------------------------------------------------
    // State
    // ----------------------------------------------------------
    let state = {
        isOpen:       false,
        isSignedIn:   false,
        user:         null,
        project:      null,
        view:         'loading', // loading | auth | project-setup | monitoring | review
        draftEntries: [],
        error:        null,
        isProcessing: false
    };

    // ----------------------------------------------------------
    // Platform detection + conversation ID extraction
    // ----------------------------------------------------------

    function detectPlatform() {
        const host = window.location.hostname;
        if (host.includes('claude.ai'))         return 'claude';
        if (host.includes('chatgpt.com'))       return 'chatgpt';
        if (host.includes('gemini.google.com')) return 'gemini';
        return null;
    }

    function extractConversationId() {
        const url = window.location.href;
        const patterns = {
            claude:  /claude\.ai\/chat\/([a-zA-Z0-9-]+)/,
            chatgpt: /chatgpt\.com\/c\/([a-zA-Z0-9-]+)/,
            gemini:  /gemini\.google\.com\/app\/([a-zA-Z0-9]+)/
        };
        const platform = detectPlatform();
        if (!platform || !patterns[platform]) return null;
        const match = url.match(patterns[platform]);
        return match ? match[1] : null;
    }

    // ----------------------------------------------------------
    // Transcript extraction per platform
    // ----------------------------------------------------------

    function extractTranscript() {
        console.log('PAIRED platform:', detectPlatform(), window.location.href);  // ADD THIS
        const platform = detectPlatform();
        let turns = [];

        try {
            if (platform === 'claude') {
                const allRows = document.querySelectorAll('[data-testid="transcript-row"]');
                allRows.forEach(row => {
                    try {
                        const human = row.querySelector('[data-testid="user-message"]');
                        const assistant = row.querySelector('[data-testid="assistant-message"]');
                        if (human && typeof human.innerText === 'string')
                            turns.push(`Human: ${human.innerText.trim()}`);
                        if (assistant && typeof assistant.innerText === 'string')
                            turns.push(`Assistant: ${assistant.innerText.trim()}`);
                    } catch (e) { /* skip this row */ }
                });
            } else if (platform === 'chatgpt') {
                const messages = document.querySelectorAll('[data-message-author-role]');
                turns = [...messages].map(el => {
                    const role = el.getAttribute('data-message-author-role');
                    return `${role === 'user' ? 'Human' : 'Assistant'}: ${el.innerText.trim()}`;
                });

            } else if (platform === 'gemini') {
                const queries = document.querySelectorAll('.query-text');
                const responses = document.querySelectorAll('.response-content');
                const len = Math.max(queries.length, responses.length);
                for (let i = 0; i < len; i++) {
                    if (queries[i])    turns.push(`Human: ${queries[i].innerText.trim()}`);
                    if (responses[i])  turns.push(`Assistant: ${responses[i].innerText.trim()}`);
                }
            }
        } catch (err) {
            console.error('PAIRED: Transcript extraction error:', err);
        }

        return turns.filter(t => t.replace(/^(Human:|Assistant:)\s*/, '').length > 0).join('\n\n');
    }

    // ----------------------------------------------------------
    // Message helper
    // ----------------------------------------------------------

    function sendMessage(type, data = {}) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type, ...data }, response => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
    }

    // ----------------------------------------------------------
    // DOM helpers
    // ----------------------------------------------------------

    function el(tag, attrs = {}, ...children) {
        const element = document.createElement(tag);
        Object.entries(attrs).forEach(([k, v]) => {
            if (k === 'className') element.className = v;
            else if (k === 'innerHTML') element.innerHTML = v;
            else if (k.startsWith('on')) element.addEventListener(k.slice(2).toLowerCase(), v);
            else element.setAttribute(k, v);
        });
        children.forEach(child => {
            if (typeof child === 'string') element.appendChild(document.createTextNode(child));
            else if (child) element.appendChild(child);
        });
        return element;
    }

    // ----------------------------------------------------------
    // Panel structure
    // ----------------------------------------------------------

    function buildPanel() {
        const toggle = el('button', { id: 'paired-toggle', title: 'Open PAIRED Logger' }, 'PAIRED');
        toggle.addEventListener('click', togglePanel);

        const panel = el('div', { id: 'paired-panel' });

        const header = el('div', { id: 'paired-header' });
        const title = el('div', { id: 'paired-header-title' });
        title.innerHTML = '<span>PAIRED</span> Logger';
        const closeBtn = el('button', { id: 'paired-close', title: 'Close panel' }, '×');
        closeBtn.addEventListener('click', togglePanel);
        header.appendChild(title);
        header.appendChild(closeBtn);

        const body = el('div', { id: 'paired-body' });
        const footer = el('div', { id: 'paired-footer' });

        panel.appendChild(header);
        panel.appendChild(body);
        panel.appendChild(footer);

        document.body.appendChild(toggle);
        document.body.appendChild(panel);
    }

    function togglePanel() {
        state.isOpen = !state.isOpen;
        const panel = document.getElementById('paired-panel');
        panel.classList.toggle('open', state.isOpen);
        if (state.isOpen) render();
    }

    // ----------------------------------------------------------
    // Render — updates panel body based on current state
    // ----------------------------------------------------------

    function render() {
        const body   = document.getElementById('paired-body');
        const footer = document.getElementById('paired-footer');
        if (!body) return;

        body.innerHTML   = '';
        footer.innerHTML = '';

        switch (state.view) {
            case 'loading':   renderLoading(body);        break;
            case 'auth':      renderAuth(body);           break;
            case 'project-setup': renderProjectSetup(body); break;
            case 'monitoring':    renderMonitoring(body, footer); break;
            case 'review':        renderReview(body, footer);    break;
        }
    }

    // ---- Loading ----
    function renderLoading(body) {
        body.appendChild(el('div', { className: 'paired-loading' },
            el('div', { className: 'paired-spinner' }),
            'Initializing...'
        ));
    }

    // ---- Auth ----
    function renderAuth(body) {
        const authDiv = el('div', { id: 'paired-auth' });
        authDiv.appendChild(el('p', { className: 'paired-section-label' }, 'Sign in to PAIRED'));

        const emailInput    = el('input', { className: 'paired-input', type: 'email',    placeholder: 'Email address' });
        const passwordInput = el('input', { className: 'paired-input', type: 'password', placeholder: 'Password' });

        const signInBtn = el('button', { className: 'paired-btn paired-btn-primary' }, 'Sign in');
        const signUpBtn = el('button', { className: 'paired-btn paired-btn-secondary' }, 'Create account');
        const errorDiv  = el('div', { className: 'paired-error', style: 'display:none' });

        signInBtn.addEventListener('click', async () => {
            errorDiv.style.display = 'none';
            signInBtn.disabled = true;
            signInBtn.textContent = 'Signing in...';
            try {
                const res = await sendMessage('SIGN_IN', {
                    email:    emailInput.value.trim(),
                    password: passwordInput.value
                });
                if (res.success) {
                    state.isSignedIn = true;
                    state.user = res.user;
                    await initProject();
                } else {
                    errorDiv.textContent   = res.error || 'Sign in failed.';
                    errorDiv.style.display = 'block';
                    signInBtn.disabled     = false;
                    signInBtn.textContent  = 'Sign in';
                }
            } catch (err) {
                errorDiv.textContent   = err.message;
                errorDiv.style.display = 'block';
                signInBtn.disabled     = false;
                signInBtn.textContent  = 'Sign in';
            }
        });

        signUpBtn.addEventListener('click', async () => {
            errorDiv.style.display = 'none';
            signUpBtn.disabled = true;
            signUpBtn.textContent = 'Creating account...';
            try {
                const res = await sendMessage('SIGN_UP', {
                    email:    emailInput.value.trim(),
                    password: passwordInput.value
                });
                if (res.success) {
                    errorDiv.textContent   = 'Account created. Please sign in.';
                    errorDiv.style.cssText = 'display:block;background:rgba(76,175,136,0.1);border-color:rgba(76,175,136,0.3);color:#4caf88';
                } else {
                    errorDiv.textContent   = res.error || 'Sign up failed.';
                    errorDiv.style.display = 'block';
                }
            } catch (err) {
                errorDiv.textContent   = err.message;
                errorDiv.style.display = 'block';
            }
            signUpBtn.disabled    = false;
            signUpBtn.textContent = 'Create account';
        });

        authDiv.appendChild(emailInput);
        authDiv.appendChild(passwordInput);
        authDiv.appendChild(signInBtn);
        authDiv.appendChild(signUpBtn);
        authDiv.appendChild(errorDiv);
        body.appendChild(authDiv);
    }

    // ---- Project setup ----
    function renderProjectSetup(body) {
        body.appendChild(el('p', { className: 'paired-section-label' }, 'New project'));

        const info = el('div', { className: 'paired-status' });
        info.innerHTML = 'This is a new conversation. Give your research project a name to start logging.';
        body.appendChild(info);

        const titleInput = el('input', {
            className:   'paired-input',
            type:        'text',
            placeholder: 'e.g. PAIRED Framework Paper'
        });
        body.appendChild(titleInput);

        const errorDiv = el('div', { className: 'paired-error', style: 'display:none' });
        body.appendChild(errorDiv);

        const startBtn = el('button', { className: 'paired-btn paired-btn-primary' }, 'Start logging');
        startBtn.addEventListener('click', async () => {
            const title = titleInput.value.trim();
            if (!title) {
                errorDiv.textContent   = 'Please enter a project title.';
                errorDiv.style.display = 'block';
                return;
            }
            startBtn.disabled     = true;
            startBtn.textContent  = 'Creating project...';
            errorDiv.style.display = 'none';

            try {
                const res = await sendMessage('CREATE_PROJECT', {
                    conversationId: extractConversationId(),
                    platform:       detectPlatform(),
                    title
                });
                if (res.success) {
                    // Merge returned project with the title the user typed,
                    // in case Supabase doesn't echo it back fully
                    state.project = { title, ...res.project };
                    state.view    = 'monitoring';
                    storeSessionState();
                    render();
                } else {
                    errorDiv.textContent   = res.error || 'Failed to create project.';
                    errorDiv.style.display = 'block';
                    startBtn.disabled      = false;
                    startBtn.textContent   = 'Start logging';
                }
            } catch (err) {
                errorDiv.textContent   = err.message;
                errorDiv.style.display = 'block';
                startBtn.disabled      = false;
                startBtn.textContent   = 'Start logging';
            }
        });
        body.appendChild(startBtn);

        // Sign out — available without needing to start a project first
        const signOutBtn = el('button', {
            className: 'paired-btn paired-btn-secondary',
            style: 'font-size:11px;padding:7px;margin-top:8px'
        }, 'Sign out');
        signOutBtn.addEventListener('click', async () => {
            await sendMessage('SIGN_OUT');
            state.isSignedIn = false;
            state.user       = null;
            state.project    = null;
            state.view       = 'auth';
            render();
        });
        body.appendChild(signOutBtn);
    }

    // ---- Monitoring ----
    function renderMonitoring(body, footer) {
        // Status indicator
        const status = el('div', { id: 'paired-status' });
        status.innerHTML = `
            <span class="paired-status-dot active"></span>
            <strong>Monitoring active</strong><br>
            Continue your conversation. PAIRED is watching silently.
            When you finish, click End Session to log decision points.
        `;
        body.appendChild(status);

        // How it works
        const howItWorks = el('div', { className: 'paired-entry-card' });
        howItWorks.innerHTML = `
            <div class="paired-section-label">How it works</div>
            <div style="font-size:12px;color:#9196aa;line-height:1.6">
                1. Have your conversation normally<br>
                2. Click <strong style="color:#c5c9d8">End Session</strong> when done<br>
                3. PAIRED identifies decision points automatically<br>
                4. Review and approve the suggested entries<br>
                5. Your log is saved — return any time
            </div>
        `;
        body.appendChild(howItWorks);

        // Open web app link
        const webAppBtn = el('button', { className: 'paired-btn paired-btn-secondary' }, '↗ Open dashboard');
        webAppBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ type: 'GET_AUTH' }, auth => {
                window.open(`https://paired-pilot.vercel.app`, '_blank');
            });
        });
        body.appendChild(webAppBtn);

        // Footer: project name + end session
        const projectLabel = el('div', { id: 'paired-footer-project' });
        projectLabel.innerHTML = `Project: <strong>${escapeHtml(state.project?.title || 'Unknown')}</strong>`;
        footer.appendChild(projectLabel);

        const endBtn = el('button', { className: 'paired-btn paired-btn-primary' }, 'End Session');
        endBtn.addEventListener('click', handleEndSession);
        footer.appendChild(endBtn);

        const signOutBtn = el('button', {
            className: 'paired-btn paired-btn-secondary',
            style: 'font-size:11px;padding:7px'
        }, 'Sign out');
        signOutBtn.addEventListener('click', async () => {
            await sendMessage('SIGN_OUT');
            state.isSignedIn = false;
            state.user       = null;
            state.project    = null;
            state.view       = 'auth';
            render();
        });
        footer.appendChild(signOutBtn);
    }

    // ---- Review ----
    function renderReview(body, footer) {
        body.appendChild(el('p', { className: 'paired-section-label' },
            `${state.draftEntries.length} decision point${state.draftEntries.length !== 1 ? 's' : ''} found`
        ));

        const info = el('div', { className: 'paired-status' });
        info.innerHTML = `
            <span class="paired-status-dot active"></span>
            Review each suggested entry. Edit any field, then <strong>Confirm</strong> or <strong>Delete</strong>.
            Entries are already saved — you can also review them in the dashboard.
        `;
        body.appendChild(info);

        if (state.draftEntries.length === 0) {
            body.appendChild(el('div', { className: 'paired-empty' },
                'No decision points were identified in this session.\nIf you expected some, check the dashboard.'
            ));
        }

        // Accept All button — only shown when there are 2+ entries
        if (state.draftEntries.length > 1) {
            const acceptAllWrap = el('div', { style: 'margin-bottom:10px;text-align:right' });
            const acceptAllErr  = el('div', { className: 'paired-error', style: 'display:none;margin-bottom:6px;text-align:left' });
            const acceptAllBtn  = el('button', { className: 'paired-btn paired-btn-secondary' }, 'Accept All');

            acceptAllBtn.addEventListener('click', async () => {
                acceptAllBtn.disabled    = true;
                acceptAllBtn.textContent = 'Accepting…';
                acceptAllErr.style.display = 'none';

                try {
                    await Promise.all(state.draftEntries.map(e =>
                        sendMessage('CONFIRM_ENTRY', {
                            entry: {
                                id:               e.id,
                                stage:            e.stage,
                                role_label:       e.role_label,
                                artifact_adopted: e.artifact_adopted,
                                human_judgment:   e.human_judgment,
                                researcher_edited: false
                            }
                        })
                    ));
                    state.draftEntries = [];
                    render();
                } catch (err) {
                    acceptAllErr.textContent   = err.message;
                    acceptAllErr.style.display = 'block';
                    acceptAllBtn.disabled      = false;
                    acceptAllBtn.textContent   = 'Accept All';
                }
            });

            body.appendChild(acceptAllErr);
            acceptAllWrap.appendChild(acceptAllBtn);
            body.appendChild(acceptAllWrap);
        }

        state.draftEntries.forEach((entry, index) => {
            body.appendChild(buildEntryCard(entry, index));
        });

        // Footer
        const projectLabel = el('div', { id: 'paired-footer-project' });
        projectLabel.innerHTML = `Project: <strong>${escapeHtml(state.project?.title || 'Unknown')}</strong>`;
        footer.appendChild(projectLabel);

        const doneBtn = el('button', { className: 'paired-btn paired-btn-secondary' }, 'Back to monitoring');
        doneBtn.addEventListener('click', () => {
            state.view = 'monitoring';
            render();
        });
        footer.appendChild(doneBtn);
    }

    function buildEntryCard(entry, index) {
        const card = el('div', { className: 'paired-entry-card' });

        // Header: stage badge + AI tag
        const cardHeader = el('div', { className: 'paired-entry-card-header' });
        const badge = el('span', {
            className: `paired-entry-badge ${(entry.stage || 'execution').toLowerCase()}`
        }, entry.stage);
        const aiTag = el('span', { className: 'paired-entry-ai-tag' }, 'AI suggested');
        cardHeader.appendChild(badge);
        cardHeader.appendChild(aiTag);
        card.appendChild(cardHeader);

        // Reasoning (read-only, helps researcher evaluate)
        if (entry.reasoning) {
            card.appendChild(el('div', { className: 'paired-entry-reasoning' }, entry.reasoning));
        }

        // Editable fields
        const stageSelect = buildSelect('Stage', PAIRED_STAGES, entry.stage);
        const roleSelect  = buildSelect('Role label', PAIRED_ROLES, entry.role_label);

        const artifactArea = buildTextarea('Artifact adopted', entry.artifact_adopted,
            'One sentence: what entered the research?');
        const judgmentArea = buildTextarea('Human judgment applied', entry.human_judgment,
            'One sentence: what did you accept, reject, or modify?');

        card.appendChild(stageSelect.wrapper);
        card.appendChild(roleSelect.wrapper);
        card.appendChild(artifactArea.wrapper);
        card.appendChild(judgmentArea.wrapper);

        // Actions
        const actions = el('div', { className: 'paired-entry-actions' });
        const errorDiv = el('div', { className: 'paired-error', style: 'display:none' });

        const confirmBtn = el('button', { className: 'paired-btn paired-btn-primary' }, 'Confirm');
        const deleteBtn  = el('button', { className: 'paired-btn paired-btn-danger' },  'Delete');

        confirmBtn.addEventListener('click', async () => {
            confirmBtn.disabled    = true;
            confirmBtn.textContent = 'Saving...';
            errorDiv.style.display = 'none';

            // Detect if researcher edited any field
            const edited = (
                stageSelect.input.value    !== entry.stage         ||
                roleSelect.input.value     !== entry.role_label    ||
                artifactArea.input.value   !== entry.artifact_adopted ||
                judgmentArea.input.value   !== entry.human_judgment
            );

            try {
                const res = await sendMessage('CONFIRM_ENTRY', {
                    entry: {
                        id:               entry.id,
                        stage:            stageSelect.input.value,
                        role_label:       roleSelect.input.value,
                        artifact_adopted: artifactArea.input.value.trim(),
                        human_judgment:   judgmentArea.input.value.trim(),
                        researcher_edited: edited
                    }
                });

                if (res.success) {
                    // Remove from draft list and re-render
                    state.draftEntries = state.draftEntries.filter(e => e.id !== entry.id);
                    card.style.opacity    = '0.4';
                    card.style.transition = 'opacity 0.3s';
                    setTimeout(() => {
                        card.remove();
                        updateReviewCount();
                    }, 300);
                } else {
                    errorDiv.textContent   = res.error || 'Failed to confirm.';
                    errorDiv.style.display = 'block';
                    confirmBtn.disabled    = false;
                    confirmBtn.textContent = 'Confirm';
                }
            } catch (err) {
                errorDiv.textContent   = err.message;
                errorDiv.style.display = 'block';
                confirmBtn.disabled    = false;
                confirmBtn.textContent = 'Confirm';
            }
        });

        deleteBtn.addEventListener('click', async () => {
            deleteBtn.disabled    = true;
            deleteBtn.textContent = 'Deleting...';
            try {
                await sendMessage('DELETE_ENTRY', { entryId: entry.id });
                state.draftEntries = state.draftEntries.filter(e => e.id !== entry.id);
                card.style.opacity    = '0';
                card.style.transition = 'opacity 0.3s';
                setTimeout(() => {
                    card.remove();
                    updateReviewCount();
                }, 300);
            } catch (err) {
                errorDiv.textContent   = err.message;
                errorDiv.style.display = 'block';
                deleteBtn.disabled     = false;
                deleteBtn.textContent  = 'Delete';
            }
        });

        actions.appendChild(confirmBtn);
        actions.appendChild(deleteBtn);
        card.appendChild(errorDiv);
        card.appendChild(actions);

        return card;
    }

    function buildSelect(labelText, options, selectedValue) {
        const wrapper = el('div', { className: 'paired-field' });
        wrapper.appendChild(el('label', {}, labelText));
        const input = el('select', { className: 'paired-select' });
        options.forEach(opt => {
            const value = typeof opt === 'string' ? opt : opt.value;
            const label = typeof opt === 'string' ? opt : opt.label;
            const option = el('option', { value }, label);
            if (value === selectedValue) option.selected = true;
            input.appendChild(option);
        });
        wrapper.appendChild(input);
        return { wrapper, input };
    }

    function buildTextarea(labelText, value, placeholder) {
        const wrapper = el('div', { className: 'paired-field' });
        wrapper.appendChild(el('label', {}, labelText));
        const input = el('textarea', { className: 'paired-textarea', placeholder });
        input.value = value || '';
        wrapper.appendChild(input);
        return { wrapper, input };
    }

    function updateReviewCount() {
        const label = document.querySelector('.paired-section-label');
        if (label) {
            const count = state.draftEntries.length;
            label.textContent = `${count} decision point${count !== 1 ? 's' : ''} found`;
        }
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Role and stage data for selects
    const PAIRED_STAGES = ['Ideation', 'Design', 'Execution', 'Reporting'];
    const PAIRED_ROLES  = [
        { value: 'Scribe',      label: 'Scribe — AI polished human content' },
        { value: 'Executor',    label: 'Executor — AI implemented human plan' },
        { value: 'Evaluator-G', label: 'Evaluator-G — AI generated alternatives' },
        { value: 'Evaluator-R', label: 'Evaluator-R — AI stress-tested human position' },
        { value: 'Co-ideator',  label: 'Co-ideator — AI introduced adopted concept' },
        { value: 'Promptee',    label: 'Promptee — AI shaped direction unchecked' }
    ];

    // ----------------------------------------------------------
    // End session handler
    // ----------------------------------------------------------

    async function handleEndSession() {
        const body   = document.getElementById('paired-body');
        const footer = document.getElementById('paired-footer');
        if (!body) return;

        body.innerHTML   = '';
        footer.innerHTML = '';

        body.appendChild(el('div', { className: 'paired-loading' },
            el('div', { className: 'paired-spinner' }),
            'Analyzing conversation...'
        ));

        try {
            const transcript = extractTranscript();

            console.log('PAIRED transcript:', typeof transcript, JSON.stringify((transcript || '').slice(0, 150)));
            if (!transcript || typeof transcript !== 'string' || transcript.trim().length < 50) {
                body.innerHTML = '';
                body.appendChild(el('div', { className: 'paired-error' },
                    'Could not extract conversation content. Make sure you have an active conversation in this tab.'
                ));
                return;
            }
            console.log('PAIRED state.project:', JSON.stringify(state.project));

            const res = await sendMessage('END_SESSION', {
                projectId:    state.project.id,
                projectTitle: state.project.title,
                transcript
            });

            if (res.success) {
                state.draftEntries = (res.candidates || []).map(e => ({
                ...e,
                stage:            e.stage            || 'Execution',
                artifact_adopted: e.artifact_adopted || '',
                role_label:       e.role_label       || 'Executor',
                human_judgment:   e.human_judgment   || '',
                reasoning:        e.reasoning        || ''
            }));
                state.view         = 'review';
                render();
            } else {
                body.innerHTML = '';
                body.appendChild(el('div', { className: 'paired-error' },
                    res.error || 'Failed to process session.'
                ));
            }
        } catch (err) {
            console.error('PAIRED handleEndSession error:', err);
            body.innerHTML = '';
            body.appendChild(el('div', { className: 'paired-error' }, err.message));
        }
    }

    // ----------------------------------------------------------
    // Session state storage (for tab-close auto-trigger)
    // ----------------------------------------------------------

    function storeSessionState() {
        if (!state.project) return;
        if (!chrome.storage || !chrome.storage.local) return;
        try {
            const key = `paired_session_${getTabId()}`;
            chrome.storage.local.set({
                [key]: {
                    projectId:    state.project.id,
                    projectTitle: state.project.title,
                    transcript:   extractTranscript()
                }
            });
        } catch (e) {
            console.warn('PAIRED storeSessionState failed:', e);
        }
    }

    function getTabId() {
        // Content scripts don't have direct tab ID access;
        // we store a generated ID in sessionStorage
        if (!sessionStorage.getItem('paired_tab_id')) {
            sessionStorage.setItem('paired_tab_id', Date.now().toString());
        }
        return sessionStorage.getItem('paired_tab_id');
    }

    // Update stored transcript periodically so tab-close
    // auto-trigger has fresh content
    setInterval(() => {
        if (state.project && state.view === 'monitoring') {
            storeSessionState();
        }
    }, 30000); // every 30 seconds

    // ----------------------------------------------------------
    // Initialization
    // ----------------------------------------------------------

    async function initProject() {
        const conversationId = extractConversationId();
        const platform       = detectPlatform();

        if (!conversationId) {
            // No conversation ID in URL — user is on a new chat page
            state.view = 'project-setup';
            render();
            return;
        }

        const res = await sendMessage('FIND_OR_CREATE_PROJECT', {
            conversationId,
            platform
        });

        if (!res.success) {
            state.view = 'auth';
            render();
            return;
        }

        if (res.isNew) {
            state.view = 'project-setup';
        } else {
            state.project = res.project;
            state.view    = 'monitoring';
            storeSessionState();
        }
        render();
    }

    async function init() {
        buildPanel();
        render(); // shows loading

        // Check auth
        const auth = await sendMessage('GET_AUTH');
        if (auth && auth.token) {
            state.isSignedIn = true;
            state.user       = auth.user;
            await initProject();
        } else {
            state.view = 'auth';
            render();
        }
    }

    // ----------------------------------------------------------
    // beforeunload — update transcript before tab closes
    // ----------------------------------------------------------
    window.addEventListener('beforeunload', () => {
        if (state.project && state.view === 'monitoring') {
            storeSessionState();
        }
    });

    // ----------------------------------------------------------
    // URL change detection (SPA navigation within LLM tabs)
    // ----------------------------------------------------------
    let lastUrl = window.location.href;
    new MutationObserver(() => {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            // Conversation changed — re-initialize project lookup
            if (state.isSignedIn) {
                state.project = null;
                state.view    = 'loading';
                render();
                initProject();
            }
        }
    }).observe(document.body, { subtree: true, childList: true });

    // Start
    init();

})();