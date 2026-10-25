# PAIRED

**Process-Anchored Interaction Reporting for AI-Enabled Discovery**

PAIRED is a framework for documenting the role of generative AI in 
scientific research. It shifts the unit of disclosure from research 
products (what AI produced) to decision points (how the research 
unfolded), enabling researchers to generate structured AI contribution 
disclosures that distinguish epistemically different forms of human-AI 
collaboration.

## Paper

Ahmad Al-Kabbany. *PAIRED: A Process-Anchored Framework for Transparent 
Reporting of AI Contributions in Scientific Research.*  
Preprint: https://arxiv.org/abs/2605.24325

## Framework Overview

PAIRED organizes documentation around four research stages (Ideation, 
Design, Execution, Reporting) and a five-role AI taxonomy arranged by 
agency level:

| Role | Description |
|------|-------------|
| Scribe | AI polishes or formats human-specified content |
| Executor | AI implements a human-specified plan |
| Evaluator-R | AI stress-tests a researcher-held position |
| Evaluator-G | AI generates alternatives the researcher evaluates |
| Co-ideator | AI introduces a concept the researcher adopts |
| Promptee | AI substantially shapes direction with minimal researcher oversight |

Each decision point is documented in a three-field micro-log entry:
- **Artifact adopted** — what entered the research as a result
- **Role label** — the taxonomy label characterizing AI's contribution
- **Human judgment applied** — what the researcher accepted, rejected, 
  or modified, and on what basis

## Prototype Implementation

This repository contains the prototype implementation used in the 
pilot study reported in the paper. It comprises:

- `extension/` — A browser extension that monitors interactions with 
  AI platforms and prompts the researcher to log decision points 
  prospectively
- `dashboard/` — A companion web dashboard for reviewing and accepting 
  logged decision points and generating a structured AI contribution 
  disclosure
- `schema/` — The database schema (PostgreSQL/Supabase) for the 
  backend store

A live instance of the dashboard is available at 
https://paired-pilot.vercel.app (pilot access; registration required).

## Setup

### Prerequisites
- A [Supabase](https://supabase.com) project (free tier sufficient)
- A static hosting service for the dashboard 
  (e.g. [Vercel](https://vercel.com), free tier sufficient)

### Backend
1. Create a new Supabase project
2. Run `schema/paired_schema.sql` in the Supabase SQL editor
3. Note your project URL and anon key

### Dashboard
1. Copy `dashboard/index.html` to your hosting service
2. Set your Supabase URL and anon key as environment variables 
   or inline them in the config section at the top of `index.html`

### Browser Extension
1. Open Chrome and navigate to `chrome://extensions`
2. Enable Developer Mode
3. Click "Load unpacked" and select the `extension/` directory
4. The extension icon will appear in your toolbar

## Pilot Study

The pilot study involved three engineering faculty participants across 
computer engineering, mechanical engineering, and electrical and 
control engineering. Each participant used the prototype to document 
an active research project of their own choosing. Results are reported 
in Section 4.2 of the paper.

## Citation

```bibtex
@misc{alkabbany2026paired,
  title={{PAIRED}: A Process-Anchored Framework for Transparent
         Reporting of {AI} Contributions in Scientific Research},
  author={Al-Kabbany, Ahmad},
  year={2026},
  eprint={2605.24325},
  archivePrefix={arXiv},
  primaryClass={cs.DL},
  url={https://arxiv.org/abs/2605.24325}
}
```

## License

Apache License 2.0 — see [LICENSE](LICENSE) for details.

## Contact

Ahmad Al-Kabbany  
alkabbany@ieee.org
