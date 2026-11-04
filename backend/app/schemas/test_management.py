"""Wire shapes for /api/test-management (see frontend src/types/operations.ts).
Only the fields the server checks or sets are listed; everything else the
client sends is stored as is (WireModel allows extra fields)."""

from app.schemas.common import WireModel


class _Owned(WireModel):
    id: str
    createdBy: str
    updatedAt: str


class TestSectionModel(WireModel):
    __test__ = False
    title: str
    suiteId: str | None = None
    parentId: str | None = None
    order: int | None = None


class TestCaseModel(WireModel):
    __test__ = False
    title: str
    customId: str | None = None
    suiteId: str | None = None
    sectionId: str | None = None


class TestSuiteModel(WireModel):
    __test__ = False
    title: str
    description: str | None = None
    module: str | None = None
    projectId: str | None = None


class TestRunModel(WireModel):
    __test__ = False
    name: str
    suiteId: str | None = None


class MilestoneModel(WireModel):
    name: str


class ProjectModel(WireModel):
    name: str
    description: str | None = None


class StoredSection(TestSectionModel, _Owned):
    pass


class StoredCase(TestCaseModel, _Owned):
    pass


class SavedSuite(TestSuiteModel, _Owned):
    """A suite as PUT returns it: its sections and cases are saved separately."""


class StoredSuite(SavedSuite):
    sections: list[StoredSection]
    testCases: list[StoredCase]


class StoredRun(TestRunModel, _Owned):
    pass


class StoredMilestone(MilestoneModel, _Owned):
    pass


class StoredProject(ProjectModel, _Owned):
    pass


class SnapshotResponse(WireModel):
    projects: list[StoredProject]
    suites: list[StoredSuite]
    runs: list[StoredRun]
    milestones: list[StoredMilestone]
    seeded: bool


class SeedRequest(WireModel):
    projects: list[ProjectModel] | None = None
    suites: list[TestSuiteModel]
    runs: list[TestRunModel]
    milestones: list[MilestoneModel]


class SuiteResponse(WireModel):
    suite: SavedSuite


class SectionResponse(WireModel):
    section: StoredSection


class CaseResponse(WireModel):
    testCase: StoredCase


class RunResponse(WireModel):
    run: StoredRun


class ProjectResponse(WireModel):
    project: StoredProject


class MilestoneResponse(WireModel):
    milestone: StoredMilestone
