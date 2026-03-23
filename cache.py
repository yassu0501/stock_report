import time
from typing import Any, Optional


class InMemoryCache:
    def __init__(self):
        self._store: dict[str, dict] = {}

    def get(self, key: str) -> Optional[Any]:
        """キャッシュから取得、TTL切れはNoneを返す"""
        if key not in self._store:
            return None
        entry = self._store[key]
        if time.time() > entry["expires_at"]:
            del self._store[key]
            return None
        return entry["data"]

    def set(self, key: str, data: Any, ttl: int = 60) -> None:
        """TTL付きでキャッシュに保存"""
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
        # 期限切れエントリを除外してカウント
        valid_keys = [
            k for k, v in self._store.items() if time.time() <= v["expires_at"]
        ]
        return {"total_entries": len(valid_keys), "keys": valid_keys}


cache = InMemoryCache()
