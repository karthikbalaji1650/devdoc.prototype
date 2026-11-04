"""Test management (suites, sections, cases, runs, milestones), stored in
Redis. Every write is checked against the ownership rules in
services/test_management.py."""

from typing import Any

from fastapi import APIRouter, Depends, Request
from starlette.responses import Response

from app.core.http import JsonResponse, no_content
from app.dependencies import CurrentUser, ServicesDep, json_body, require_user
from app.routers.common import get_route
from app.schemas.common import ErrorResponse
from app.schemas.openapi import request_body
from app.schemas.test_management import (
    CaseResponse,
    MilestoneModel,
    MilestoneResponse,
    ProjectModel,
    ProjectResponse,
    RunResponse,
    SectionResponse,
    SeedRequest,
    SnapshotResponse,
    SuiteResponse,
    TestCaseModel,
    TestRunModel,
    TestSectionModel,
    TestSuiteModel,
)

router = APIRouter(
    prefix="/api/test-management",
    tags=["test-management"],
    dependencies=[Depends(require_user)],
    responses={401: {"model": ErrorResponse}},
)
_write = {400: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}}
_delete = {403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}}


def _item(key: str, item: dict[str, Any]) -> Response:
    return JsonResponse({key: item})


@get_route(router, "", response_model=SnapshotResponse)
async def snapshot(services: ServicesDep) -> Response:
    """Every suite (with its sections and testCases), run and milestone."""
    return JsonResponse(await services.test_management.snapshot())


@router.post(
    "/seed",
    response_model=SnapshotResponse,
    responses={400: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
    openapi_extra=request_body(SeedRequest),
)
async def seed(request: Request, user: CurrentUser, services: ServicesDep) -> Response:
    return JsonResponse(await services.test_management.seed(user, json_body(request)))


# ── suites ─────────────────────────────────────────────────────────────
@router.put(
    "/suites/{suite_id}", response_model=SuiteResponse, responses=_write, openapi_extra=request_body(TestSuiteModel)
)
async def save_suite(suite_id: str, request: Request, user: CurrentUser, services: ServicesDep) -> Response:
    return _item("suite", await services.test_management.save_suite(user, suite_id, json_body(request)))


@router.delete("/suites/{suite_id}", status_code=204, responses=_delete)
async def delete_suite(suite_id: str, user: CurrentUser, services: ServicesDep) -> Response:
    """Deletes the suite with all of its sections and test cases."""
    await services.test_management.delete_suite(user, suite_id)
    return no_content()


@router.put(
    "/suites/{suite_id}/sections/{section_id}",
    response_model=SectionResponse,
    responses=_write,
    openapi_extra=request_body(TestSectionModel),
)
async def save_section(
    suite_id: str, section_id: str, request: Request, user: CurrentUser, services: ServicesDep
) -> Response:
    section = await services.test_management.save_section(user, suite_id, section_id, json_body(request))
    return _item("section", section)


@router.delete(
    "/suites/{suite_id}/sections/{section_id}", status_code=204, responses={**_delete, 409: {"model": ErrorResponse}}
)
async def delete_section(suite_id: str, section_id: str, user: CurrentUser, services: ServicesDep) -> Response:
    await services.test_management.delete_section(user, suite_id, section_id)
    return no_content()


@router.put(
    "/suites/{suite_id}/cases/{case_id}",
    response_model=CaseResponse,
    responses=_write,
    openapi_extra=request_body(TestCaseModel),
)
async def save_case(
    suite_id: str, case_id: str, request: Request, user: CurrentUser, services: ServicesDep
) -> Response:
    return _item("testCase", await services.test_management.save_case(user, suite_id, case_id, json_body(request)))


@router.delete("/suites/{suite_id}/cases/{case_id}", status_code=204, responses=_delete)
async def delete_case(suite_id: str, case_id: str, user: CurrentUser, services: ServicesDep) -> Response:
    await services.test_management.delete_case(user, suite_id, case_id)
    return no_content()


# ── projects, runs and milestones ────────────────────────────────────────────────
@router.put(
    "/projects/{project_id}",
    response_model=ProjectResponse,
    responses=_write,
    openapi_extra=request_body(ProjectModel),
)
async def save_project(project_id: str, request: Request, user: CurrentUser, services: ServicesDep) -> Response:
    item = await services.test_management.save_item(user, "projects", project_id, json_body(request))
    return _item("project", item)


@router.delete("/projects/{project_id}", status_code=204, responses={**_delete, 409: {"model": ErrorResponse}})
async def delete_project(project_id: str, user: CurrentUser, services: ServicesDep) -> Response:
    """Refused (409) while any suite still belongs to the project."""
    await services.test_management.delete_item(user, "projects", project_id)
    return no_content()


@router.put("/runs/{run_id}", response_model=RunResponse, responses=_write, openapi_extra=request_body(TestRunModel))
async def save_run(run_id: str, request: Request, user: CurrentUser, services: ServicesDep) -> Response:
    return _item("run", await services.test_management.save_item(user, "runs", run_id, json_body(request)))


@router.delete("/runs/{run_id}", status_code=204, responses=_delete)
async def delete_run(run_id: str, user: CurrentUser, services: ServicesDep) -> Response:
    await services.test_management.delete_item(user, "runs", run_id)
    return no_content()


@router.put(
    "/milestones/{milestone_id}",
    response_model=MilestoneResponse,
    responses=_write,
    openapi_extra=request_body(MilestoneModel),
)
async def save_milestone(milestone_id: str, request: Request, user: CurrentUser, services: ServicesDep) -> Response:
    item = await services.test_management.save_item(user, "milestones", milestone_id, json_body(request))
    return _item("milestone", item)


@router.delete("/milestones/{milestone_id}", status_code=204, responses=_delete)
async def delete_milestone(milestone_id: str, user: CurrentUser, services: ServicesDep) -> Response:
    await services.test_management.delete_item(user, "milestones", milestone_id)
    return no_content()
