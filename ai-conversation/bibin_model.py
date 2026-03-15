import os
import subprocess
import time
from typing import Optional
from urllib.error import URLError
from urllib.request import urlopen

import ollama

class BibinModel:
    def __init__(self, model_name="bibin:latest", host: Optional[str] = None):
        self.host = host or os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434")
        self._ensure_local_ollama()
        self.client = ollama.Client(host=self.host)
        self.model_name = model_name

    def _healthcheck(self) -> bool:
        try:
            with urlopen(f"{self.host}/api/tags", timeout=1.5):
                return True
        except (URLError, TimeoutError, OSError):
            return False

    def _ensure_local_ollama(self, timeout_seconds: float = 12.0) -> None:
        if self._healthcheck():
            return

        try:
            subprocess.Popen(
                ["ollama", "serve"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
        except FileNotFoundError as exc:
            raise RuntimeError(
                "Ollama CLI was not found. Install Ollama and ensure 'ollama' is on PATH."
            ) from exc

        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            if self._healthcheck():
                return
            time.sleep(0.25)

        raise RuntimeError(
            f"Local Ollama endpoint did not become ready at {self.host} within {timeout_seconds} seconds."
        )

    def chat(self, message: str, history: Optional[list] = None) -> str:
        # Build messages from history + new message
        history = history or []
        messages = []
        for entry in history:
            messages.append({
                "role": entry["role"] if entry["role"] != "bibin" else "assistant",
                "content": entry["content"]
            })
        messages.append({"role": "user", "content": message})

        try:
            response = self.client.chat(
                model=self.model_name,
                messages=messages
            )
        except Exception:
            # If Ollama died after init, restart once and retry this same call.
            self._ensure_local_ollama()
            response = self.client.chat(
                model=self.model_name,
                messages=messages
            )

        # Correct path into Ollama's response object
        return response["message"]["content"]