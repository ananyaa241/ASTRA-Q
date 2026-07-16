"""
Astra-Q File Hex Header Validator
====================================
Validates file content headers against expected magic bytes for filename extensions.

Per dataset spec:
  - Content field format: "hex_header keyword1 keyword2 ..."
  - File header correlates with filename extension
  - Microsoft Office file types all share the same header: 4d5a9000 (MZ)
  - Mismatches between hex header and extension indicate suspicious/malicious files

Key suspicious pattern from scenarios:
  - A file with a .txt or .jpg extension but header '4d5a9000' = PE executable
    disguised as innocuous file → high suspicion indicator
"""

from __future__ import annotations

import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────
# Magic Byte → Expected Extension Groups
# ─────────────────────────────────────────────────────────────────
MAGIC_TO_EXTENSIONS: Dict[str, list[str]] = {
    # MS Office / PE executables (as per CERT dataset spec)
    "4d5a9000": [".exe", ".dll", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
                  ".msi", ".com", ".bat"],

    # PDF
    "25504446": [".pdf"],

    # ZIP / Office Open XML (OOXML — modern Office formats also use ZIP)
    "504b0304": [".zip", ".docx", ".xlsx", ".pptx", ".jar", ".apk", ".odt"],

    # JPEG
    "ffd8ffe0": [".jpg", ".jpeg"],
    "ffd8ffe1": [".jpg", ".jpeg"],
    "ffd8ffdb": [".jpg", ".jpeg"],

    # PNG
    "89504e47": [".png"],

    # GIF
    "47494638": [".gif"],

    # MP3
    "494433xx": [".mp3"],

    # RAR
    "52617221": [".rar"],

    # 7-Zip
    "377abcaf": [".7z"],

    # Plain text / CSV (no magic bytes — skip validation)
    "":         [".txt", ".csv", ".log", ".md"],
}

# Reverse mapping: extension → expected hex headers
EXTENSION_TO_MAGIC: Dict[str, list[str]] = {}
for magic, exts in MAGIC_TO_EXTENSIONS.items():
    for ext in exts:
        if ext not in EXTENSION_TO_MAGIC:
            EXTENSION_TO_MAGIC[ext] = []
        if magic:
            EXTENSION_TO_MAGIC[ext].append(magic)

# Files that should always be flagged regardless of extension
ALWAYS_SUSPICIOUS_HEADERS = {
    "4d5a9000",  # PE executable disguised as something else
}

# Extensions where ANY mismatch is a red flag
HIGH_RISK_MISMATCH_EXTENSIONS = {
    ".txt", ".csv", ".log", ".jpg", ".jpeg", ".png", ".gif",
    ".pdf", ".mp3", ".mp4",
}


class FileHexValidator:
    """
    Validates content hex headers from file.csv against filename extensions.

    Returns True if the file is SUSPICIOUS (mismatch detected).
    """

    def validate(self, hex_header: str, filename: str) -> bool:
        """
        Validate a hex header against the expected magic bytes for the file extension.

        Args:
            hex_header: First 8 hex characters from content field (e.g., '4d5a9000')
            filename: Filename string (e.g., 'report.txt')

        Returns:
            True if SUSPICIOUS (mismatch between header and extension)
        """
        hex_header = hex_header.strip().lower()
        filename = filename.strip().lower()

        # Extract extension
        ext = self._get_extension(filename)
        if not ext:
            return False  # No extension — cannot validate

        # Empty header for non-text files is suspicious
        if not hex_header and ext not in [".txt", ".csv", ".log", ".md"]:
            return False  # Missing header — treat as unknown, not suspicious

        # PE header in non-executable file = SUSPICIOUS
        if hex_header in ALWAYS_SUSPICIOUS_HEADERS:
            if ext not in [".exe", ".dll", ".msi", ".com", ".bat"]:
                logger.warning(
                    f"[HexValidator] SUSPICIOUS: PE header '{hex_header}' "
                    f"in file with extension '{ext}' (filename: {filename})"
                )
                return True

        # Check expected magic bytes for the extension
        expected_headers = EXTENSION_TO_MAGIC.get(ext, [])
        if not expected_headers:
            return False  # Unknown extension — cannot validate

        # Verify header matches any expected magic
        header_prefix = hex_header[:8] if len(hex_header) >= 8 else hex_header
        for expected in expected_headers:
            if header_prefix.startswith(expected[:8]):
                return False  # Valid match — not suspicious

        # No match found for this extension
        if ext in HIGH_RISK_MISMATCH_EXTENSIONS:
            logger.warning(
                f"[HexValidator] SUSPICIOUS: Extension '{ext}' "
                f"does not match header '{hex_header}' (filename: {filename})"
            )
            return True

        return False

    def validate_cert_content(self, content: str, filename: str) -> bool:
        """
        Parse CERT file.csv content field and validate.
        Content format: "hex_header keyword1 keyword2 ..."
        """
        if not content:
            return False
        parts = content.strip().split(" ", 1)
        hex_header = parts[0] if parts else ""
        return self.validate(hex_header, filename)

    @staticmethod
    def _get_extension(filename: str) -> str:
        """Extract lowercase extension from filename."""
        if "." not in filename:
            return ""
        return "." + filename.rsplit(".", 1)[-1].lower()

    def get_threat_multiplier(self, hex_header: str, filename: str) -> float:
        """
        Return a threat score multiplier based on header/extension analysis.
        1.0 = normal, >1.0 = elevated risk.
        """
        if not self.validate(hex_header, filename):
            return 1.0

        hex_header = hex_header.strip().lower()

        # PE executable disguised as innocuous = highest risk
        if hex_header in ALWAYS_SUSPICIOUS_HEADERS:
            ext = self._get_extension(filename)
            if ext in HIGH_RISK_MISMATCH_EXTENSIONS:
                return 3.5  # Strong indicator: likely keylogger/malware

        return 2.0  # Generic mismatch

