// ============================================================
// PAIRED Extension — Configuration
// Replace the placeholder values below with your actual
// Supabase project URL and anon public key.
// Find them in: Supabase Dashboard → Settings → API
// ============================================================

const PAIRED_CONFIG = {

    // Supabase
    SUPABASE_URL:      'https://aehdoqrruyvzrlyujqej.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlaGRvcXJydXl2enJseXVqcWVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwMTI3MjUsImV4cCI6MjEwNzU4ODcyNX0.wAY85EpBfusumuebianUqQG4_2969ZkGpzImSw6eAFQ',

    // Anthropic
    // WARNING: In a production extension this key must live
    // in a backend proxy, not the extension. For the pilot
    // study with 3-5 trusted colleagues this is acceptable.
    ANTHROPIC_API_KEY: 'YOUR_ANTHROPIC_API_KEY_HERE',
    ANTHROPIC_MODEL:   'claude-sonnet-4-6',

    // Web app URL (Vercel dashboard)
    WEBAPP_URL: 'https://paired-webapp.vercel.app/',

    // Supported platforms and their conversation ID patterns
    PLATFORMS: {
        'claude.ai': {
            name: 'claude',
            pattern: /claude\.ai\/chat\/([a-zA-Z0-9-]+)/
        },
        'chatgpt.com': {
            name: 'chatgpt',
            pattern: /chatgpt\.com\/c\/([a-zA-Z0-9-]+)/
        },
        'gemini.google.com': {
            name: 'gemini',
            pattern: /gemini\.google\.com\/app\/([a-zA-Z0-9-]+)/
        }
    },

    // Role labels for dropdown
    ROLE_LABELS: [
        { value: 'Scribe',       label: 'Scribe — AI polished human-specified content' },
        { value: 'Executor',     label: 'Executor — AI implemented a human-specified plan' },
        { value: 'Evaluator-G',  label: 'Evaluator-G — AI generated and assessed alternatives' },
        { value: 'Evaluator-R',  label: 'Evaluator-R — AI stress-tested a human position' },
        { value: 'Co-ideator',   label: 'Co-ideator — AI introduced a concept the human adopted' },
        { value: 'Promptee',     label: 'Promptee — AI shaped direction without human evaluation' }
    ],

    // Research stages for dropdown
    STAGES: [
        'Ideation',
        'Design',
        'Execution',
        'Reporting'
    ]
};
