"""
Astra-Q Feature Builder
=========================
Constructs 47-dimensional user behavioral feature vectors from raw events,
hydrates them into the Redis feature cache, and assembles graph neighborhoods
for HeteroGCN input.

Feature Vector Composition (47 dimensions):
  Temporal (8):
    avg_login_time, std_login_time, after_hours_ratio, weekend_ratio,
    logon_frequency, logoff_frequency, session_duration_avg, session_count_7d

  Device (6):
    device_connect_count, device_above_baseline, device_exfil_risk,
    unique_devices, removable_drive_ratio, device_after_hours_ratio

  Network (8):
    http_count, suspicious_domain_visits, external_email_count,
    email_to_external_ratio, attachment_avg_size, email_frequency,
    unique_recipients, cc_bcc_anomaly_score

  File (7):
    file_copy_count, file_above_baseline, suspicious_file_ratio,
    unique_file_types, large_file_copies, after_hours_file_copies,
    exfil_content_score

  Graph (8):
    shared_machine_logins, lateral_movement_score, unique_machines_accessed,
    login_to_others_machine, graph_degree, betweenness_proxy,
    community_deviation, anomalous_edges

  Psychometric (5):
    psych_O, psych_C, psych_E, psych_A, psych_N (all normalized [0,1])

  Temporal Profile (5):
    days_since_hire, termination_risk_score, activity_trend_7d,
    behavior_change_score, baseline_deviation_z
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from backend.cache.redis_cache import FeatureCache

logger = logging.getLogger(__name__)

FEATURE_DIM = 47  # Total feature dimensions


class UserFeatureBuilder:
    """
    Aggregates raw events into 47-dim behavioral feature vectors
    and hydrates the Redis feature cache.
    """

    def __init__(self, cache: FeatureCache) -> None:
        self.cache = cache
        self._user_events: Dict[str, List[Dict]] = defaultdict(list)
        self._user_baselines: Dict[str, Dict] = {}
        self._psychometric_lookup: Dict[str, Dict[str, float]] = {}

    def load_psychometric(
        self, normalized_psych_df  # pandas DataFrame
    ) -> None:
        """Pre-load normalized psychometric scores into memory lookup."""
        for _, row in normalized_psych_df.iterrows():
            uid = str(row.get("user_id", row.get("employee_id", "")))
            if uid:
                self._psychometric_lookup[uid] = {
                    "O": float(row.get("O", 0.5)),
                    "C": float(row.get("C", 0.5)),
                    "E": float(row.get("E", 0.5)),
                    "A": float(row.get("A", 0.5)),
                    "N": float(row.get("N", 0.5)),
                }

    def ingest_event(self, event: Dict[str, Any]) -> None:
        """Buffer an incoming event for feature computation."""
        user_id = event.get("user_id", "")
        if user_id:
            self._user_events[user_id].append(event)

    def build_feature_vector(self, user_id: str) -> np.ndarray:
        """
        Build the 47-dimensional feature vector for a user from buffered events.
        """
        events = self._user_events.get(user_id, [])
        vec = np.zeros(FEATURE_DIM, dtype=np.float32)

        if not events:
            return vec

        # ── Temporal Features (indices 0-7) ──────────────────────
        logon_events = [e for e in events if e.get("source") == "logon"]
        logon_times = [e.get("minutes_from_midnight", 720) for e in logon_events]

        vec[0] = np.mean(logon_times) if logon_times else 540.0       # avg login time
        vec[1] = np.std(logon_times) if logon_times else 0.0          # std login time
        vec[2] = np.mean([e.get("is_after_hours", False) for e in events])  # after_hours_ratio
        vec[3] = np.mean([e.get("is_weekend", False) for e in events])      # weekend_ratio
        vec[4] = len([e for e in events if e.get("event_type") == "logon"]) / max(len(events), 1)
        vec[5] = len([e for e in events if e.get("event_type") == "logoff"]) / max(len(events), 1)
        vec[6] = self._compute_avg_session_duration(events)            # session_duration_avg
        vec[7] = float(len(logon_events))                              # session_count_7d

        # ── Device Features (indices 8-13) ───────────────────────
        device_events = [e for e in events if e.get("source") == "device"]
        connect_count = len([e for e in device_events if "connect" in e.get("event_type", "")])

        vec[8] = float(connect_count)                                  # device_connect_count
        vec[9] = self._above_baseline(user_id, "device_count", connect_count)
        vec[10] = float(connect_count > 0 and any(                    # device_exfil_risk
            e.get("is_after_hours") for e in device_events
        ))
        vec[11] = len(set(e.get("pc_id", "") for e in device_events)) # unique_devices
        vec[12] = connect_count / max(len(events), 1)                  # removable_drive_ratio
        vec[13] = np.mean([e.get("is_after_hours", False) for e in device_events]) if device_events else 0.0

        # ── Network Features (indices 14-21) ─────────────────────
        http_events = [e for e in events if e.get("source") == "http"]
        email_events = [e for e in events if e.get("source") == "email"]
        external_emails = [e for e in email_events if e.get("is_external")]

        vec[14] = float(len(http_events))                              # http_count
        vec[15] = len([e for e in http_events if e.get("is_suspicious_domain")])  # suspicious_domain_visits
        vec[16] = float(len(external_emails))                          # external_email_count
        vec[17] = len(external_emails) / max(len(email_events), 1)    # email_to_external_ratio
        vec[18] = np.mean([e.get("size_bytes", 0) for e in email_events]) if email_events else 0.0
        vec[19] = float(len(email_events))                             # email_frequency
        vec[20] = len(set(
            addr for e in email_events for addr in e.get("to_addrs", [])
        ))                                                              # unique_recipients
        vec[21] = np.mean([                                            # cc_bcc_anomaly_score
            1.0 if e.get("attachment_count", 0) > 2 else 0.0
            for e in email_events
        ]) if email_events else 0.0

        # ── File Features (indices 22-28) ─────────────────────────
        file_events = [e for e in events if e.get("source") == "file"]
        suspicious_files = [e for e in file_events if e.get("is_suspicious_file")]

        vec[22] = float(len(file_events))                              # file_copy_count
        vec[23] = self._above_baseline(user_id, "file_count", len(file_events))
        vec[24] = len(suspicious_files) / max(len(file_events), 1)    # suspicious_file_ratio
        vec[25] = len(set(                                             # unique_file_types
            e.get("filename", "").rsplit(".", 1)[-1]
            for e in file_events if "." in e.get("filename", "")
        ))
        vec[26] = float(len([e for e in file_events                    # large_file_copies
            if e.get("file_size_bytes", 0) > 10_000_000
        ]))
        vec[27] = float(sum(1 for e in file_events if e.get("is_after_hours")))
        vec[28] = float(len(suspicious_files))                         # exfil_content_score

        # ── Graph Features (indices 29-36) ────────────────────────
        all_pcs = set(e.get("pc_id", "") for e in events if e.get("pc_id"))
        assigned_pc = self._user_baselines.get(user_id, {}).get("assigned_pc", "")
        other_pcs = [pc for pc in all_pcs if pc != assigned_pc and pc]

        vec[29] = float(len([e for e in events                        # shared_machine_logins
            if e.get("pc_id", "") != assigned_pc and e.get("source") == "logon"
        ]))
        vec[30] = float(len(other_pcs))                                # lateral_movement_score
        vec[31] = float(len(all_pcs))                                  # unique_machines_accessed
        vec[32] = float(len(other_pcs) > 0)                           # login_to_others_machine
        vec[33] = float(len(all_pcs))                                  # graph_degree (proxy)
        vec[34] = 0.0                                                  # betweenness_proxy (computed externally)
        vec[35] = 0.0                                                  # community_deviation
        vec[36] = float(len(other_pcs))                                # anomalous_edges

        # ── Psychometric Features (indices 37-41) ─────────────────
        psych = self._psychometric_lookup.get(user_id, {
            "O": 0.5, "C": 0.5, "E": 0.5, "A": 0.5, "N": 0.5
        })
        vec[37] = psych["O"]
        vec[38] = psych["C"]
        vec[39] = psych["E"]
        vec[40] = psych["A"]
        vec[41] = psych["N"]

        # ── Temporal Profile (indices 42-46) ──────────────────────
        vec[42] = 0.0                                                  # days_since_hire (from LDAP)
        vec[43] = float(any(                                           # termination_risk_score
            "wikileaks" in str(e.get("url", "")).lower() or
            "dropbox" in str(e.get("url", "")).lower()
            for e in http_events
        ))
        vec[44] = self._activity_trend(events)                        # activity_trend_7d
        vec[45] = self._behavior_change_score(user_id, events)        # behavior_change_score
        vec[46] = self._baseline_deviation_z(user_id, events)         # baseline_deviation_z

        return vec

    async def hydrate_cache(self, user_ids: Optional[List[str]] = None) -> int:
        """
        Build feature vectors for users and hydrate Redis cache.
        Returns number of users cached.
        """
        if user_ids is None:
            user_ids = list(self._user_events.keys())

        cached = 0
        for uid in user_ids:
            vec = self.build_feature_vector(uid)
            feature_dict = {
                "vector": vec.tolist(),
                "dim": FEATURE_DIM,
                "user_id": uid,
            }
            ok = await self.cache.set_user_features(uid, feature_dict)

            # Also cache psychometric separately for quick lookup
            if uid in self._psychometric_lookup:
                await self.cache.set_user_psychometric(
                    uid, self._psychometric_lookup[uid]
                )

            if ok:
                cached += 1

        logger.info(f"[FeatureBuilder] Hydrated {cached}/{len(user_ids)} users into cache")
        return cached

    # ─────────────────────────────────────────────────────
    # Private Helpers
    # ─────────────────────────────────────────────────────

    def _compute_avg_session_duration(self, events: List[Dict]) -> float:
        """Estimate average session duration in minutes from logon/logoff pairs."""
        logon_times = {}
        durations = []
        for ev in sorted(events, key=lambda e: str(e.get("event_time", ""))):
            etype = str(ev.get("event_type", "")).lower()
            pc = ev.get("pc_id", "")
            t = ev.get("minutes_from_midnight", 0)
            if etype == "logon":
                logon_times[pc] = t
            elif etype in ("logoff", "disconnect") and pc in logon_times:
                dur = t - logon_times.pop(pc)
                if 0 < dur < 720:  # Reasonable session: <12h
                    durations.append(dur)
        return float(np.mean(durations)) if durations else 480.0

    def _above_baseline(
        self, user_id: str, metric: str, current_value: float
    ) -> float:
        """
        Computes how much current_value deviates above the user's baseline.
        Returns 0.0 if no baseline established.
        """
        baseline = self._user_baselines.get(user_id, {})
        baseline_val = baseline.get(metric, current_value)
        if baseline_val == 0:
            return float(current_value > 0)
        return max(0.0, (current_value - baseline_val) / baseline_val)

    def _activity_trend(self, events: List[Dict]) -> float:
        """Ratio of recent activity (last 1/3 of window) vs. early (first 1/3)."""
        n = len(events)
        if n < 6:
            return 0.0
        third = n // 3
        early = len(events[:third])
        recent = len(events[-third:])
        if early == 0:
            return 1.0
        return (recent - early) / early  # Positive = increasing activity

    def _behavior_change_score(self, user_id: str, events: List[Dict]) -> float:
        """
        Score [0, 1] measuring deviation from established behavioral norms.
        Based on ratio of after-hours events relative to baseline.
        """
        after_hours = sum(1 for e in events if e.get("is_after_hours"))
        total = max(len(events), 1)
        current_ratio = after_hours / total
        baseline_ratio = self._user_baselines.get(user_id, {}).get(
            "after_hours_ratio", 0.05
        )
        return min(1.0, abs(current_ratio - baseline_ratio) / max(baseline_ratio, 0.01))

    def _baseline_deviation_z(self, user_id: str, events: List[Dict]) -> float:
        """Z-score normalized deviation from baseline event count."""
        current_count = float(len(events))
        baseline = self._user_baselines.get(user_id, {})
        mu = baseline.get("event_count_mean", current_count)
        sigma = baseline.get("event_count_std", 1.0)
        if sigma == 0:
            return 0.0
        z = (current_count - mu) / sigma
        return float(np.tanh(z / 3.0))  # Squash to [-1, 1]

