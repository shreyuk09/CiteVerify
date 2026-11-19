# CiteVerify – Scientific Claim & Citation Verification

> *"A citation is not proof by itself. Show the evidence behind every claim."*

CiteVerify extracts claims from a student's document, maps each one to its citation, retrieves the original paper, and checks whether the paper's evidence actually supports the claim. It has two connected portals: **Student / Researcher** and **Professor / Evaluator**.

---

## Quick start

**Requirements:** Python 3.9+ only. The frontend is already built into `backend/main.py`.

```bash
python3 -m venv ~/.venvs/citeverify && source ~/.venvs/citeverify/bin/activate   # Windows: %USERPROFILE%\.venvs\citeverify\Scripts\activate
pip install -r backend/requirements.txt
cd backend && uvicorn main:app --port 8000               # open http://localhost:8000
```

The virtual environment lives outside the project (`~/.venvs/citeverify`), so the project folder stays small and can be zipped or uploaded
as-is. It is never deployed: hosting platforms and Docker install the packages themselves from `requirements.txt`.

The SQLite database is created and filled with demo data on first start. To reset the demo, delete `backend/citeverify.db` and restart.

## Deploy

Deploy the `backend/` folder only. It holds everything: the code, the built frontend, and the illustrations.

- **Any Python host** (Render, Railway, a VM). Build command: `pip install -r requirements.txt`. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`.
- **Docker:**
  ```bash
  docker build -t citeverify .
  docker run -p 8000:8000 -v citeverify-data:/data -e SECRET_KEY=$(openssl rand -hex 32) citeverify
  ```

## Changing the design (optional, needs Node 18+)

The React source is in `frontend/`. Edit `frontend/src/main.tsx` or `index.css`, then:

```bash
cd frontend
npm install          # restores node_modules (not shipped)
npm run dev          # live preview at http://localhost:5173 (backend must be running)
npm run build        # rebuilds the website and embeds it at the end of backend/main.py
```

## Demo accounts

| Portal | Email | Password |
|---|---|---|
| Student | `student@citeverify.demo` | `demo123` |
| Professor | `professor@citeverify.demo` | `demo123` |

Four more seeded students (`arjun@`, `sara@`, `kabir@`, `neha@citeverify.demo`, password `demo123`) have existing submissions. This gives the professor dashboards, the cross-student citation patterns, and revision tracking real data from the first login.

## Environment variables

All of them are optional. Set them in your hosting dashboard, or put `KEY=value` lines in `backend/.env` or `./.env`; the backend reads those files automatically.

| Variable | Default | Purpose |
|---|---|---|
| `SECRET_KEY` | dev value | Signs login tokens. **Set it in any shared deployment.** |
| `DATABASE_URL` | `sqlite:///backend/citeverify.db` | SQLAlchemy URL |
| `LIVE_LOOKUP` | `true` | Live retrieval from Crossref, Semantic Scholar and OpenAlex |
| `CONTACT_EMAIL` | – | Polite-pool contact address for the Crossref and OpenAlex APIs |
| `ANTHROPIC_API_KEY` | – | Turns on Claude reasoning for verdicts and feedback wording |
| `SEMANTIC_SCHOLAR_API_KEY` | – | Free key from semanticscholar.org; raises their rate limit so more cited papers and abstracts are found |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Model used when the key is set |

## 5-minute demo script

1. **Login page:** choose **Student Login**, then *Continue with demo student account*.
2. **New Verification:** three sample documents are offered. *1. High-accuracy original* scores about 100%, *2. Movie-story version* about 6% (its claims don't match their citations), and *3. Good accuracy, one claim wrong* about 89%. Analyse version 2 and browse its claims; click one to open the investigation panel.
3. **Evidence Viewer:** open the "95% accuracy" claim. The source sentence reporting 82% is highlighted red, with a 13-percentage-point difference.
4. **Citation Network:** the red dashed link shows a review paper that repeats a claim its original source doesn't support.
5. **Suggested Citations:** open the "AI triage, 30%" claim, which cites a soil-science paper. Review a suggestion, then approve the replacement.
6. **Report:** use *Export PDF*, then *Submit for professor review*.
7. Log out and sign in as the **professor**. The new submission appears in notifications and in *Awaiting review*.
8. **Evidence Verification:** filter by verdict, open a claim, then confirm or override it and add a note.
9. **Citation Intelligence:** "Predicting Chronic Disease Onset…" is cited by 3 students, 2 of whom misrepresent it.
10. **Feedback Center:** feedback is auto-generated. Edit it, add a comment, and *Send* (this also requests a revision).
11. As the **student:** open *Professor Feedback*, choose *Upload revision*, then *Use revised sample document*, and submit.
12. As the **professor:** open *Revision Tracking*. Reliability goes from 36% to 85%, with corrected claims, replaced citations, still-unresolved claims, and one new issue.

The light/dark toggle is in the top bar of both portals, and also under Settings.

## How verification works

```
Upload → Text extraction (PyMuPDF / python-docx) → Claim extraction → Citation detection ([1], [2-4], (Author, 2020))
→ Reference parsing (APA / IEEE / numbered, DOI) → Paper retrieval (demo corpus → Crossref → Semantic Scholar / OpenAlex abstracts)
→ Metadata check → Evidence extraction (passage ranking) → Semantic comparison → Statistical comparison
→ Negation / overgeneralization / chain / age checks → Verdict + explanation + confidence → Report
```

**Design rules:**
- **Topical similarity never decides a verdict on its own.** "Same topic, no supporting passage" is *Unsupported*. A matching topic with an opposite finding is *Contradictory*. Absolute wording ("all", "eliminates") against the paper's stated limitations is *Partially supported (overgeneralized)*.
- **Numbers are compared deterministically**, and this always holds, even when the LLM is on. The comparison reports the claimed value, the source value, the difference, and the passage.
- **Every evidence quote is a real passage** from the retrieved source. If no source can be retrieved, the result is *"Source unavailable – manual verification required."*
- **Reference checks keep two outcomes apart:** a *confirmed metadata mismatch* (the paper exists, but the year, author, title, or venue differ) and *could not be verified* (the DOI is unregistered or the index is unreachable).
- **Outdated alerts need newer conflicting evidence.** An old paper is only flagged when newer related research reports a different result.
- **Citation chains are traced:** if a cited paper's supporting sentence relies on another paper, the claim is re-checked against that original.
- **Confidence measures how strong the available evidence is**, not certainty. Verdicts based only on an abstract get lower confidence.
- **With `ANTHROPIC_API_KEY` set**, Claude re-judges each claim using only the numbered passages it is given. It returns structured JSON, its passage ids are validated, and it falls back to the rule engine on any error. It also rewrites generated feedback without adding facts.

## Project structure

```
Sapthahack/
├── Dockerfile               # Python-only image (no Node.js needed)
├── README.md
├── evaluate_engine.py       # engine test suite (not deployed): ~/.venvs/citeverify/bin/python evaluate_engine.py --offline
├── backend/                 # ← the only folder you deploy (2 files)
│   ├── main.py              # whole backend: DB, auth, extraction, verification engine, retrieval,
│   │                        #   feedback, notifications, PDF reports, demo corpus + sample papers
│   │                        #   + the whole website (code, styles, illustrations) embedded on its last line
│   └── requirements.txt
└── frontend/                # source, only needed to change the design
    ├── index.html, package.json, vite.config.ts
    └── src/main.tsx, src/index.css, src/student.png, src/professor.png
```

## Login illustrations

`frontend/src/student.png` and `professor.png` are the original illustrations, cropped unmodified from the reference login design (682×546 each). Replace them with higher-resolution originals of the same artwork if you have them; the frame keeps the same 682:546 ratio.

## Limitations and simulated parts

- **The demo corpus is simulated.** Its 14 papers (DOI prefix `10.5555/cvdemo…`) are fictional. They are labelled *Simulated demo paper* everywhere, including the PDF report. Real DOIs and titles in uploaded documents are looked up live.
- **Paper lookup** tries the DOI, then arXiv IDs, then Crossref matching on the full reference text, then Semantic Scholar and arXiv title search. A match must agree with the cited title, authors and year. Free services rate-limit bursts, so a long reference list takes 2–3 minutes, and a few references may need a later re-analysis.
- **Live papers are compared on their abstract only.** Open full text isn't reliably available through these APIs, so confidence is reduced and the UI says so.
- **The rule engine uses lexical and stem overlap, not neural embeddings.** This keeps the install small. Synonyms and paraphrases can be missed; enabling the LLM layer improves this.
- **Scanned PDFs need OCR first.** The app reports this when it finds too little text.
- **Auth is demo-grade.** It uses signed tokens with no registration flow. The PDF download passes the token in the URL.
- **SQLite with background-thread analysis** is fine for a hackathon. Use Postgres and a task queue for production.
