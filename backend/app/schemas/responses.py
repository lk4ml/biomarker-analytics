"""Pydantic response schemas matching the frontend TypeScript interfaces."""
from pydantic import BaseModel, Field
from typing import Optional


# Matches src/types/index.ts: TrialBiomarkerUsage
class TrialBiomarkerUsageResponse(BaseModel):
    nctId: str
    trialTitle: str
    biomarkerName: str
    setting: str
    tumorType: str
    phase: str
    cutoffValue: str
    cutoffUnit: str
    cutoffOperator: str
    assayName: str
    assayManufacturer: str
    companionDiagnostic: bool
    sponsor: str
    status: str
    startYear: int
    endYear: Optional[int] = None


class PaginatedTrialBiomarkers(BaseModel):
    items: list[TrialBiomarkerUsageResponse]
    total: int
    page: int
    pageSize: int
    totalPages: int


# Matches src/types/index.ts: Biomarker
class BiomarkerResponse(BaseModel):
    id: str
    name: str
    aliases: list[str]
    category: str
    description: str
    geneSymbol: Optional[str] = None
    uniprotId: Optional[str] = None


# Matches src/types/index.ts: CutoffTrend
class CutoffTrendResponse(BaseModel):
    biomarkerName: str
    tumorType: str
    year: int
    cutoffValue: float
    cutoffUnit: str
    trialCount: int
    assay: str


# Matches src/types/index.ts: AssayInfo
class AssayInfoResponse(BaseModel):
    name: str
    manufacturer: str
    platform: str
    antibodyClone: Optional[str] = None
    fdaApproved: bool
    companionDiagnosticFor: list[str]
    biomarkers: list[str]


# Matches src/types/index.ts: GWASAssociation
class GWASAssociationResponse(BaseModel):
    rsId: str
    gene: str
    traitName: str
    pValue: float
    oddsRatio: Optional[float] = None
    riskAllele: str
    population: str
    pubmedId: str
    studyTitle: str
    biomarkerRelevance: str


# Matches src/types/index.ts: OpenTargetLink
class OpenTargetLinkResponse(BaseModel):
    targetId: str
    targetName: str
    diseaseId: str
    diseaseName: str
    associationScore: float
    datatypeScores: dict


# Matches src/types/index.ts: NewsUpdate
class NewsUpdateResponse(BaseModel):
    id: str
    title: str
    source: str
    date: str
    summary: str
    url: str
    biomarkers: list[str]
    tags: list[str]


class DashboardStatsResponse(BaseModel):
    totalTrials: int
    totalBiomarkers: int
    totalAssays: int
    fdaApprovedAssays: int
    recruitingCount: int
    biomarkerCounts: list[dict]
    settingDistribution: list[dict]
    yearDistribution: list[dict]
    sponsorDistribution: list[dict]
    phaseCounts: list[dict]
    indication: str


class PubMedArticleResponse(BaseModel):
    pmid: str
    title: str
    abstract: Optional[str] = None
    authors: list[str]
    journal: Optional[str] = None
    pubDate: Optional[str] = None
    biomarkerMentions: list[str]


class CivicEvidenceResponse(BaseModel):
    civicId: int
    geneName: str
    variantName: str
    diseaseName: str
    evidenceType: str
    evidenceLevel: str
    drugs: list[str]


class PipelineStatusResponse(BaseModel):
    pipelineName: str
    status: str
    startedAt: Optional[str] = None
    completedAt: Optional[str] = None
    recordsProcessed: int
    recordsCreated: int
