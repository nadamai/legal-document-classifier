"""Shared fixtures. No test reads training/data/: every page, URL list and
feature set here is hand-written."""

from __future__ import annotations

from pathlib import Path

import pytest

import common
import evaluate
import scrape
import train


@pytest.fixture
def data_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Points every module's data paths at an empty folder, so a test can never
    touch the real training/data/. train.ROOT stays real, because featurize
    runs the repository's own tools/featurize.ts from it."""

    data = tmp_path / 'training' / 'data'

    for module in (common, scrape, evaluate):
        monkeypatch.setattr(module, 'ROOT', tmp_path)

    for module in (common, scrape, train, evaluate):
        monkeypatch.setattr(module, 'URLS', data / 'urls', raising=False)
        monkeypatch.setattr(
            module, 'CONTENTS', data / 'contents', raising=False
        )

    monkeypatch.setattr(common, 'DATA', data)
    monkeypatch.setattr(evaluate, 'DATA', data)
    monkeypatch.setattr(evaluate, 'REVIEW', data / 'review')

    return tmp_path
