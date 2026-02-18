"""PubMed E-utilities enrichment pipeline."""
import json
import subprocess
import time
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime

from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.database import SessionLocal
from app.models.external import PubMedArticle

ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
EFETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"

SEARCH_QUERIES = {
    "NSCLC": "NSCLC biomarker clinical trial",
    "Breast Cancer": "breast cancer biomarker predictive",
    "Melanoma": "melanoma biomarker immunotherapy",
    "Colorectal Cancer": "colorectal cancer biomarker MSI KRAS",
    "Gastric Cancer": "gastric cancer biomarker HER2 PD-L1",
}

BIOMARKER_NAMES = ["PD-L1", "HER2", "EGFR", "KRAS", "BRAF", "ALK", "BRCA", "MSI", "TMB", "NTRK", "ctDNA"]


def curl_get(url, params=None, timeout=30):
    """GET via subprocess curl to avoid 403 from httpx."""
    if params:
        qs = urllib.parse.urlencode(params)
        url = f"{url}?{qs}"
    result = subprocess.run(
        ["curl", "-s", "--max-time", str(timeout), url],
        capture_output=True, text=True, timeout=timeout + 10
    )
    if result.returncode != 0:
        raise RuntimeError(f"curl failed: {result.stderr}")
    return result.stdout


def detect_biomarker_mentions(text: str) -> list[str]:
    text_lower = text.lower()
    found = []
    for bm in BIOMARKER_NAMES:
        if bm.lower() in text_lower:
            found.append(bm)
    return found


def fetch_pmids(query: str, max_results: int = 50) -> list[str]:
    params = {
        "db": "pubmed",
        "term": query,
        "retmax": str(max_results),
        "retmode": "json",
        "sort": "relevance",
        "datetype": "pdat",
        "mindate": "2020",
        "maxdate": "2026",
    }
    raw = curl_get(ESEARCH, params=params)
    data = json.loads(raw)
    return data.get("esearchresult", {}).get("idlist", [])


def fetch_articles(pmids: list[str]) -> list[dict]:
    if not pmids:
        return []
    params = {
        "db": "pubmed",
        "id": ",".join(pmids),
        "retmode": "xml",
        "rettype": "abstract",
    }
    raw = curl_get(EFETCH, params=params)
    articles = []

    try:
        root = ET.fromstring(raw)
        for article in root.findall(".//PubmedArticle"):
            medline = article.find(".//MedlineCitation")
            if medline is None:
                continue

            pmid = medline.findtext(".//PMID", "")
            art = medline.find(".//Article")
            if art is None:
                continue

            title = art.findtext(".//ArticleTitle", "")
            abstract_parts = art.findall(".//Abstract/AbstractText")
            abstract = " ".join(p.text or "" for p in abstract_parts if p.text)

            authors = []
            for author in art.findall(".//AuthorList/Author"):
                last = author.findtext("LastName", "")
                first = author.findtext("ForeName", "")
                if last:
                    authors.append(f"{last} {first}".strip())

            journal = art.findtext(".//Journal/Title", "")

            pub_date_elem = art.find(".//Journal/JournalIssue/PubDate")
            pub_date = None
            if pub_date_elem is not None:
                year = pub_date_elem.findtext("Year")
                month = pub_date_elem.findtext("Month", "01")
                if year:
                    month_map = {"Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04",
                                 "May": "05", "Jun": "06", "Jul": "07", "Aug": "08",
                                 "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12"}
                    m = month_map.get(month, month)
                    try:
                        pub_date = datetime.strptime(f"{year}-{m}-01", "%Y-%m-%d").date()
                    except Exception:
                        pass

            mesh_terms = [m.findtext("DescriptorName", "") for m in medline.findall(".//MeshHeadingList/MeshHeading")]

            combined = f"{title} {abstract}"
            bm_mentions = detect_biomarker_mentions(combined)

            articles.append({
                "pmid": pmid,
                "title": title,
                "abstract": abstract[:5000] if abstract else None,
                "authors": authors[:10],
                "journal": journal,
                "pub_date": pub_date,
                "mesh_terms": [m for m in mesh_terms if m],
                "biomarker_mentions": bm_mentions,
                "indication_mentions": [],
            })
    except ET.ParseError as e:
        print(f"  XML parse error: {e}")

    return articles


def run_pubmed_enrichment():
    print("--- PubMed Enrichment ---")
    db = SessionLocal()
    count = 0

    for indication, query in SEARCH_QUERIES.items():
        print(f"  Searching PubMed for: {indication}")
        pmids = fetch_pmids(query, max_results=30)
        print(f"    Found {len(pmids)} articles")

        if pmids:
            time.sleep(0.5)
            articles = fetch_articles(pmids)

            for art in articles:
                art["indication_mentions"] = [indication]
                stmt = pg_insert(PubMedArticle).values(**art)
                stmt = stmt.on_conflict_do_update(
                    index_elements=["pmid"],
                    set_={"biomarker_mentions": stmt.excluded.biomarker_mentions}
                )
                db.execute(stmt)
                count += 1

            db.commit()

        time.sleep(1.0)  # Rate limiting: 3 req/sec

    db.close()
    print(f"  Stored {count} PubMed articles")


if __name__ == "__main__":
    run_pubmed_enrichment()
