from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class ConnectorError(RuntimeError):
    pass


class BaseConnector(ABC):
    key: str
    name: str

    def __init__(self, config: dict[str, Any]):
        self.config = config

    @abstractmethod
    def test_connection(self) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def discover(self) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def fetch_events(self, mapping: dict[str, Any]) -> list[dict[str, Any]]:
        raise NotImplementedError
