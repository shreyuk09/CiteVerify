"""
CiteVerify engine test suite.

Runs the real verification code (main.py) against eight test suites and prints a scorecard.
It uses its own temporary database, so it never touches citeverify.db.

    ~/.venvs/citeverify/bin/python evaluate_engine.py                 # suites 1-7 (suites 3, 6 and 7 need internet)
    ~/.venvs/citeverify/bin/python evaluate_engine.py --scifact       # + suite 8, the SciFact research benchmark (~6 min, downloads ~3 MB)
    ~/.venvs/citeverify/bin/python evaluate_engine.py --offline       # skip the suites that need internet (3, 6, 7)
    ~/.venvs/citeverify/bin/python evaluate_engine.py --json out.json # also save every result as JSON

Suites
  1. designed    the sample documents: every claim has a verdict it was designed to get
  2. mutations   correct claims broken on purpose (numbers, direction, negation, scope, wrong paper) + paraphrases that
                 must stay supported - tests the meaning check, not memorised sentences
  3. existence   real references (Crossref, DataCite/arXiv, no-DOI), fabricated DOIs/titles, real DOIs with wrong
                 year/author - tests fake-reference detection against the live scholarly registries
  4. parsing     reference lists of three published PDFs (downloaded) + PDF/DOCX round trips of the samples
  5. numbers     number extraction and comparison
  6. real (dev)  103 claims on 24 real papers, fetched live (used while improving the engine)
  7. real (held) 77 claims on 16 other real papers, fetched live (written before the first run, engine untouched since)
  8. scifact     SciFact dev (Wadden et al., 2020): 340 claim/abstract pairs labelled by experts
"""
import argparse
import io
import json
import os
import sqlite3
import sys
import tarfile
import tempfile
import time
import urllib.request
from collections import Counter, defaultdict

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")  # main.py lives in backend/
ap = argparse.ArgumentParser()
ap.add_argument("--scifact", action="store_true")
ap.add_argument("--offline", action="store_true")
ap.add_argument("--json", default="")
ap.add_argument("--suites", default="", help="comma-separated suite numbers to run, e.g. --suites 4,7 (default: all)")
args = ap.parse_args()
ONLY = {int(x) for x in args.suites.split(",") if x.strip()}


def want(n):
    return not ONLY or n in ONLY

TMP = tempfile.mkdtemp(prefix="citeverify-eval-")
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(TMP, "eval.db")
os.environ["LIVE_LOOKUP"] = "false"
sys.path.insert(0, HERE)
import main  # noqa: E402

print("Verification model: %s (%s)" % (main.VERIFIER_MODEL, "ready" if main.VERIFIER.ready(wait=900) else main.VERIFIER.state))
db = main.SessionLocal()
RESULTS = {}


def paper(key):
    return main.get_or_create_paper(db, main.demo_paper_dict(main.CORPUS_BY_KEY[key]))


def scorecard(name, rows):
    ok = sum(1 for r in rows if r["ok"])
    RESULTS[name] = {"passed": ok, "total": len(rows), "accuracy": round(100.0 * ok / max(len(rows), 1), 1), "cases": rows}
    print("\n== %s: %d/%d passed (%.1f%%)" % (name, ok, len(rows), 100.0 * ok / max(len(rows), 1)))
    for r in rows:
        if not r["ok"]:
            print("   FAIL  expected %-20s got %-20s | %s" % (r["expected"], r["got"], r["case"][:90]))


# ---------------------------------------------------------------- 1. designed scenarios
if want(1):
    DESIGNED = {
        "accurate": ["SUPPORTED"] * 9,
        "story": ["CONTRADICTORY", "CONTRADICTORY", "CONTRADICTORY", "PARTIALLY SUPPORTED", "CONTRADICTORY", "UNSUPPORTED",
                  "CONTRADICTORY", "UNSUPPORTED", "CONTRADICTORY"],
        "onechange": ["CONTRADICTORY"] + ["SUPPORTED"] * 8,
        "original": ["SUPPORTED", "CONTRADICTORY", "NEEDS HUMAN REVIEW", "POTENTIALLY OUTDATED", "PARTIALLY SUPPORTED", "CONTRADICTORY",
                     "SUPPORTED", "UNSUPPORTED", "NEEDS HUMAN REVIEW", "SUPPORTED", "NEEDS HUMAN REVIEW"],
        "revised": ["SUPPORTED", "SUPPORTED", "POTENTIALLY OUTDATED", "SUPPORTED", "SUPPORTED", "SUPPORTED", "SUPPORTED", "SUPPORTED",
                    "SUPPORTED", "CONTRADICTORY"],
    }
    user = db.query(main.User).filter(main.User.email == "student@citeverify.demo").first()
    rows = []
    for name, expected in DESIGNED.items():
        spec = main.SAMPLE_SPECS[name]
        d = main.create_document(db, user, spec["title"], "x.docx", "DOCX", 1, main.build_document_text(spec), None, True)
        main.analyze_document(d.id, live=False, pause=0)
        claims = db.query(main.Claim).filter(main.Claim.doc_id == d.id).order_by(main.Claim.idx).all()
        if len(claims) != len(expected):
            rows.append({"case": "%s: claim count" % name, "expected": str(len(expected)), "got": str(len(claims)), "ok": False})
        for c, e in zip(claims, expected):
            rows.append({"case": "%s #%d: %s" % (name, c.idx, c.text), "expected": e, "got": c.verdict, "ok": c.verdict == e})
        refs = {r.label: r.meta_status for r in db.query(main.Reference).filter(main.Reference.doc_id == d.id)}
        # the original sample has one reference with a wrong author/year [9] and one fabricated DOI [10];
        # every other sample cites genuine papers only (the story sample's problems are in its claims, not its references)
        bad = sorted(k for k, v in refs.items() if v != "verified")
        want = ["10", "9"] if name == "original" else []
        rows.append({"case": "%s: references flagged as suspicious" % name, "expected": str(want), "got": str(bad), "ok": bad == want})
    scorecard("1. Designed scenarios", rows)


# ---------------------------------------------------------------- 2. mutation tests
if want(2):
    S, C, P, U = "SUPPORTED", "CONTRADICTORY", "PARTIALLY SUPPORTED", "UNSUPPORTED"
    MUTATIONS = [
        ("P1", "Deep learning systems can detect referable diabetic retinopathy from retinal fundus photographs with a sensitivity of 90.3%.", S, "original"),
        ("P1", "Automated deep learning grading of retinal photographs reached a specificity of 98.1% for referable diabetic retinopathy.", S, "paraphrase"),
        ("P1", "A convolutional neural network trained on retinal fundus images identified referable diabetic retinopathy with high sensitivity.", S, "paraphrase"),
        ("P1", "Deep learning systems can detect referable diabetic retinopathy from retinal fundus photographs with a sensitivity of 99%.", C, "number"),
        ("P1", "The diabetic retinopathy network was trained on 50,000 retinal fundus photographs.", C, "number"),
        ("P1", "Deep learning systems cannot reliably detect referable diabetic retinopathy from retinal fundus photographs.", C, "negation"),
        ("P1", "Deep learning detects referable diabetic retinopathy with a sensitivity of 90.3% in every population and with any camera hardware.", P, "overgeneralisation"),
        ("P2", "Machine learning models achieved 82% accuracy in predicting disease onset from electronic health records.", S, "original"),
        ("P2", "Gradient-boosted models predicted the onset of chronic disease from structured health records with an AUC of 0.86.", S, "paraphrase"),
        ("P2", "Machine learning models achieved 95% accuracy in predicting disease onset from electronic health records.", C, "number"),
        ("P2", "The disease prediction models were developed using the electronic health records of 5,800 patients.", C, "number"),
        ("P2", "Machine learning disease-onset models are accurate enough for autonomous diagnosis without clinician oversight.", C, "direction"),
        ("P4", "Smartwatch sensors identified atrial fibrillation in a community cohort of 4,190 participants.", S, "original"),
        ("P4", "In a community cohort, a smartwatch photoplethysmography algorithm detected atrial fibrillation with a positive predictive value of 0.84.", S, "paraphrase"),
        ("P4", "Smartwatch sensors identified atrial fibrillation in a community cohort of 41,900 participants.", C, "number"),
        ("P4", "Smartwatch notifications can replace clinical ECG confirmation of atrial fibrillation.", C, "direction"),
        ("P6", "Telemedicine programs were associated with a 7.1% reduction in hospital readmissions across randomised trials.", S, "original"),
        ("P6", "A meta-analysis of 48 randomised trials found that telemedicine programmes reduced hospital readmissions.", S, "paraphrase"),
        ("P6", "Telemedicine programs were associated with a 25% reduction in hospital readmissions across randomised trials.", C, "number"),
        ("P6", "Telemedicine programs were associated with an increase in hospital readmissions across randomised trials.", C, "direction"),
        ("P7", "Federated learning reduces, but does not eliminate, privacy risks when hospitals collaborate on model training.", S, "original"),
        ("P7", "Federated models trained across hospitals came within 2 percentage points of the accuracy of centrally trained models.", S, "paraphrase"),
        ("P7", "Federated learning eliminates all privacy risks of sharing patient data between hospitals.", C, "negation"),
        ("P7", "Gradient inversion attacks reconstructed recognisable patient images in 45% of federated learning trials.", C, "number"),
        ("P8", "Explainable AI interfaces increased clinician trust in decision-support recommendations for 62% of clinicians in a single-centre study.", S, "original"),
        ("P8", "Explainable AI interfaces increased clinician trust in decision-support recommendations for 90% of clinicians in a single-centre study.", C, "number"),
        ("P8", "Explainable AI interfaces increase clinician trust in decision-support recommendations across all hospital settings.", P, "overgeneralisation"),
        ("P10", "Deep learning detects pneumonia on chest radiographs at a level exceeding practising radiologists.", S, "original"),
        ("P10", "A convolutional network outperformed practising radiologists at detecting pneumonia on frontal chest radiographs.", S, "paraphrase"),
        ("P10", "Practising radiologists outperformed the deep learning network at detecting pneumonia on chest radiographs.", C, "direction"),
        ("P12", "Data augmentation improved diagnostic model accuracy by 4 to 7 percentage points on small medical imaging datasets.", S, "original"),
        ("P12", "Geometric and intensity augmentation raised the accuracy of diagnostic models trained on small medical imaging datasets.", S, "paraphrase"),
        ("P12", "Data augmentation improved diagnostic model accuracy by 25 percentage points on small medical imaging datasets.", C, "number"),
        ("P13", "Machine learning triage tools reduced median emergency department waiting times by 22% in a multi-site evaluation.", S, "original"),
        ("P13", "Deploying a machine learning triage tool shortened median emergency department waiting time across four sites.", S, "paraphrase"),
        ("P13", "Machine learning triage tools reduced median emergency department waiting times by 60% in a multi-site evaluation.", C, "number"),
        ("P13", "Machine learning triage tools increased median emergency department waiting times in a multi-site evaluation.", C, "direction"),
        # the right claim, cited to the wrong paper
        ("P9", "Deep learning systems can detect referable diabetic retinopathy from retinal fundus photographs with a sensitivity of 90.3%.", U, "wrong paper"),
        ("P9", "Smartwatch sensors identified atrial fibrillation in a community cohort of 4,190 participants.", U, "wrong paper"),
        ("P3", "Deep learning detects pneumonia on chest radiographs at a level exceeding practising radiologists.", U, "wrong paper"),
        ("P14", "Telemedicine programs were associated with a 7.1% reduction in hospital readmissions across randomised trials.", U, "wrong paper"),
        ("P12", "Machine learning triage tools reduced median emergency department waiting times by 22% in a multi-site evaluation.", U, "wrong paper"),
        ("P4", "Federated learning reduces, but does not eliminate, privacy risks when hospitals collaborate on model training.", U, "wrong paper"),
    ]
    rows, by_kind = [], defaultdict(lambda: [0, 0])
    for key, claim, expected, kind in MUTATIONS:
        got = main.evaluate(claim, paper(key), None, depth=1)["verdict"]
        rows.append({"case": "[%s %s] %s" % (key, kind, claim), "expected": expected, "got": got, "ok": got == expected, "kind": kind})
        by_kind[kind][0] += got == expected
        by_kind[kind][1] += 1
    scorecard("2. Mutation tests", rows)
    print("   by type: " + ", ".join("%s %d/%d" % (k, v[0], v[1]) for k, v in by_kind.items()))

    # rules-only comparison on the same cases (what the engine scored before the verification model)
    rules_ok = sum(1 for key, claim, expected, kind in MUTATIONS if main.evaluate_rules(claim, paper(key))["verdict"] == expected)
    RESULTS["2. Mutation tests"]["rules_only_accuracy"] = round(100.0 * rules_ok / len(MUTATIONS), 1)
    print("   rule engine alone on the same cases: %d/%d (%.1f%%)" % (rules_ok, len(MUTATIONS), 100.0 * rules_ok / len(MUTATIONS)))


# ---------------------------------------------------------------- 3. reference existence (live registries)
if want(3):
    EXISTENCE = [
        # (reference string, expected status)  verified | mismatch | not_found | unverified
        ("[1] Gulshan, V., Peng, L., Coram, M. (2016). Development and validation of a deep learning algorithm for detection of diabetic retinopathy in retinal fundus photographs. JAMA. https://doi.org/10.1001/jama.2016.17216", "verified"),
        ("[2] He, K., Zhang, X., Ren, S., Sun, J. (2016). Deep residual learning for image recognition. CVPR. https://doi.org/10.1109/CVPR.2016.90", "verified"),
        ("[3] LeCun, Y., Bengio, Y., Hinton, G. (2015). Deep learning. Nature, 521, 436-444. https://doi.org/10.1038/nature14539", "verified"),
        ("[4] Hochreiter, S., Schmidhuber, J. (1997). Long short-term memory. Neural Computation, 9(8). https://doi.org/10.1162/neco.1997.9.8.1735", "verified"),
        ("[5] Jumper, J., Evans, R., Pritzel, A. (2021). Highly accurate protein structure prediction with AlphaFold. Nature. https://doi.org/10.1038/s41586-021-03819-2", "verified"),
        ("[6] Polack, F. P., Thomas, S. J., Kitchin, N. (2020). Safety and efficacy of the BNT162b2 mRNA Covid-19 vaccine. N Engl J Med. https://doi.org/10.1056/NEJMoa2034577", "verified"),
        ("[7] Breiman, L. (2001). Random forests. Machine Learning, 45(1), 5-32. https://doi.org/10.1023/A:1010933404324", "verified"),
        ("[8] Foster, K. R., Koprowski, R., Skufca, J. D. (2014). Machine learning, medical diagnosis, and biomedical engineering research - commentary. BioMedical Engineering OnLine. https://doi.org/10.1186/1475-925X-13-94", "verified"),
        ("[9] Krizhevsky, A., Sutskever, I., Hinton, G. E. (2017). ImageNet classification with deep convolutional neural networks. Communications of the ACM. https://doi.org/10.1145/3065386", "verified"),
        ("[10] Vaswani, A., Shazeer, N., Parmar, N. (2017). Attention is all you need. https://doi.org/10.48550/arXiv.1706.03762", "verified"),
        ("[11] Devlin, J., Chang, M.-W., Lee, K., Toutanova, K. (2018). BERT: Pre-training of deep bidirectional transformers for language understanding. https://doi.org/10.48550/arXiv.1810.04805", "verified"),
        ("[12] Ba, J. L., Kiros, J. R., Hinton, G. E. (2016). Layer normalization. arXiv preprint arXiv:1607.06450.", "verified"),
        ("[13] Kingma, D. P., Ba, J. (2014). Adam: A method for stochastic optimization. arXiv preprint arXiv:1412.6980.", "verified"),
        ("[14] Bahdanau, D., Cho, K., Bengio, Y. (2014). Neural machine translation by jointly learning to align and translate. CoRR, abs/1409.0473.", "verified"),
        ("[15] Lundberg, S. M., Lee, S.-I. (2017). A unified approach to interpreting model predictions. arXiv:1705.07874.", "verified"),
        # real papers, no DOI or arXiv id: must be found by searching the full reference text
        ("[16] Breiman, L. (2001). Random forests. Machine Learning, 45(1), 5-32.", "verified"),
        ("[17] Hochreiter, S., Schmidhuber, J. (1997). Long short-term memory. Neural Computation, 9(8), 1735-1780.", "verified"),
        ("[18] LeCun, Y., Bengio, Y., Hinton, G. (2015). Deep learning. Nature, 521(7553), 436-444.", "verified"),
        # real DOIs with manipulated metadata
        ("[19] Gulshan, V., Peng, L., Coram, M. (2012). Development and validation of a deep learning algorithm for detection of diabetic retinopathy in retinal fundus photographs. JAMA. https://doi.org/10.1001/jama.2016.17216", "mismatch"),
        ("[20] Smith, J., Brown, A. (2016). Deep residual learning for image recognition. CVPR. https://doi.org/10.1109/CVPR.2016.90", "mismatch"),
        ("[21] LeCun, Y., Bengio, Y., Hinton, G. (2009). Deep learning. Nature. https://doi.org/10.1038/nature14539", "mismatch"),
        ("[22] Johnson, M. (2001). Random forests. Machine Learning. https://doi.org/10.1023/A:1010933404324", "mismatch"),
        # fabricated DOIs (well-formed, but never registered)
        ("[23] Gulshan, V. (2016). Development and validation of a deep learning algorithm for detection of diabetic retinopathy. JAMA. https://doi.org/10.1001/jama.2016.17216x7q", "not_found"),
        ("[24] Patel, R., Kim, S. (2023). Quantum transformers for universal cancer screening. Nature Medicine. https://doi.org/10.1038/s41591-023-99999-zq", "not_found"),
        ("[25] Garcia, L. (2022). Self-healing neural networks in intensive care. The Lancet Digital Health. https://doi.org/10.1016/S2589-7500(22)99999-Q", "not_found"),
        ("[26] Okoye, T. (2021). Blockchain-verified peer review eliminates citation fraud. PLOS ONE. https://doi.org/10.1371/journal.pone.9999999", "not_found"),
        ("[27] Liu, H. (2020). Federated diffusion models for rare disease discovery. arXiv. https://doi.org/10.48550/arXiv.2099.99999", "not_found"),
        # fabricated papers without a DOI: plausible titles that do not exist
        ("[28] Hartmann, P., Osei, K. (2019). Universal accuracy gains from recursive augmentation of clinical neural networks. Journal of Medical Artificial Intelligence, 7(2), 101-119.", "unverified"),
        ("[29] Delacroix, M. (2021). A transformer that eliminates diagnostic error in emergency triage. International Journal of Clinical Machine Learning, 3(4), 55-71.", "unverified"),
        ("[30] Nwosu, C., Brandt, E. (2018). Smartwatch electrocardiography replaces hospital cardiology: a 2 million patient study. Digital Cardiology Letters, 12, 1-9.", "unverified"),
    ]
    if args.offline:
        print("\n== 3. Reference existence: skipped (--offline)")
    else:
        rows = []
        for i, raw in enumerate(EXISTENCE):
            pr = main.parse_reference(raw[0], i + 1)
            p_, reason = main.resolve_reference(db, pr, True)
            status, issues = main.check_metadata(pr, p_, reason)
            got = "unverified" if status in ("unverified", "not_found") and raw[1] == "unverified" else status
            rows.append({"case": raw[0], "expected": raw[1], "got": got, "ok": got == raw[1],
                         "detail": issues[0]["message"] if issues else (p_.title if p_ else "")})
        scorecard("3. Reference existence (live registries)", rows)
        real = [r for r in rows if r["expected"] in ("verified",)]
        fake = [r for r in rows if r["expected"] in ("not_found", "unverified")]
        print("   real references accepted: %d/%d | fabricated references caught: %d/%d | manipulated metadata caught: %d/%d" % (
            sum(r["ok"] for r in real), len(real), sum(r["got"] in ("not_found", "unverified") for r in fake), len(fake),
            sum(r["ok"] for r in rows if r["expected"] == "mismatch"), sum(1 for r in rows if r["expected"] == "mismatch")))


# ---------------------------------------------------------------- 4. parsing
if want(4):
    # three real papers as published, with the number of entries in their printed reference lists
    PUBLIC_PDFS = [
        ("Attention Is All You Need (arXiv)", "https://arxiv.org/pdf/1706.03762v7", 40),
        ("ImageNet classification with deep CNNs (NeurIPS 2012)",
         "https://proceedings.neurips.cc/paper_files/paper/2012/file/c399862d3b9d6b76c8436e924a68c45b-Paper.pdf", 26),
        ("HMLFSM gene classification (PLOS ONE 2023)",
         "https://journals.plos.org/plosone/article/file?id=10.1371/journal.pone.0286791&type=printable", 51),
    ]
    EXPECTED_REFS = {name: n for name, _, n in PUBLIC_PDFS}
    uploaded = []
    if not args.offline:
        for name, url, _ in PUBLIC_PDFS:
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "CiteVerify-test/1.0"})
                uploaded.append((name, main.extract_text("x.pdf", urllib.request.urlopen(req, timeout=60).read())))
            except Exception as e:
                print("   could not download %s: %s" % (name, e))
    rows = []
    for fname, text in uploaded:
        if fname not in EXPECTED_REFS:
            continue
        body, refs = main.split_body_references(text)
        parsed = [main.parse_reference(r, i + 1) for i, r in enumerate(refs)]
        rows.append({"case": "%s: references found" % fname, "expected": str(EXPECTED_REFS[fname]), "got": str(len(refs)), "ok": len(refs) == EXPECTED_REFS[fname]})
        labels = {p["label"] for p in parsed}
        cited = [l for c in main.extract_claims(body) for l in c["labels"] if " " not in l]
        unresolved = sorted({l for l in cited if l not in labels})
        rows.append({"case": "%s: every in-text citation maps to a reference (%d citations)" % (fname, len(cited)), "expected": "[]",
                     "got": str(unresolved), "ok": not unresolved})
        titled = sum(1 for p in parsed if len(p["title"].split()) >= 2)
        rows.append({"case": "%s: titles extracted" % fname, "expected": ">= 95%%", "got": "%d/%d" % (titled, len(parsed)), "ok": titled >= 0.95 * len(parsed)})
    # round trips: the sample documents written as DOCX and PDF, then read back through the upload pipeline
    import docx as _docx  # noqa: E402
    import fitz  # noqa: E402
    for name in ("accurate", "story", "onechange", "original"):
        text = main.build_document_text(main.SAMPLE_SPECS[name])
        n_claims = len(main.extract_claims(main.split_body_references(text)[0]))
        d = _docx.Document()
        for line in text.split("\n"):
            d.add_paragraph(line)
        buf = io.BytesIO()
        d.save(buf)
        t_docx = main.extract_text("x.docx", buf.getvalue())
        pdf = fitz.open()
        page = pdf.new_page()
        page.insert_textbox(fitz.Rect(40, 40, 555, 800), text, fontsize=7)
        t_pdf = main.extract_text("x.pdf", pdf.tobytes())
        for fmt, t in (("DOCX", t_docx), ("PDF", t_pdf)):
            b, r = main.split_body_references(t)
            got = len(main.extract_claims(b))
            rows.append({"case": "%s sample via %s: claims and references recovered" % (name, fmt), "expected": "%d claims, %d refs" % (
                n_claims, len(main.split_body_references(text)[1])), "got": "%d claims, %d refs" % (got, len(r)),
                "ok": got == n_claims and len(r) == len(main.split_body_references(text)[1])})
    scorecard("4. Parsing", rows)


# ---------------------------------------------------------------- 5. numbers
if want(5):
    NUM_CASES = [
        ("accuracy of 82%", [82.0]), ("a cohort of 4,190 participants", [4190.0]), ("about 40K training sentences", [40000.0]),
        ("36M sentences", [36000000.0]), ("improved by 4 to 7 percentage points", [4.0, 7.0]), ("AUC of 0.86", [0.86]),
        ("published in 2019 with 112,400 images", [112400.0]), ("a 7.1% reduction", [7.1]), ("F1 score of 0.44", [0.44]),
        ("around 10 million unique proteins", [10000000.0]), ("a 1.6 billion words data set", [1600000000.0]),
        ("sites in six countries", [6.0]), ("trained on eight GPUs for 3.5 days", [8.0, 3.5]),
    ]
    rows = []
    for text, exp in NUM_CASES:
        got = [n["value"] for n in main.parse_numbers(text)]
        rows.append({"case": "extract: %s" % text, "expected": str(exp), "got": str(got), "ok": got == exp})
    CMP = [
        ("Models achieve 95% accuracy in disease prediction.", "The proposed model achieved an accuracy of 82% in predicting disease onset.", False),
        ("Models achieve 82% accuracy in disease prediction.", "The proposed model achieved an accuracy of 82% in predicting disease onset.", True),
        ("Penn Treebank has about 40K training sentences.", "The parser reached an F1 of 4.5 on the dev set.", None),
        ("Readmissions fell by 15%.", "A 7.1% reduction in hospital readmissions was observed.", False),
    ]
    for claim, passage, exp in CMP:
        ps = {"text": passage, "section": "Results", "page": 1}
        res = main.compare_numbers(claim, [ps], ps)
        got = res[0]["match"] if res else None
        rows.append({"case": "compare: %s | %s" % (claim, passage), "expected": str(exp), "got": str(got), "ok": got == exp})
    CLEAN = [  # registry abstracts arrive as JATS/HTML; a bare "<" is data, not a tag
        ("<jats:p>hazard ratio 0.75; P<0.001). All-cause mortality was lower.</jats:p>", "hazard ratio 0.75; P<0.001). All-cause mortality was lower."),
        ("error below <5% with <i>in vitro</i> data", "error below <5% with in vitro data"),
        ('<p class="abs">P &lt; 0.05 and x<y and a>b</p>', "P < 0.05 and x<y and a>b"),
    ]
    for raw, exp in CLEAN:
        got = main.clean_text(raw)
        rows.append({"case": "clean: %s" % raw, "expected": exp, "got": got, "ok": got == exp})
    scorecard("5. Number extraction and comparison", rows)


# ---------------------------------------------------------------- 6 + 7. real published papers (live)
# 40 real papers (computer science and clinical trials). The engine looks each reference up exactly as it would in an
# uploaded document (DOI / arXiv id -> Crossref, doi.org, arXiv, Europe PMC, Semantic Scholar) and judges claims written
# against the real abstract: faithful paraphrases, changed figures, figures swapped between settings, reversed findings,
# right claims cited to an unrelated paper, and true details that only the full text contains.
# Suite 6 was used while improving the engine (development set). Suite 7 was written before its first run and the engine
# was not changed afterwards (held-out set) - its score is the honest estimate for new documents.
S, C, P, U = "SUPPORTED", "CONTRADICTORY", "PARTIALLY SUPPORTED", "UNSUPPORTED"
DEV_PAPERS = {
    'transformer': 'Vaswani, A., Shazeer, N., Parmar, N. (2017). Attention is all you need. arXiv:1706.03762.',
    'resnet': 'He, K., Zhang, X., Ren, S., Sun, J. (2015). Deep residual learning for image recognition. arXiv:1512.03385.',
    'bert': 'Devlin, J., Chang, M.-W., Lee, K., Toutanova, K. (2018). BERT: Pre-training of deep bidirectional transformers for language understanding. arXiv:1810.04805.',
    'batchnorm': 'Ioffe, S., Szegedy, C. (2015). Batch normalization: Accelerating deep network training by reducing internal covariate shift. arXiv:1502.03167.',
    'chexnet': 'Rajpurkar, P., Irvin, J., Zhu, K. (2017). CheXNet: Radiologist-level pneumonia detection on chest X-rays with deep learning. arXiv:1711.05225.',
    'gulshan': 'Gulshan, V., Peng, L., Coram, M. (2016). Development and validation of a deep learning algorithm for detection of diabetic retinopathy in retinal fundus photographs. JAMA. https://doi.org/10.1001/jama.2016.17216',
    'pfizer': 'Polack, F. P., Thomas, S. J., Kitchin, N. (2020). Safety and efficacy of the BNT162b2 mRNA Covid-19 vaccine. N Engl J Med. https://doi.org/10.1056/NEJMoa2034577',
    'moderna': 'Baden, L. R., El Sahly, H. M., Essink, B. (2021). Efficacy and safety of the mRNA-1273 SARS-CoV-2 vaccine. N Engl J Med. https://doi.org/10.1056/NEJMoa2035389',
    'esteva': 'Esteva, A., Kuprel, B., Novoa, R. A. (2017). Dermatologist-level classification of skin cancer with deep neural networks. Nature. https://doi.org/10.1038/nature21056',
    'alphago': 'Silver, D., Huang, A., Maddison, C. J. (2016). Mastering the game of Go with deep neural networks and tree search. Nature. https://doi.org/10.1038/nature16961',
    'dqn': 'Mnih, V., Kavukcuoglu, K., Silver, D. (2015). Human-level control through deep reinforcement learning. Nature. https://doi.org/10.1038/nature14236',
    'hannun': 'Hannun, A. Y., Rajpurkar, P., Haghpanahi, M. (2019). Cardiologist-level arrhythmia detection and classification in ambulatory electrocardiograms using a deep neural network. Nature Medicine. https://doi.org/10.1038/s41591-018-0268-3',
    'appleheart': 'Perez, M. V., Mahaffey, K. W., Hedlin, H. (2019). Large-scale assessment of a smartwatch to identify atrial fibrillation. N Engl J Med. https://doi.org/10.1056/NEJMoa1901183',
    'mckinney': 'McKinney, S. M., Sieniek, M., Godbole, V. (2020). International evaluation of an AI system for breast cancer screening. Nature. https://doi.org/10.1038/s41586-019-1799-6',
    'rajkomar': 'Rajkomar, A., Oren, E., Chen, K. (2018). Scalable and accurate deep learning with electronic health records. npj Digital Medicine. https://doi.org/10.1038/s41746-018-0029-1',
    'liu': 'Liu, X., Faes, L., Kale, A. U. (2019). A comparison of deep learning performance against health-care professionals in detecting diseases from medical imaging: a systematic review and meta-analysis. The Lancet Digital Health. https://doi.org/10.1016/S2589-7500(19)30123-2',
    'alexnet': 'Krizhevsky, A., Sutskever, I., Hinton, G. E. (2017). ImageNet classification with deep convolutional neural networks. Communications of the ACM. https://doi.org/10.1145/3065386',
    'alphafold': 'Jumper, J., Evans, R., Pritzel, A. (2021). Highly accurate protein structure prediction with AlphaFold. Nature. https://doi.org/10.1038/s41586-021-03819-2',
    'dexamethasone': 'RECOVERY Collaborative Group (2021). Dexamethasone in hospitalized patients with Covid-19. N Engl J Med. https://doi.org/10.1056/NEJMoa2021436',
    'hcq': 'RECOVERY Collaborative Group (2020). Effect of hydroxychloroquine in hospitalized patients with Covid-19. N Engl J Med. https://doi.org/10.1056/NEJMoa2022926',
    'sprint': 'SPRINT Research Group (2015). A randomized trial of intensive versus standard blood-pressure control. N Engl J Med. https://doi.org/10.1056/NEJMoa1511939',
    'gpt3': 'Brown, T. B., Mann, B., Ryder, N. (2020). Language models are few-shot learners. arXiv:2005.14165.',
    'word2vec': 'Mikolov, T., Chen, K., Corrado, G., Dean, J. (2013). Efficient estimation of word representations in vector space. arXiv:1301.3781.',
    'unet': 'Ronneberger, O., Fischer, P., Brox, T. (2015). U-Net: Convolutional networks for biomedical image segmentation. arXiv:1505.04597.',
}

DEV_CASES = [
    ('transformer', 'The Transformer, an architecture built only on attention, reached 28.4 BLEU on WMT 2014 English-to-German translation.', S, 'faithful'),
    ('transformer', 'On WMT 2014 English-to-French, the Transformer set a single-model state-of-the-art BLEU score of 41.8 after training for 3.5 days on eight GPUs.', S, 'faithful'),
    ('transformer', 'The Transformer reached 34.6 BLEU on the WMT 2014 English-to-German translation task.', C, 'number'),
    ('transformer', 'The Transformer reached 41.8 BLEU on the WMT 2014 English-to-German translation task.', C, 'swapped number'),
    ('transformer', 'The Transformer relies on recurrent layers and convolutions to model sequences.', C, 'reversed'),
    ('transformer', 'The base Transformer model uses 8 parallel attention heads.', P, 'not in abstract'),
    ('resnet', 'An ensemble of residual networks achieved 3.57% error on the ImageNet test set and won first place in the ILSVRC 2015 classification task.', S, 'faithful'),
    ('resnet', 'Residual networks with up to 152 layers were evaluated on ImageNet, eight times deeper than VGG nets.', S, 'faithful'),
    ('resnet', 'An ensemble of residual networks achieved 7.3% error on the ImageNet test set.', C, 'number'),
    ('resnet', 'Residual networks became harder to optimize than plain networks as depth increased.', C, 'reversed'),
    ('bert', 'BERT pushed the GLUE benchmark score to 80.5%, a 7.7 point absolute improvement.', S, 'faithful'),
    ('bert', 'BERT reached a SQuAD v1.1 question answering test F1 of 93.2.', S, 'faithful'),
    ('bert', 'BERT pushed the GLUE benchmark score to 91.2%.', C, 'number'),
    ('bert', 'BERT reached a MultiNLI accuracy of 76.4%.', C, 'number'),
    ('bert', 'BERT pre-trains unidirectional representations that condition only on the left context.', C, 'reversed'),
    ('batchnorm', 'Batch normalization matched the accuracy of the original image classification model with 14 times fewer training steps.', S, 'faithful'),
    ('batchnorm', 'An ensemble of batch-normalized networks reached 4.9% top-5 validation error on ImageNet classification.', S, 'faithful'),
    ('batchnorm', 'Batch normalization matched the accuracy of the original model with 3 times fewer training steps.', C, 'number'),
    ('batchnorm', 'Batch normalization forces the use of lower learning rates and more careful parameter initialization.', C, 'reversed'),
    ('chexnet', 'CheXNet, a 121-layer convolutional network, exceeded average radiologist performance on the F1 metric for pneumonia detection.', S, 'faithful'),
    ('chexnet', 'CheXNet was trained on ChestX-ray14, which contains over 100,000 frontal-view chest X-ray images with 14 diseases.', S, 'faithful'),
    ('chexnet', 'CheXNet is a 34-layer convolutional neural network.', C, 'number'),
    ('chexnet', 'CheXNet performed worse than practicing radiologists at detecting pneumonia on chest X-rays.', C, 'reversed'),
    ('gulshan', 'On EyePACS-1, the diabetic retinopathy algorithm reached a sensitivity of 90.3% and a specificity of 98.1% at the high-specificity operating point.', S, 'faithful'),
    ('gulshan', 'The algorithm detected referable diabetic retinopathy with an area under the ROC curve of 0.991 on EyePACS-1.', S, 'faithful'),
    ('gulshan', 'On EyePACS-1, the diabetic retinopathy algorithm reached a sensitivity of 99.3% at the high-specificity operating point.', C, 'number'),
    ('gulshan', 'The diabetic retinopathy algorithm was developed using 12,817 retinal images.', C, 'number'),
    ('gulshan', 'For Messidor-2, the diabetic retinopathy algorithm had a sensitivity of 90.3% at the high-specificity operating point.', C, 'swapped number'),
    ('pfizer', 'BNT162b2 was 95% effective in preventing Covid-19 in persons 16 years of age or older.', S, 'faithful'),
    ('pfizer', 'In the BNT162b2 efficacy trial, 43,548 participants underwent randomization.', S, 'faithful'),
    ('pfizer', 'BNT162b2 was 70% effective in preventing Covid-19.', C, 'number'),
    ('pfizer', 'The incidence of serious adverse events was much higher in the BNT162b2 group than in the placebo group.', C, 'reversed'),
    ('moderna', 'The mRNA-1273 vaccine showed 94.1% efficacy at preventing Covid-19 illness, including severe disease.', S, 'faithful'),
    ('moderna', 'The mRNA-1273 phase 3 trial enrolled 30,420 volunteers at 99 centers across the United States.', S, 'faithful'),
    ('moderna', 'The mRNA-1273 vaccine showed 64.1% efficacy at preventing Covid-19 illness.', C, 'number'),
    ('moderna', 'Serious safety concerns were identified for the mRNA-1273 vaccine.', C, 'reversed'),
    ('esteva', 'A single CNN trained on 129,450 clinical images performed on par with 21 board-certified dermatologists at classifying skin cancer.', S, 'faithful'),
    ('esteva', 'The skin cancer classifier was trained on 12,945 clinical images.', C, 'number'),
    ('esteva', 'The CNN performed significantly worse than board-certified dermatologists at classifying skin cancer.', C, 'reversed'),
    ('alphago', 'AlphaGo achieved a 99.8% winning rate against other Go programs and defeated the European Go champion by 5 games to 0.', S, 'faithful'),
    ('alphago', 'AlphaGo achieved a 75% winning rate against other Go programs.', C, 'number'),
    ('alphago', 'AlphaGo lost its match against the human European Go champion.', C, 'reversed'),
    ('dqn', 'The deep Q-network learned 49 Atari 2600 games from pixels and the game score, reaching a level comparable to a professional human games tester.', S, 'faithful'),
    ('dqn', 'The deep Q-network was evaluated on a set of 12 Atari 2600 games.', C, 'number'),
    ('dqn', 'The deep Q-network needed a different network architecture and hand-tuned hyperparameters for each game.', C, 'reversed'),
    ('hannun', 'A deep neural network trained on 91,232 single-lead ECGs reached an average F1 score of 0.837, exceeding the average cardiologist score of 0.780.', S, 'faithful'),
    ('hannun', 'The arrhythmia network reached an average F1 score of 0.937.', C, 'number'),
    ('hannun', 'The deep neural network had a lower average F1 score than the average cardiologist.', C, 'reversed'),
    ('appleheart', 'The Apple Heart Study recruited 419,297 participants, of whom 0.52% received irregular pulse notifications.', S, 'faithful'),
    ('appleheart', 'Among notified participants, the positive predictive value of an irregular pulse notification for atrial fibrillation was 0.84.', S, 'faithful'),
    ('appleheart', 'The Apple Heart Study recruited 41,929 participants.', C, 'number'),
    ('appleheart', 'Atrial fibrillation was present in 74% of participants who returned analyzable ECG patches.', C, 'number'),
    ('mckinney', 'In a simulated UK double-reading process, the breast cancer AI system reduced the workload of the second reader by 88%.', S, 'faithful'),
    ('mckinney', 'On the USA dataset, the AI system gave an absolute reduction of 5.7% in false positives and 9.4% in false negatives.', S, 'faithful'),
    ('mckinney', 'The AI system reduced the workload of the second reader by 38%.', C, 'number'),
    ('mckinney', 'In the reader study, all six radiologists outperformed the AI system.', C, 'reversed'),
    ('rajkomar', 'Deep learning on raw EHR data from 216,221 hospitalized adults predicted in-hospital mortality with an AUROC of 0.93 to 0.94.', S, 'faithful'),
    ('rajkomar', 'Deep learning models predicted 30-day unplanned readmission with an AUROC of 0.95.', C, 'number'),
    ('rajkomar', 'The deep learning models performed worse than traditional, clinically used predictive models.', C, 'reversed'),
    ('liu', 'The meta-analysis found a pooled sensitivity of 87.0% for deep learning models and 86.4% for health-care professionals.', S, 'faithful'),
    ('liu', 'The review found the diagnostic performance of deep learning models to be equivalent to that of health-care professionals.', S, 'faithful'),
    ('liu', 'Of the 31,587 studies identified by the search, 482 were included in the review.', C, 'number'),
    ('liu', 'The meta-analysis found that deep learning models clearly outperform health-care professionals at diagnosing disease from medical images.', C, 'reversed'),
    ('alexnet', 'In ILSVRC-2012 the network achieved a winning top-5 test error rate of 15.3%, compared with 26.2% for the second-best entry.', S, 'faithful'),
    ('alexnet', 'The ImageNet network has 60 million parameters and 650,000 neurons.', S, 'faithful'),
    ('alexnet', 'On the ILSVRC-2010 test data the network achieved top-1 and top-5 error rates of 27.5% and 9.0%.', C, 'number'),
    ('alexnet', 'The network has 6 million parameters and five convolutional layers.', C, 'number'),
    ('alphafold', 'AlphaFold predicted protein structures with accuracy competitive with experimental structures in a majority of cases in CASP14.', S, 'faithful'),
    ('alphafold', 'AlphaFold performed worse than other structure prediction methods in CASP14.', C, 'reversed'),
    ('alphafold', 'The structures of around 10 million unique proteins have been determined experimentally.', C, 'number'),
    ('dexamethasone', 'Dexamethasone lowered 28-day mortality among hospitalized Covid-19 patients receiving invasive mechanical ventilation or oxygen alone.', S, 'faithful'),
    ('dexamethasone', 'In the RECOVERY trial, 22.9% of patients in the dexamethasone group and 25.7% in the usual care group died within 28 days.', S, 'faithful'),
    ('dexamethasone', 'Dexamethasone lowered 28-day mortality among Covid-19 patients who were receiving no respiratory support.', C, 'reversed'),
    ('dexamethasone', 'Patients in the dexamethasone group received 60 mg of dexamethasone once daily.', C, 'number'),
    ('hcq', 'Hydroxychloroquine did not lower 28-day mortality among patients hospitalized with Covid-19.', S, 'faithful'),
    ('hcq', 'Hydroxychloroquine significantly reduced 28-day mortality in patients hospitalized with Covid-19.', C, 'reversed'),
    ('hcq', 'Death within 28 days occurred in 12.0% of patients in the hydroxychloroquine group.', C, 'number'),
    ('sprint', 'Targeting a systolic blood pressure below 120 mm Hg lowered rates of major cardiovascular events in high-risk patients without diabetes.', S, 'faithful'),
    ('sprint', 'SPRINT randomly assigned 9361 persons without diabetes to intensive or standard systolic blood-pressure targets.', S, 'faithful'),
    ('sprint', 'Intensive blood-pressure control increased the rate of major cardiovascular events compared with standard treatment.', C, 'reversed'),
    ('sprint', 'The SPRINT intervention was stopped early after a median follow-up of 5.2 years.', C, 'number'),
    ('gpt3', 'GPT-3 is an autoregressive language model with 175 billion parameters that is evaluated in the few-shot setting without gradient updates.', S, 'faithful'),
    ('gpt3', 'GPT-3 is an autoregressive language model with 17 billion parameters.', C, 'number'),
    ('gpt3', 'GPT-3 was fine-tuned with gradient updates for every task it was evaluated on.', C, 'reversed'),
    ('word2vec', 'The proposed architectures learn high quality word vectors from a 1.6 billion word data set in less than a day.', S, 'faithful'),
    ('word2vec', 'Learning high quality word vectors from the 1.6 billion word data set took several weeks of computation.', C, 'reversed'),
    ('unet', 'U-Net segments a 512x512 image in less than a second on a recent GPU.', S, 'faithful'),
    ('unet', 'U-Net won the ISBI cell tracking challenge 2015 by a large margin.', S, 'faithful'),
    ('unet', 'U-Net needs many thousands of annotated training images to be trained successfully.', C, 'reversed'),
    ('resnet', 'BNT162b2 was 95% effective in preventing Covid-19 in persons 16 years of age or older.', U, 'wrong paper'),
    ('sprint', 'An ensemble of residual networks achieved 3.57% error on the ImageNet test set.', U, 'wrong paper'),
    ('hcq', 'AlphaGo achieved a 99.8% winning rate against other Go programs.', U, 'wrong paper'),
    ('gpt3', 'Targeting a systolic blood pressure below 120 mm Hg lowered rates of major cardiovascular events.', U, 'wrong paper'),
    ('appleheart', 'BERT pushed the GLUE benchmark score to 80.5%.', U, 'wrong paper'),
    ('word2vec', 'A deep neural network reached an average F1 score of 0.837 for arrhythmia detection from single-lead ECGs.', U, 'wrong paper'),
    ('alphafold', 'The breast cancer AI system reduced the workload of the second reader by 88%.', U, 'wrong paper'),
    ('unet', 'The mRNA-1273 vaccine showed 94.1% efficacy at preventing Covid-19 illness.', U, 'wrong paper'),
    ('dexamethasone', 'The deep Q-network reached human-level performance across 49 Atari games.', U, 'wrong paper'),
    ('batchnorm', 'A CNN classified skin cancer at a level comparable to board-certified dermatologists.', U, 'wrong paper'),
    ('resnet', 'Residual networks apply batch normalization right after each convolution and before activation.', P, 'not in abstract'),
    ('pfizer', 'The BNT162b2 trial enrolled participants at sites in six countries.', P, 'not in abstract'),
    ('alexnet', 'The network was trained on two GTX 580 GPUs for five to six days.', P, 'not in abstract'),
    ('gpt3', 'GPT-3 was trained on a filtered version of the Common Crawl dataset.', P, 'not in abstract'),
]

HELDOUT_PAPERS = {
    'yolo': 'Redmon, J., Divvala, S., Girshick, R., Farhadi, A. (2015). You only look once: Unified, real-time object detection. arXiv:1506.02640.',
    'seq2seq': 'Sutskever, I., Vinyals, O., Le, Q. V. (2014). Sequence to sequence learning with neural networks. arXiv:1409.3215.',
    'clip': 'Radford, A., Kim, J. W., Hallacy, C. (2021). Learning transferable visual models from natural language supervision. arXiv:2103.00020.',
    'llama': 'Touvron, H., Lavril, T., Izacard, G. (2023). LLaMA: Open and efficient foundation language models. arXiv:2302.13971.',
    'vgg': 'Simonyan, K., Zisserman, A. (2014). Very deep convolutional networks for large-scale image recognition. arXiv:1409.1556.',
    'gan': 'Goodfellow, I. J., Pouget-Abadie, J., Mirza, M. (2014). Generative adversarial networks. arXiv:1406.2661.',
    'maskrcnn': 'He, K., Gkioxari, G., Dollar, P., Girshick, R. (2017). Mask R-CNN. arXiv:1703.06870.',
    'vit': 'Dosovitskiy, A., Beyer, L., Kolesnikov, A. (2020). An image is worth 16x16 words: Transformers for image recognition at scale. arXiv:2010.11929.',
    'remdesivir': 'Beigel, J. H., Tomashek, K. M., Dodd, L. E. (2020). Remdesivir for the treatment of Covid-19 - final report. N Engl J Med. https://doi.org/10.1056/NEJMoa2007764',
    'tirzepatide': 'Jastreboff, A. M., Aronne, L. J., Ahmad, N. N. (2022). Tirzepatide once weekly for the treatment of obesity. N Engl J Med. https://doi.org/10.1056/NEJMoa2206038',
    'semaglutide': 'Wilding, J. P. H., Batterham, R. L., Calanna, S. (2021). Once-weekly semaglutide in adults with overweight or obesity. N Engl J Med. https://doi.org/10.1056/NEJMoa2032183',
    'aspree': 'McNeil, J. J., Woods, R. L., Nelson, M. R. (2018). Effect of aspirin on disability-free survival in the healthy elderly. N Engl J Med. https://doi.org/10.1056/NEJMoa1800722',
    'vital': 'Manson, J. E., Cook, N. R., Lee, I.-M. (2019). Vitamin D supplements and prevention of cancer and cardiovascular disease. N Engl J Med. https://doi.org/10.1056/NEJMoa1809944',
    'empareg': 'Zinman, B., Wanner, C., Lachin, J. M. (2015). Empagliflozin, cardiovascular outcomes, and mortality in type 2 diabetes. N Engl J Med. https://doi.org/10.1056/NEJMoa1504720',
    'ardila': 'Ardila, D., Kiraly, A. P., Bharadwaj, S. (2019). End-to-end lung cancer screening with three-dimensional deep learning on low-dose chest computed tomography. Nature Medicine. https://doi.org/10.1038/s41591-019-0447-x',
    'defauw': 'De Fauw, J., Ledsam, J. R., Romera-Paredes, B. (2018). Clinically applicable deep learning for diagnosis and referral in retinal disease. Nature Medicine. https://doi.org/10.1038/s41591-018-0107-6',
}

HELDOUT_CASES = [
    ('yolo', 'The base YOLO model processes images in real time at 45 frames per second.', S, 'faithful'),
    ('yolo', 'Fast YOLO processes 155 frames per second while achieving double the mAP of other real-time detectors.', S, 'faithful'),
    ('yolo', 'The base YOLO model processes images at 15 frames per second.', C, 'number'),
    ('yolo', 'Compared with state-of-the-art detectors, YOLO is more likely to predict false detections where nothing exists.', C, 'reversed'),
    ('seq2seq', "On WMT'14 English to French, the LSTM translations achieved a BLEU score of 34.8 on the entire test set.", S, 'faithful'),
    ('seq2seq', "Reversing the order of the words in the source sentences markedly improved the LSTM's performance.", S, 'faithful'),
    ('seq2seq', 'The phrase-based SMT baseline achieved a BLEU score of 38.3 on the same dataset.', C, 'number'),
    ('seq2seq', "On the entire WMT'14 English to French test set, the LSTM on its own achieved a BLEU score of 36.5.", C, 'swapped number'),
    ('seq2seq', 'The LSTM had great difficulty translating long sentences.', C, 'reversed'),
    ('clip', 'CLIP was pre-trained on a dataset of 400 million image-text pairs collected from the internet.', S, 'faithful'),
    ('clip', 'Zero-shot CLIP matches the accuracy of the original ResNet-50 on ImageNet without using any of its 1.28 million training examples.', S, 'faithful'),
    ('clip', 'CLIP was pre-trained on a dataset of 40 million image-text pairs.', C, 'number'),
    ('clip', 'CLIP needs dataset-specific training before it can transfer to downstream tasks.', C, 'reversed'),
    ('llama', 'LLaMA-13B outperforms GPT-3 (175B) on most benchmarks.', S, 'faithful'),
    ('llama', 'The LLaMA models range from 7B to 65B parameters and were trained only on publicly available datasets.', S, 'faithful'),
    ('llama', 'The LLaMA models range from 7B to 650B parameters.', C, 'number'),
    ('llama', 'LLaMA was trained mainly on proprietary and inaccessible datasets.', C, 'reversed'),
    ('vgg', 'Pushing convolutional network depth to 16-19 weight layers gave a significant improvement over prior-art configurations.', S, 'faithful'),
    ('vgg', 'The VGG team secured first place in localisation and second place in classification in the ImageNet Challenge 2014.', S, 'faithful'),
    ('vgg', 'The VGG team won first place in the classification track of the ImageNet Challenge 2014.', C, 'swapped number'),
    ('vgg', 'The VGG networks rely on large 11x11 convolution filters.', C, 'reversed'),
    ('gan', 'In a generative adversarial network, a generator and a discriminator are trained simultaneously in a minimax two-player game.', S, 'faithful'),
    ('gan', 'When G and D are multilayer perceptrons, the whole system can be trained with backpropagation and needs no Markov chains.', S, 'faithful'),
    ('gan', 'Training generative adversarial networks requires Markov chains or unrolled approximate inference networks.', C, 'reversed'),
    ('maskrcnn', 'Mask R-CNN extends Faster R-CNN with a branch that predicts an object mask in parallel with bounding box recognition, running at 5 fps.', S, 'faithful'),
    ('maskrcnn', 'Mask R-CNN runs at 50 fps.', C, 'number'),
    ('maskrcnn', 'Mask R-CNN adds a large computational overhead to Faster R-CNN.', C, 'reversed'),
    ('vit', 'A pure transformer applied directly to sequences of image patches can perform very well on image classification tasks.', S, 'faithful'),
    ('vit', 'When pre-trained on large amounts of data, the Vision Transformer attains excellent results while needing substantially fewer computational resources to train than convolutional networks.', S, 'faithful'),
    ('vit', 'The Vision Transformer needs substantially more computational resources to train than state-of-the-art convolutional networks.', C, 'reversed'),
    ('remdesivir', 'Remdesivir shortened the median recovery time to 10 days, compared with 15 days with placebo.', S, 'faithful'),
    ('remdesivir', 'In the ACTT-1 trial, 1062 patients underwent randomization.', S, 'faithful'),
    ('remdesivir', 'Patients who received remdesivir had a median recovery time of 5 days.', C, 'number'),
    ('remdesivir', 'Serious adverse events were reported in 31.6% of the patients who received remdesivir.', C, 'swapped number'),
    ('remdesivir', 'Remdesivir was inferior to placebo in shortening the time to recovery.', C, 'reversed'),
    ('tirzepatide', 'With 15-mg doses of tirzepatide, mean body weight fell by 20.9% at week 72, compared with 3.1% with placebo.', S, 'faithful'),
    ('tirzepatide', 'SURMOUNT-1 assigned 2539 adults with obesity to once-weekly tirzepatide or placebo for 72 weeks.', S, 'faithful'),
    ('tirzepatide', 'With 15-mg doses of tirzepatide, mean body weight fell by 35.9% at week 72.', C, 'number'),
    ('tirzepatide', 'With 5-mg doses of tirzepatide, the mean percentage change in weight at week 72 was -20.9%.', C, 'swapped number'),
    ('tirzepatide', 'The most common adverse events with tirzepatide were neurological.', C, 'reversed'),
    ('semaglutide', 'Adults treated with once-weekly semaglutide 2.4 mg lost 14.9% of their body weight by week 68, compared with 2.4% with placebo.', S, 'faithful'),
    ('semaglutide', 'Semaglutide 2.4 mg produced a mean change in body weight of -24.9% by week 68.', C, 'number'),
    ('semaglutide', 'Weight loss with semaglutide was no greater than with placebo.', C, 'reversed'),
    ('aspree', 'Daily low-dose aspirin did not prolong disability-free survival in healthy elderly persons.', S, 'faithful'),
    ('aspree', 'Aspirin led to a higher rate of major hemorrhage than placebo (3.8% vs. 2.8%).', S, 'faithful'),
    ('aspree', 'Daily low-dose aspirin significantly prolonged disability-free survival in healthy elderly persons.', C, 'reversed'),
    ('aspree', 'Aspirin reduced the rate of major hemorrhage compared with placebo.', C, 'reversed'),
    ('aspree', 'A total of 9,114 persons were enrolled in the aspirin trial.', C, 'number'),
    ('vital', 'Vitamin D supplementation did not lower the incidence of invasive cancer or major cardiovascular events.', S, 'faithful'),
    ('vital', 'Vitamin D supplementation at 2000 IU per day substantially reduced the risk of invasive cancer.', C, 'reversed'),
    ('vital', 'The vitamin D trial randomized 52,871 participants.', C, 'number'),
    ('empareg', 'Empagliflozin reduced death from cardiovascular causes, a 38% relative risk reduction compared with placebo.', S, 'faithful'),
    ('empareg', 'Patients receiving empagliflozin had an increased rate of genital infection.', S, 'faithful'),
    ('empareg', 'Empagliflozin produced a 58% relative risk reduction in death from cardiovascular causes.', C, 'number'),
    ('empareg', 'Empagliflozin significantly lowered the rates of myocardial infarction and stroke.', C, 'reversed'),
    ('ardila', 'The lung cancer model achieved a 94.4% area under the curve on 6,716 National Lung Cancer Screening Trial cases.', S, 'faithful'),
    ('ardila', 'Without prior CT imaging, the model outperformed all six radiologists, with absolute reductions of 11% in false positives and 5% in false negatives.', S, 'faithful'),
    ('ardila', 'The lung cancer model achieved an area under the curve of 84.4%.', C, 'number'),
    ('ardila', 'When prior CT imaging was available, the model clearly outperformed the radiologists.', C, 'reversed'),
    ('defauw', "After training on only 14,884 OCT scans, the system's referral recommendations reached or exceeded expert performance on sight-threatening retinal diseases.", S, 'faithful'),
    ('defauw', 'The OCT referral system was trained on 148,840 scans.', C, 'number'),
    ('defauw', 'Referral accuracy dropped substantially when tissue segmentations from a different type of device were used.', C, 'reversed'),
    ('yolo', 'Remdesivir shortened median recovery time to 10 days in hospitalized Covid-19 patients.', U, 'wrong paper'),
    ('vital', 'Fast YOLO processes 155 frames per second.', U, 'wrong paper'),
    ('aspree', 'CLIP was pre-trained on 400 million image-text pairs.', U, 'wrong paper'),
    ('gan', 'Tirzepatide reduced body weight by 20.9% at the 15-mg dose.', U, 'wrong paper'),
    ('empareg', 'LLaMA-13B outperforms GPT-3 on most benchmarks.', U, 'wrong paper'),
    ('seq2seq', 'Daily low-dose aspirin increased the rate of major hemorrhage in older adults.', U, 'wrong paper'),
    ('maskrcnn', 'Semaglutide 2.4 mg once weekly reduced body weight by 14.9% over 68 weeks.', U, 'wrong paper'),
    ('remdesivir', 'Pushing convolutional network depth to 16-19 weight layers improved image recognition accuracy.', U, 'wrong paper'),
    ('defauw', 'Mask R-CNN runs at 5 fps and extends Faster R-CNN with a mask branch.', U, 'wrong paper'),
    ('ardila', 'Vitamin D supplementation did not reduce the incidence of invasive cancer.', U, 'wrong paper'),
    ('semaglutide', 'Participants in STEP 1 were enrolled at 129 sites in 16 countries.', P, 'not in abstract'),
    ('yolo', 'YOLO divides each input image into a 7x7 grid of cells.', P, 'not in abstract'),
    ('vgg', 'The VGG networks were trained on four NVIDIA Titan Black GPUs.', P, 'not in abstract'),
    ('clip', 'CLIP was trained with a contrastive objective using minibatches of 32,768 image-text pairs.', P, 'not in abstract'),
    ('remdesivir', 'ACTT-1 enrolled patients at 60 trial sites in 10 countries.', P, 'not in abstract'),
]


def real_paper_suite(name, papers, cases):
    found, rows, by_kind = {}, [], defaultdict(lambda: [0, 0])
    for key, raw in papers.items():
        found[key], _ = main.resolve_reference(db, main.parse_reference("[1] " + raw, 1), True)
    for key, claim, expected, kind in cases:
        pp = found.get(key)
        got = main.evaluate(claim, pp, None, depth=1)["verdict"] if pp is not None and pp.abstract else "SOURCE NOT RETRIEVED"
        rows.append({"case": "[%s %s] %s" % (key, kind, claim), "expected": expected, "got": got, "ok": got == expected, "kind": kind})
        by_kind[kind][0] += got == expected
        by_kind[kind][1] += 1
    scorecard(name, rows)
    print("   by type: " + ", ".join("%s %d/%d" % (k, v[0], v[1]) for k, v in by_kind.items()))
    rules = sum(1 for (key, claim, expected, kind) in cases if found.get(key) is not None and found[key].abstract
                and main.evaluate_rules(claim, found[key])["verdict"] == expected)
    RESULTS[name]["rules_only_accuracy"] = round(100.0 * rules / len(cases), 1)
    print("   rule engine alone on the same cases: %d/%d (%.1f%%)" % (rules, len(cases), 100.0 * rules / len(cases)))


if args.offline and (want(6) or want(7)):
    print("\n== 6-7. Real published papers: skipped (--offline)")
else:
    if want(6):
        real_paper_suite("6. Real papers - development set", DEV_PAPERS, DEV_CASES)
    if want(7):
        real_paper_suite("7. Real papers - held-out set", HELDOUT_PAPERS, HELDOUT_CASES)

# ---------------------------------------------------------------- 8. SciFact benchmark
if (args.scifact and not ONLY) or 8 in ONLY:
    data = os.path.join(TMP, "scifact")
    os.makedirs(data, exist_ok=True)
    blob = urllib.request.urlopen("https://scifact.s3-us-west-2.amazonaws.com/release/latest/data.tar.gz", timeout=120).read()
    with tarfile.open(fileobj=io.BytesIO(blob)) as tf:
        for m in tf.getmembers():
            if m.name.endswith((".jsonl",)) and "/" in m.name and ".." not in m.name:
                tf.extract(m, data)
    ddir = os.path.join(data, "data")
    corpus = {json.loads(l)["doc_id"]: json.loads(l) for l in open(os.path.join(ddir, "corpus.jsonl"))}
    pairs = []
    for line in open(os.path.join(ddir, "claims_dev.jsonl")):
        c = json.loads(line)
        for doc_id in c.get("cited_doc_ids", []):
            ev = c.get("evidence", {}).get(str(doc_id))
            pairs.append((c["claim"], corpus[doc_id], ev[0]["label"] if ev else "NEI"))
    MAP = {"SUPPORTED": "SUPPORT", "POTENTIALLY OUTDATED": "SUPPORT", "CONTRADICTORY": "CONTRADICT", "UNSUPPORTED": "NEI",
           "NEEDS HUMAN REVIEW": "NEI", "PARTIALLY SUPPORTED": "NEI"}

    def run(fn):
        conf = Counter()
        for i, (claim, doc, gold) in enumerate(pairs):
            pp = main.Paper(id=-(i + 1), key="scifact:%s" % doc["doc_id"], title=doc["title"], abstract=" ".join(doc["abstract"]),
                            sections="[]", cites="[]", authors="[]", year=None, simulated=False, source="scifact")
            conf[(gold, MAP[fn(claim, pp)["verdict"]])] += 1
        acc = sum(conf[(g, g)] for g in ("SUPPORT", "CONTRADICT", "NEI")) / len(pairs)
        f1 = []
        for lab in ("SUPPORT", "CONTRADICT", "NEI"):
            tp = conf[(lab, lab)]
            pp_ = sum(v for (g, q), v in conf.items() if q == lab)
            ap_ = sum(v for (g, q), v in conf.items() if g == lab)
            P_, R_ = (tp / pp_ if pp_ else 0), (tp / ap_ if ap_ else 0)
            f1.append(2 * P_ * R_ / (P_ + R_) if P_ + R_ else 0)
        return round(100 * acc, 1), round(sum(f1) / 3, 3), {"%s->%s" % k: v for k, v in conf.items()}

    t = time.time()
    rule_acc, rule_f1, _ = run(lambda c, p: main.evaluate_rules(c, p))
    hyb_acc, hyb_f1, conf = run(lambda c, p: main.evaluate(c, p, None, depth=1))
    RESULTS["8. SciFact dev benchmark"] = {"pairs": len(pairs), "rules_only": {"accuracy": rule_acc, "macro_f1": rule_f1},
                                           "hybrid": {"accuracy": hyb_acc, "macro_f1": hyb_f1}, "confusion": conf}
    print("\n== 8. SciFact dev (%d expert-labelled claim/abstract pairs, %.0fs)" % (len(pairs), time.time() - t))
    print("   rule engine alone : accuracy %.1f%%, macro-F1 %.3f" % (rule_acc, rule_f1))
    print("   CiteVerify hybrid : accuracy %.1f%%, macro-F1 %.3f" % (hyb_acc, hyb_f1))

# ---------------------------------------------------------------- summary
print("\n" + "=" * 72)
for name, r in RESULTS.items():
    if "passed" in r:
        print("%-45s %4d/%-4d %6.1f%%" % (name, r["passed"], r["total"], r["accuracy"]))
    else:
        print("%-45s hybrid acc %.1f%% (rules only %.1f%%)" % (name, r["hybrid"]["accuracy"], r["rules_only"]["accuracy"]))
core = [r for r in RESULTS.values() if "passed" in r]
if core:
    tot = sum(r["total"] for r in core)
    print("%-45s %4d/%-4d %6.1f%%" % ("All CiteVerify test cases", sum(r["passed"] for r in core), tot, 100.0 * sum(r["passed"] for r in core) / tot))
if args.json:
    json.dump(RESULTS, open(args.json, "w"), indent=1)
    print("results written to", args.json)
