// ============================================================
// PAIRED Extension — Background Service Worker
// Handles:
// 1. Anthropic API calls (transcript → candidate entries)
// 2. Supabase writes (projects + entries)
// 3. Auth token storage and retrieval
// 4. Message routing between content script and service worker
// ============================================================

const PAIRED_CONFIG = {
    SUPABASE_URL: 'https://aehdoqrruyvzrlyujqej.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlaGRvcXJydXl2enJseXVqcWVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwMTI3MjUsImV4cCI6MjEwNzU4ODcyNX0.wAY85EpBfusumuebianUqQG4_2969ZkGpzImSw6eAFQ',
    ANTHROPIC_API_KEY: 'YOUR_ANTHROPIC_API_KEY_HERE',
    ANTHROPIC_MODEL: 'claude-sonnet-5-5',
    WEBAPP_URL: 'https://paired-pilot.vercel.app'
};

// ----------------------------------------------------------
// Supabase client (lightweight fetch-based, no SDK needed)
// ----------------------------------------------------------

const supabase = {

    headers(token) {
        return {
            'Content-Type':  'application/json',
            'apikey':        PAIRED_CONFIG.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token || PAIRED_CONFIG.SUPABASE_ANON_KEY}`
        };
    },

    async signInWithEmail(email, password) {
        const res = await fetch(
            `${PAIRED_CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=password`,
            {
                method:  'POST',
                headers: this.headers(),
                body:    JSON.stringify({ email, password })
            }
        );
        return res.json();
    },

    async signUp(email, password) {
        const res = await fetch(
            `${PAIRED_CONFIG.SUPABASE_URL}/auth/v1/signup`,
            {
                method:  'POST',
                headers: this.headers(),
                body:    JSON.stringify({ email, password })
            }
        );
        return res.json();
    },

    async select(table, filters, token) {
        const params = new URLSearchParams(filters);
        const res = await fetch(
            `${PAIRED_CONFIG.SUPABASE_URL}/rest/v1/${table}?${params}`,
            { headers: this.headers(token) }
        );
        return res.json();
    },

    async insert(table, data, token) {
        const res = await fetch(
            `${PAIRED_CONFIG.SUPABASE_URL}/rest/v1/${table}`,
            {
                method:  'POST',
                headers: {
                    ...this.headers(token),
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(data)
            }
        );
        return res.json();
    },

    async update(table, data, filters, token) {
        const params = new URLSearchParams(filters);
        const res = await fetch(
            `${PAIRED_CONFIG.SUPABASE_URL}/rest/v1/${table}?${params}`,
            {
                method:  'PATCH',
                headers: {
                    ...this.headers(token),
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(data)
            }
        );
        return res.json();
    }
};


// ----------------------------------------------------------
// Auth helpers
// ----------------------------------------------------------

async function getStoredAuth() {
    return new Promise(resolve => {
        chrome.storage.local.get(['paired_token', 'paired_user'], result => {
            resolve({
                token: result.paired_token || null,
                user:  result.paired_user  || null
            });
        });
    });
}

async function storeAuth(token, user) {
    return new Promise(resolve => {
        chrome.storage.local.set({
            paired_token: token,
            paired_user:  user
        }, resolve);
    });
}

async function clearAuth() {
    return new Promise(resolve => {
        chrome.storage.local.remove(['paired_token', 'paired_user'], resolve);
    });
}


// ----------------------------------------------------------
// Project helpers
// ----------------------------------------------------------

async function findOrCreateProject(conversationId, platform, token) {
    // Check if project already exists for this conversation
    const existing = await supabase.select(
        'projects',
        { conversation_id: `eq.${conversationId}` },
        token
    );

    if (existing && existing.length > 0) {
        return { project: existing[0], isNew: false };
    }

    // Project does not exist yet — return null so content script
    // can prompt the researcher for a project title
    return { project: null, isNew: true };
}

async function createProject(conversationId, platform, title, token) {
    // Get the current user's ID from Supabase auth
    const userRes = await fetch(`${PAIRED_CONFIG.SUPABASE_URL}/auth/v1/user`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': PAIRED_CONFIG.SUPABASE_ANON_KEY
        }
    });
    const user = await userRes.json();

    const result = await supabase.insert(
        'projects',
        { conversation_id: conversationId, platform, title, user_id: user.id },
        token
    );
    return Array.isArray(result) ? result[0] : result;
}

async function updateLastCaptured(projectId, token) {
    await supabase.update(
        'projects',
        { last_captured_at: new Date().toISOString() },
        { id: `eq.${projectId}` },
        token
    );
}


// ----------------------------------------------------------
// Anthropic API — transcript → candidate entries
// ----------------------------------------------------------

async function generateCandidateEntries(transcript, projectTitle) {

    const systemPrompt = `You are an expert in the PAIRED framework (Process-Anchored Interaction Reporting for AI-Enabled Discovery). Your task is to analyze a conversation transcript between a researcher and an AI language model, and identify decision points that meet PAIRED's artifact-trigger criterion.

A decision point is any moment where:
- A direction was chosen
- An idea was adopted or rejected
- A methodological commitment was made
- AND the outcome (artifact) will appear in the researcher's final paper

For each decision point you identify, produce a structured entry with exactly these five fields:
1. stage: one of [Ideation, Design, Execution, Reporting]
2. artifact_adopted: one sentence describing what entered the research
3. role_label: one of [Scribe, Executor, Evaluator-G, Evaluator-R, Co-ideator, Promptee]
4. human_judgment: one sentence describing what the researcher accepted, rejected, or modified and on what basis
5. reasoning: one sentence explaining why this qualifies as a decision point (for researcher review only)

Role label definitions:
- Scribe: AI polished or formatted human-specified content with no new ideas
- Executor: AI implemented a human-specified plan
- Evaluator-G: AI generated alternatives and the researcher chose among them
- Evaluator-R: AI stress-tested a position the researcher already held
- Co-ideator: AI introduced a concept, term, or structure the researcher adopted
- Promptee: AI shaped direction without the researcher applying independent evaluation

Return ONLY a valid JSON array of entry objects. No preamble, no explanation, no markdown fences. If no decision points are found, return an empty array [].`;

    const userPrompt = `Research project: "${projectTitle}"

Conversation transcript:
${transcript}

Identify all decision points from this transcript and return them as a JSON array.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type':      'application/json',
            'x-api-key':         PAIRED_CONFIG.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'   // ← add this line
        },
        body: JSON.stringify({
            model:      PAIRED_CONFIG.ANTHROPIC_MODEL,
            max_tokens: 4000,
            messages: [
                { role: 'user', content: userPrompt }
            ],
            system: systemPrompt
        })
    });

    const data = await response.json();

    const textBlock = (data.content || []).find(b => b.type === 'text');
    if (!textBlock) {
        throw new Error('Anthropic API error: ' + JSON.stringify(data));
    }

    const text = (textBlock.text || '').trim();
    const clean = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

    try {
        return JSON.parse(clean);
    } catch (e) {
        console.error('PAIRED: Failed to parse Anthropic response:', text);
        return [];
    }
}


// ----------------------------------------------------------
// Save candidate entries to Supabase as drafts
// Called BEFORE showing the review screen, so tab closure
// cannot lose the data.
// ----------------------------------------------------------

async function saveDraftEntries(projectId, candidates, token) {
    if (!candidates || candidates.length === 0) return [];

    const entries = candidates.map(c => ({
        project_id:       projectId,
        stage:            c.stage,
        artifact_adopted: c.artifact_adopted,
        role_label:       c.role_label,
        human_judgment:   c.human_judgment,
        ai_suggested:     true,
        researcher_edited: false,
        status:           'draft'
    }));

    const result = await supabase.insert('entries', entries, token);
    return Array.isArray(result) ? result : [result];
}


// ----------------------------------------------------------
// Message handler — routes messages from content script
// ----------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    (async () => {
        try {
            switch (message.type) {

                // ---- Auth ----

                case 'SIGN_IN': {
                    const result = await supabase.signInWithEmail(
                        message.email,
                        message.password
                    );
                    if (result.access_token) {
                        await storeAuth(result.access_token, result.user);
                        sendResponse({ success: true, user: result.user });
                    } else {
                        sendResponse({ success: false, error: result.error_description || 'Sign in failed' });
                    }
                    break;
                }

                case 'SIGN_UP': {
                    const result = await supabase.signUp(
                        message.email,
                        message.password
                    );
                    if (result.user) {
                        sendResponse({ success: true, user: result.user });
                    } else {
                        sendResponse({ success: false, error: result.error_description || 'Sign up failed' });
                    }
                    break;
                }

                case 'SIGN_OUT': {
                    await clearAuth();
                    sendResponse({ success: true });
                    break;
                }

                case 'GET_AUTH': {
                    const auth = await getStoredAuth();
                    sendResponse(auth);
                    break;
                }

                // ---- Projects ----

                case 'FIND_OR_CREATE_PROJECT': {
                    const { token } = await getStoredAuth();
                    if (!token) {
                        sendResponse({ success: false, error: 'Not signed in' });
                        break;
                    }
                    const result = await findOrCreateProject(
                        message.conversationId,
                        message.platform,
                        token
                    );
                    sendResponse({ success: true, ...result });
                    break;
                }

                case 'CREATE_PROJECT': {
                    const { token } = await getStoredAuth();
                    if (!token) {
                        sendResponse({ success: false, error: 'Not signed in' });
                        break;
                    }
                    const project = await createProject(
                        message.conversationId,
                        message.platform,
                        message.title,
                        token
                    );
                    sendResponse({ success: true, project });
                    break;
                }

                // ---- End session ----

                case 'END_SESSION': {
                    const { token } = await getStoredAuth();
                    if (!token) {
                        sendResponse({ success: false, error: 'Not signed in' });
                        break;
                    }

                    // 1. Generate candidate entries from transcript
                    const candidates = await generateCandidateEntries(
                        message.transcript,
                        message.projectTitle
                    );

                    // 2. Save to Supabase as drafts IMMEDIATELY
                    //    (before sending response, so data is safe
                    //    even if the tab closes right now)
                    const saved = await saveDraftEntries(
                        message.projectId,
                        candidates,
                        token
                    );

                    // 3. Update last_captured_at on the project
                    await updateLastCaptured(message.projectId, token);

                    sendResponse({
                        success:    true,
                        candidates: saved,
                        count:      saved.length
                    });
                    break;
                }

                // ---- Entries ----

                case 'GET_DRAFT_ENTRIES': {
                    const { token } = await getStoredAuth();
                    if (!token) {
                        sendResponse({ success: false, error: 'Not signed in' });
                        break;
                    }
                    const entries = await supabase.select(
                        'entries',
                        {
                            project_id: `eq.${message.projectId}`,
                            status:     'eq.draft',
                            order:      'created_at.asc'
                        },
                        token
                    );
                    sendResponse({ success: true, entries });
                    break;
                }

                case 'CONFIRM_ENTRY': {
                    const { token } = await getStoredAuth();
                    if (!token) {
                        sendResponse({ success: false, error: 'Not signed in' });
                        break;
                    }
                    const updated = await supabase.update(
                        'entries',
                        {
                            status:            'confirmed',
                            confirmed_at:      new Date().toISOString(),
                            artifact_adopted:  message.entry.artifact_adopted,
                            role_label:        message.entry.role_label,
                            human_judgment:    message.entry.human_judgment,
                            stage:             message.entry.stage,
                            researcher_edited: message.entry.researcher_edited
                        },
                        { id: `eq.${message.entry.id}` },
                        token
                    );
                    sendResponse({ success: true, entry: updated });
                    break;
                }

                case 'DELETE_ENTRY': {
                    const { token } = await getStoredAuth();
                    if (!token) {
                        sendResponse({ success: false, error: 'Not signed in' });
                        break;
                    }
                    await supabase.update(
                        'entries',
                        { status: 'deleted' },
                        { id: `eq.${message.entryId}` },
                        token
                    );
                    sendResponse({ success: true });
                    break;
                }

                default:
                    sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
            }

        } catch (err) {
            console.error('PAIRED service worker error:', err);
            sendResponse({ success: false, error: err.message });
        }
    })();

    // Return true to keep the message channel open for async response
    return true;
});


// ----------------------------------------------------------
// Tab close listener — auto-trigger end session
// ----------------------------------------------------------

chrome.tabs.onRemoved.addListener(async (tabId) => {
    // Check if this tab had an active PAIRED session
    const stored = await new Promise(resolve => {
        chrome.storage.local.get(`paired_session_${tabId}`, result => {
            resolve(result[`paired_session_${tabId}`] || null);
        });
    });

    if (stored && stored.projectId && stored.transcript) {
        // Tab is closing — save whatever transcript we have
        const { token } = await getStoredAuth();
        if (!token) return;

        try {
            const candidates = await generateCandidateEntries(
                stored.transcript,
                stored.projectTitle
            );
            await saveDraftEntries(stored.projectId, candidates, token);
            await updateLastCaptured(stored.projectId, token);
        } catch (err) {
            console.error('PAIRED: Auto end-session on tab close failed:', err);
        }

        // Clean up session storage for this tab
        chrome.storage.local.remove(`paired_session_${tabId}`);
    }
});
