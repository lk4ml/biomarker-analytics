"""AI Research Report — SSE streaming endpoint.

Generates a structured research report by:
1. Fetching real data from 7 database sources (with step-by-step progress events)
2. Passing all data as context to Claude for narration
3. Streaming the LLM-generated markdown back token-by-token

The LLM ONLY narrates data that was fetched from the DB — it does not generate data.
"""
import json
import time

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import get_settings
from app.services.strategy_data import (
    fetch_trial_summary,
    fetch_cutoff_landscape,
    fetch_druggability,
    fetch_evidence,
    fetch_assay_landscape,
    fetch_genetic_context,
    fetch_publications,
)

router = APIRouter(prefix="/api/research", tags=["research"])


def _sse(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data)}\n\n"


def _summarize_step(step_id: str, data) -> str:
    """Generate a human-readable summary for a completed data-gathering step."""
    if step_id == "trial_summary":
        return f"{data.get('total', 0)} trials, {data.get('recruiting', 0)} recruiting"
    elif step_id == "cutoff_landscape":
        n_cutoffs = len(data.get("dominantCutoffs", []))
        n_assays = len(data.get("assaysUsed", []))
        return f"{n_cutoffs} cutoff patterns, {n_assays} assays used"
    elif step_id == "druggability":
        score = data.get("overallScore", 0)
        n_approved = data.get("totalApproved", 0)
        n_pipeline = len(data.get("pipelineDrugs", []))
        return f"OT score {score:.0%}, {n_approved} approved drugs, {n_pipeline} in pipeline"
    elif step_id == "evidence":
        return f"{data.get('total', 0)} evidence records across {len(data.get('byLevel', {}))} confidence levels"
    elif step_id == "assay_landscape":
        n_fda = len(data.get("fdaApproved", []))
        n_ruo = len(data.get("researchUse", []))
        return f"{n_fda} FDA-approved CDx, {n_ruo} research-use platforms"
    elif step_id == "genetic_context":
        n_variants = len(data.get("gwasVariants", []))
        genes = ", ".join(data.get("geneSymbols", [])[:3])
        return f"{n_variants} GWAS variants for {genes}" if genes else "No gene mapping available"
    elif step_id == "publications":
        return f"{len(data)} PubMed articles found"
    return ""


def _build_system_prompt(indication: str, biomarker: str, all_data: dict) -> str:
    """Build the system prompt that constrains Claude to narrate real data only."""
    return f"""You are BiomarkerScope's AI research analyst. Generate a structured research report
for {biomarker} in {indication} based EXCLUSIVELY on the following real database data.

CRITICAL RULES:
- ONLY state facts present in the data below. Never fabricate numbers, drug names, trial IDs, or statistics.
- Use inline citations in markdown link format: [NCT04380701](nct:NCT04380701), [PMID:12345](pmid:12345), [osimertinib](drug:osimertinib)
- Structure your report with these exact markdown headings (## level):
  ## Executive Summary
  ## Trial Landscape
  ## Cutoff Intelligence
  ## Druggability Assessment
  ## Evidence Synthesis
  ## Genetic Context
  ## Recent Publications
  ## Strategic Recommendations
- Be specific with numbers — cite exact counts, scores, and percentages from the data.
- For Strategic Recommendations, synthesize insights across all data sections.
- Keep each section focused and analytical — this is for biomarker strategy teams.
- Write in a professional, data-driven tone. No fluff or generic statements.

DATA CONTEXT (from BiomarkerScope's cross-database aggregation):

{json.dumps(all_data, indent=2, default=str)}"""


def _build_citation_index(all_data: dict) -> list:
    """Extract all citable references from the collected data."""
    citations = []
    cid = 0

    # Trial NCT IDs (from year trend we don't have individual NCTs, but from publications we might)
    for pub in all_data.get("publications", []):
        cid += 1
        citations.append({
            "id": f"c{cid}",
            "source": "pubmed",
            "ref_type": "pmid",
            "ref_id": pub.get("pmid", ""),
            "display": f"PMID:{pub.get('pmid', '')}"
        })

    # Approved drugs
    for drug in all_data.get("druggability", {}).get("approvedDrugs", []):
        cid += 1
        citations.append({
            "id": f"c{cid}",
            "source": "open_targets",
            "ref_type": "drug",
            "ref_id": drug.get("name", ""),
            "display": drug.get("name", "")
        })

    # GWAS variants
    for var in all_data.get("geneticContext", {}).get("gwasVariants", []):
        cid += 1
        citations.append({
            "id": f"c{cid}",
            "source": "gwas",
            "ref_type": "variant",
            "ref_id": var.get("rsId", ""),
            "display": var.get("rsId", "")
        })

    return citations


def generate_report_stream(db: Session, indication: str, biomarker: str):
    """Generator that yields SSE events for the research report pipeline."""
    settings = get_settings()

    steps = [
        ("trial_summary", "Querying ClinicalTrials.gov trial data...", fetch_trial_summary, True),
        ("cutoff_landscape", "Analyzing biomarker cutoff landscape...", fetch_cutoff_landscape, True),
        ("druggability", "Cross-referencing Open Targets druggability...", fetch_druggability, True),
        ("evidence", "Loading cancer biomarker evidence levels...", fetch_evidence, True),
        ("assay_landscape", "Scanning companion diagnostic landscape...", fetch_assay_landscape, False),
        ("genetic_context", "Retrieving GWAS variant associations...", fetch_genetic_context, False),
        ("publications", "Searching PubMed literature...", fetch_publications, True),
    ]

    all_data = {}
    total_start = time.time()

    # Phase 1: Data gathering with step-by-step progress
    for step_id, label, fetch_fn, needs_indication in steps:
        yield _sse({"type": "step", "id": step_id, "status": "running", "label": label})

        step_start = time.time()
        try:
            if needs_indication:
                data = fetch_fn(db, indication, biomarker)
            else:
                data = fetch_fn(db, biomarker)
            all_data[step_id] = data
            duration = int((time.time() - step_start) * 1000)
            summary = _summarize_step(step_id, data)
            yield _sse({
                "type": "step", "id": step_id, "status": "complete",
                "duration_ms": duration, "summary": summary
            })
        except Exception as e:
            yield _sse({"type": "step", "id": step_id, "status": "error", "label": str(e)})

    # Phase 2: LLM synthesis
    yield _sse({
        "type": "step", "id": "llm_synthesis", "status": "running",
        "label": "Generating narrative report with Claude..."
    })
    synth_start = time.time()

    # Check if API key is available
    if not settings.anthropic_api_key:
        yield _sse({"type": "step", "id": "llm_synthesis", "status": "error",
                     "label": "ANTHROPIC_API_KEY not configured — cannot generate AI report"})
        # Emit a fallback markdown summary
        yield _sse({"type": "section_start", "section": "Data Summary", "title": "Data Summary"})
        fallback = _generate_fallback_summary(indication, biomarker, all_data)
        yield _sse({"type": "token", "content": fallback})
        yield _sse({"type": "section_end", "section": "Data Summary"})
        total_duration = int((time.time() - total_start) * 1000)
        yield _sse({"type": "done", "total_duration_ms": total_duration})
        return

    try:
        from anthropic import Anthropic
        client = Anthropic(api_key=settings.anthropic_api_key)

        system_prompt = _build_system_prompt(indication, biomarker, all_data)

        with client.messages.stream(
            model="claude-sonnet-4-5-20250929",
            max_tokens=4000,
            system=system_prompt,
            messages=[{"role": "user", "content": f"Generate the full research report for {biomarker} in {indication}. Be thorough but concise."}],
        ) as stream:
            current_section = None
            buffer = ""
            for text_chunk in stream.text_stream:
                # Detect section transitions from ## headings
                buffer += text_chunk
                if "\n## " in buffer or buffer.startswith("## "):
                    lines = buffer.split("\n")
                    for line in lines:
                        stripped = line.strip()
                        if stripped.startswith("## "):
                            section_name = stripped[3:].strip()
                            if current_section:
                                yield _sse({"type": "section_end", "section": current_section})
                            current_section = section_name
                            yield _sse({"type": "section_start", "section": section_name, "title": section_name})
                    buffer = ""

                yield _sse({"type": "token", "content": text_chunk})

        if current_section:
            yield _sse({"type": "section_end", "section": current_section})

        synth_duration = int((time.time() - synth_start) * 1000)
        yield _sse({
            "type": "step", "id": "llm_synthesis", "status": "complete",
            "duration_ms": synth_duration
        })

    except Exception as e:
        yield _sse({
            "type": "step", "id": "llm_synthesis", "status": "error",
            "label": f"LLM error: {str(e)}"
        })

    # Phase 3: Emit citation index
    citations = _build_citation_index(all_data)
    for cit in citations:
        yield _sse({"type": "citation", **cit})

    total_duration = int((time.time() - total_start) * 1000)
    yield _sse({"type": "done", "total_duration_ms": total_duration})


def _generate_fallback_summary(indication: str, biomarker: str, all_data: dict) -> str:
    """Generate a plain markdown summary when LLM is unavailable."""
    ts = all_data.get("trial_summary", {})
    drug = all_data.get("druggability", {})
    ev = all_data.get("evidence", {})
    pubs = all_data.get("publications", [])

    sections = []
    sections.append(f"## Data Summary for {biomarker} in {indication}\n")
    sections.append(f"*AI narrative unavailable (no API key). Showing raw data summary.*\n")

    sections.append(f"### Trial Landscape\n")
    sections.append(f"- **{ts.get('total', 0)}** total trials, **{ts.get('recruiting', 0)}** recruiting\n")
    if ts.get("topSponsors"):
        top = ", ".join(f"{s['name']} ({s['count']})" for s in ts["topSponsors"][:5])
        sections.append(f"- Top sponsors: {top}\n")

    sections.append(f"### Druggability\n")
    sections.append(f"- Overall score: **{drug.get('overallScore', 0):.0%}**\n")
    sections.append(f"- Approved drugs: **{drug.get('totalApproved', 0)}**\n")
    sections.append(f"- Pipeline drugs: **{len(drug.get('pipelineDrugs', []))}**\n")

    sections.append(f"### Evidence\n")
    sections.append(f"- **{ev.get('total', 0)}** evidence records\n")

    sections.append(f"### Publications\n")
    sections.append(f"- **{len(pubs)}** recent PubMed articles\n")

    return "\n".join(sections)


@router.get("/report")
def stream_research_report(
    indication: str,
    biomarker: str,
    db: Session = Depends(get_db),
):
    """
    Stream an AI-generated research report as Server-Sent Events.

    Query params:
      - indication: e.g. "NSCLC", "Breast Cancer"
      - biomarker: e.g. "EGFR", "BRCA1/2", "PD-L1"

    The endpoint:
    1. Fetches data from 7 database sources, emitting progress events
    2. Passes all data to Claude for narrative synthesis
    3. Streams the report markdown token-by-token
    """
    return StreamingResponse(
        generate_report_stream(db, indication, biomarker),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
