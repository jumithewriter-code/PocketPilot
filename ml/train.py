"""Train and evaluate PocketPilot's transaction categoriser.

Model: TF-IDF (word 1-2 grams, sublinear tf) + multinomial logistic regression.

Evaluation: rows are split by base phrase (`group`), so the validation set contains
phrases the model never saw in any wrapper form. This is stricter than a random
row split, but the data is still synthetic and template-derived: the scores below
are NOT evidence of real-world accuracy.

Outputs:
  artifacts/metrics.json             validation metrics (split model)
  ../web/src/ml/model.json           exported weights (model refit on all rows)
  ../web/src/ml/parity.json          Python predictions the TypeScript port must match
"""
import csv
import json
import random
import re
from pathlib import Path

import numpy as np
import sklearn
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score

HERE = Path(__file__).parent
SEED = 7


def normalise(text: str) -> str:
    """Lowercase and drop digits. Mirrored exactly in web/src/ml/classifier.ts."""
    return re.sub(r"\d+", " ", text.lower())


def make_vectorizer() -> TfidfVectorizer:
    return TfidfVectorizer(
        preprocessor=normalise,
        token_pattern=r"(?u)\b\w\w+\b",
        ngram_range=(1, 2),
        sublinear_tf=True,
        norm="l2",
    )


def make_model() -> LogisticRegression:
    return LogisticRegression(C=10.0, max_iter=3000)


def load():
    with (HERE / "data" / "transactions_synthetic.csv").open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    return [r["description"] for r in rows], [r["category"] for r in rows], [r["group"] for r in rows]


def main() -> None:
    X, y, groups = load()
    uniq = sorted(set(groups))
    random.Random(SEED).shuffle(uniq)
    val_groups = set(uniq[: int(len(uniq) * 0.2)])
    tr = [i for i, g in enumerate(groups) if g not in val_groups]
    va = [i for i, g in enumerate(groups) if g in val_groups]

    vec = make_vectorizer()
    Xtr = vec.fit_transform([X[i] for i in tr])
    clf = make_model().fit(Xtr, [y[i] for i in tr])
    Xva = vec.transform([X[i] for i in va])
    yva = [y[i] for i in va]
    pred = clf.predict(Xva)
    proba = clf.predict_proba(Xva)
    conf = proba.max(axis=1)
    correct = np.array([p == t for p, t in zip(pred, yva)])

    # Pick the review threshold: smallest value where kept predictions are >= 90% accurate.
    coverage = []
    threshold = None
    for th in [round(x, 2) for x in np.arange(0.2, 0.91, 0.05)]:
        keep = conf >= th
        if keep.sum() == 0:
            continue
        acc = float(correct[keep].mean())
        coverage.append({"threshold": th, "coverage": float(keep.mean()), "accuracy_on_kept": acc})
        if threshold is None and acc >= 0.9:
            threshold = th
    threshold = threshold or 0.5

    metrics = {
        "model": "TfidfVectorizer(word 1-2gram, sublinear_tf) + LogisticRegression(C=10)",
        "sklearn_version": sklearn.__version__,
        "data": "synthetic, template-derived; NOT real transactions",
        "n_rows": len(X),
        "n_train": len(tr),
        "n_validation": len(va),
        "split": "grouped by base phrase, 20% of phrases held out entirely",
        "validation_accuracy": accuracy_score(yva, pred),
        "validation_macro_f1": f1_score(yva, pred, average="macro"),
        "per_class": classification_report(yva, pred, output_dict=True, zero_division=0),
        "labels": list(clf.classes_),
        "confusion_matrix": confusion_matrix(yva, pred, labels=clf.classes_).tolist(),
        "confidence_threshold_for_review": threshold,
        "coverage_vs_accuracy": coverage,
        "caveat": "Validation phrases are drawn from the same synthetic generator as training phrases. "
        "These numbers show the pipeline works, not that it will be this accurate on real transactions.",
    }
    (HERE / "artifacts").mkdir(exist_ok=True)
    (HERE / "artifacts" / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(f"validation accuracy {metrics['validation_accuracy']:.3f}  macro-F1 {metrics['validation_macro_f1']:.3f}")
    print(f"rows {len(X)}  train {len(tr)}  val {len(va)}  review threshold {threshold}")

    # Refit on all rows for the exported model.
    vec = make_vectorizer()
    Xall = vec.fit_transform(X)
    clf = make_model().fit(Xall, y)
    vocab = vec.vocabulary_
    terms = {
        term: [round(float(vec.idf_[idx]), 6)] + [round(float(w), 5) for w in clf.coef_[:, idx]]
        for term, idx in vocab.items()
    }
    model = {
        "version": 1,
        "type": "tfidf-logreg",
        "trained_on": "synthetic",
        "classes": list(clf.classes_),
        "intercept": [round(float(b), 5) for b in clf.intercept_],
        "terms": terms,
        "lowConfidenceThreshold": threshold,
        "validation": {
            "accuracy": round(metrics["validation_accuracy"], 4),
            "macroF1": round(metrics["validation_macro_f1"], 4),
            "nValidation": len(va),
            "nTrain": len(tr),
        },
    }
    out = HERE.parent / "web" / "src" / "ml"
    out.mkdir(parents=True, exist_ok=True)
    (out / "model.json").write_text(json.dumps(model, separators=(",", ":")), encoding="utf-8")

    probe = [
        "Lunch at campus cafeteria", "Bus fare to university", "Mobile data subscription", "Course registration fee",
        "Cinema ticket", "mtn 1gb night plan", "pharmacy panadol", "transfer to piggyvest", "Keke to church N300",
        "zzzz qqqq", "bought new sneakers jumia", "NEPA token 5000", "suya and malt", "hostel rent balance",
        "gift for aunty", "", "12345", "Spotify", "uber home from party", "shawarma",
    ]
    P = clf.predict_proba(vec.transform(probe))
    parity = [
        {"text": t, "probs": [round(float(p), 6) for p in row], "label": str(clf.classes_[int(row.argmax())])}
        for t, row in zip(probe, P)
    ]
    (out / "parity.json").write_text(json.dumps({"classes": list(clf.classes_), "cases": parity}, indent=1), encoding="utf-8")
    size = (out / "model.json").stat().st_size / 1024
    print(f"exported model.json ({size:.0f} KB, {len(terms)} terms) and parity.json")


if __name__ == "__main__":
    main()
