import time
from typing import Any, Optional


class InMemoryCache:
    def __init__(self, max_items: int = 30):
        self._store: dict[str, dict] = {}
        self._max_items = max_items

    def get(self, key: str) -> Optional[Any]:
        """キャッシュから取得、TTL切れはNoneを返す"""
        if key not in self._store:
            return None
        entry = self._store[key]
        if time.time() > entry["expires_at"]:
            del self._store[key]
            return None
        return entry["data"]

    def set(self, key: str, data: Any, ttl: int = 3600) -> None:
        """TTL付きでキャッシュに保存。max_items超過時は最も古いエントリを削除（LRU）"""
        if len(self._store) >= self._max_items and key not in self._store:
            oldest_key = min(self._store, key=lambda k: self._store[k]["expires_at"])
            del self._store[oldest_key]
        self._store[key] = {
            "data": data,
            "expires_at": time.time() + ttl,
        }

    def clear(self, key: Optional[str] = None) -> None:
        """特定キャッシュまたは全削除"""
        if key:
            self._store.pop(key, None)
        else:
            self._store.clear()

    def info(self) -> dict:
        """キャッシュ情報を返す"""
        valid_keys = [
            k for k, v in self._store.items() if time.time() <= v["expires_at"]
        ]
        return {"total_entries": len(valid_keys), "keys": valid_keys}


cache = InMemoryCache(max_items=30)
